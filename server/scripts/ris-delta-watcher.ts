#!/usr/bin/env bun
/**
 * RIS Delta-Watcher — täglicher inkrementeller Sync des Legal-Corpus.
 *
 * Nutzt die RIS OGD REST API mit `ImRisSeit` um neue/geänderte Dokumente
 * zu erkennen, holt das XML, schreibt es als Markdown auf Disk und markiert
 * es für den Import in die DB via `markiereZumImport`.
 *
 * Workflow pro Applikation:
 *   1. Cursor aus pipeline_state lesen (last_cycle_at)
 *   2. ImRisSeit-Intervall wählen (EinerWoche … EinemJahr)
 *   3. Paginiert alle geänderten Dokumente holen
 *   4. Client-side Filter: nur changedAt > cursor
 *   5. Für jedes Dokument: XML holen → Markdown bauen → auf Disk schreiben
 *   6. markiereZumImport aufrufen (für corpus-pipeline import stage)
 *   7. Cursor updaten in pipeline_state
 *   8. Alert bei Gap > Threshold oder Fehler
 *
 * RIS OGD Compliance:
 *   - acquireRisLock für single-connection mode
 *   - 1.5s Pause zwischen Requests (via ris-proxy.ts)
 *   - User-Agent gesetzt
 *   - Massendownload außerhalb Bürozeiten (Cron: 04:00 UTC = 06:00 CEST)
 *
 * Usage:
 *   bun scripts/ris-delta-watcher.ts --once              # ein Zyklus, alle Applikationen
 *   bun scripts/ris-delta-watcher.ts --once --applikation BrKons  # nur Bundesrecht
 *   bun scripts/ris-delta-watcher.ts --dry-run           # nur erkennen, nicht schreiben
 *   bun scripts/ris-delta-watcher.ts --reset-cursor BrKons       # Cursor zurücksetzen
 *   bun scripts/ris-delta-watcher.ts --report-only       # nur Status, kein Sync
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { dump as yamlDump } from "js-yaml";

import {
  fetchDelta,
  DELTA_APPLIKATIONS,
  formatDeltaSummary,
  type DeltaApplikation,
  type DeltaDocument,
  type DeltaResult,
} from "./ris-delta";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import {
  fetchWithRetry,
  risXmlToText,
  atomicWrite,
  contentHash,
  validateFetchedText,
  contentMatchesDocument,
} from "./backfill-utils";

// ── Config ─────────────────────────────────────────────────────────────

const _scriptDir = dirname(fileURLToPath(import.meta.url));
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? join(_scriptDir, "..", "..", "law-corpus");
const SERVER_DIR = join(_scriptDir, "..");

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const DRY_RUN = args.includes("--dry-run");
const REPORT_ONLY = args.includes("--report-only");
const applikationIdx = args.indexOf("--applikation");
const ONLY_APPLIKATION = applikationIdx >= 0 ? args[applikationIdx + 1] : null;
const resetIdx = args.indexOf("--reset-cursor");
const RESET_CURSOR = resetIdx >= 0 ? args[resetIdx + 1] : null;

const RIS_UA = { "User-Agent": getUserAgent() };
const GAP_ALERT_THRESHOLD = 50;

// ── DB Helpers (gleicher Pattern wie corpus-pipeline.ts) ───────────────

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

function dbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(SERVER_DIR, ".env"), "utf-8");
    const m = env.match(/postgres(?:ql)?:\/\/[^\s"']+/);
    if (!m) throw new Error("No postgres URL in server/.env");
    return m[0];
  } catch {
    throw new Error("No DATABASE_URL env var and no postgres URL in server/.env");
  }
}

function psqlQuery(query: string): string {
  const tmpFile = `/tmp/psql_delta_${process.pid}_${Date.now()}.sql`;
  writeFileSync(tmpFile, query, "utf-8");
  try {
    return sh(`psql ${JSON.stringify(dbUrl())} -q -t -A -f ${JSON.stringify(tmpFile)}`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

function psqlJSON(query: string): Record<string, unknown>[] {
  const raw = psqlQuery(query);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function ensureSourceRow(key: string): void {
  psqlQuery(
    `INSERT INTO pipeline_state (source_key) VALUES ('${key}') ON CONFLICT (source_key) DO NOTHING`
  );
}

function getCursor(stateKey: string): string | null {
  const rows = psqlJSON(
    `SELECT last_cycle_at FROM pipeline_state WHERE source_key = '${stateKey}'`
  );
  if (Array.isArray(rows) && rows.length > 0 && rows[0].last_cycle_at) {
    return rows[0].last_cycle_at;
  }
  return null;
}

function updateCursor(stateKey: string, cursor: string): void {
  psqlQuery(
    `UPDATE pipeline_state SET last_cycle_at = '${cursor}', updated_at = NOW() WHERE source_key = '${stateKey}'`
  );
}

function resetCursor(stateKey: string): void {
  psqlQuery(
    `UPDATE pipeline_state SET last_cycle_at = NULL, updated_at = NOW() WHERE source_key = '${stateKey}'`
  );
}

function raiseAlert(stateKey: string, type: string, severity: string, message: string): void {
  const alert = { type, severity, message, raised_at: new Date().toISOString() };
  psqlQuery(
    `UPDATE pipeline_state SET alert_flags =
       COALESCE(alert_flags, '[]'::jsonb) || '${JSON.stringify(alert).replace(/'/g, "''")}'::jsonb,
       updated_at = NOW()
     WHERE source_key = '${stateKey}'`
  );
  console.log(`  ⚠️ ALERT [${severity}] ${stateKey}: ${type} — ${message}`);
}

function clearAlerts(stateKey: string, type: string): void {
  psqlQuery(
    `UPDATE pipeline_state SET alert_flags =
       COALESCE(
         (SELECT jsonb_agg(elem) FROM jsonb_array_elements(alert_flags) AS elem
          WHERE elem->>'type' != '${type.replace(/'/g, "''")}'),
         '[]'::jsonb
       ),
       updated_at = NOW()
     WHERE source_key = '${stateKey}'`
  );
}

function appendHistory(stateKey: string, stage: string, action: string): void {
  psqlQuery(
    `SELECT append_stage_history('${stateKey}', '${stage.replace(/'/g, "''")}', '${action.replace(/'/g, "''")}')`
  );
}

// ── Import-Queue (markiereZumImport aus corpus-import-queue.ts) ────────

const WARTESCHLANGE_DATEI = join(CORPUS_ROOT, "_normalized", "_import-warteschlange.json");

function markiereZumImport(pfad: string, art: "edit" | "create" = "edit"): void {
  let eintraege: Array<{ pfad: string; benutzer: string; seit: string; art: string }> = [];
  if (existsSync(WARTESCHLANGE_DATEI)) {
    try {
      eintraege = JSON.parse(readFileSync(WARTESCHLANGE_DATEI, "utf-8"));
    } catch {
      eintraege = [];
    }
  }
  const eintrag = { pfad, benutzer: "ris-delta-watcher", seit: new Date().toISOString(), art };
  const i = eintraege.findIndex((e) => e.pfad === pfad);
  if (i >= 0) eintraege[i] = eintrag;
  else eintraege.push(eintrag);
  mkdirSync(dirname(WARTESCHLANGE_DATEI), { recursive: true });
  // BUG 67: atomic write (tmp + rename) — wie corpus-import-queue.ts (BUG 13).
  const tmp = `${WARTESCHLANGE_DATEI}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(eintraege, null, 2), "utf-8");
  renameSync(tmp, WARTESCHLANGE_DATEI);
}

// ── XML Fetch + Markdown Build ─────────────────────────────────────────

async function fetchXml(url: string): Promise<string | null> {
  const proxyOpts = proxyFetchOptions();
  const res = await fetchWithRetry(url, {
    headers: RIS_UA,
    maxRetries: 3,
    timeoutMs: 30_000,
    proxyFetchOptions: proxyOpts,
  });
  if (!res || !res.ok) return null;
  return res.text();
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function normKey(apa: string | null): string | null {
  if (!apa) return null;
  const s = apa.trim();
  if (/^§+\s*0\s*$/.test(s)) return null;
  const teile: string[] = [];
  const rx = /(§+|Art\.?|Anl\.?)\s*([0-9]+[a-zA-Z]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(s)) !== null) {
    const art = m[1].toLowerCase();
    const praefix = art.startsWith("§") ? "p" : art.startsWith("art") ? "art" : "anl";
    teile.push(`${praefix}-${m[2].toLowerCase()}`);
  }
  if (teile.length === 0) return null;
  return teile.join("-");
}

function esc(s: string): string {
  return s.replace(/"/g, '\\"');
}

/**
 * Baut das Markdown für ein Bundesrecht-Dokument (Norm).
 * Folgt demselben Frontmatter-Schema wie ris-xml-fetch-normen.ts.
 */
export function buildStatuteMarkdown(doc: DeltaDocument, xmlText: string): string {
  const text = risXmlToText(xmlText);
  const titel = doc.kurztitel || doc.id;
  const apa = doc.artikelParagraphAnlage || "";

  const fm: string[] = [
    `title: "${esc(titel)}"`,
    `type: law`,
    `jurisdiction: at`,
    `gesetzesnummer: "${doc.gesetzesnummer || ""}"`,
    `nor_id: "${doc.id}"`,
    `id: "ris-${doc.id}"`,
  ];
  if (apa) fm.push(`paragraph: "${esc(apa)}"`);
  if (doc.inkrafttreten) fm.push(`inkrafttretensdatum: "${doc.inkrafttreten}"`);
  if (doc.ausserkrafttreten) fm.push(`ausserkrafttretensdatum: "${doc.ausserkrafttreten}"`);
  if (doc.ausserkrafttreten) fm.push(`deprecated: true`);
  fm.push(`source_url: "${doc.dokumentUrl || doc.xmlUrl || ""}"`);
  fm.push(`source_format: xml`);
  fm.push(`retrieved_at: "${new Date().toISOString().slice(0, 10)}"`);
  fm.push(`zuletzt_geaendert: "${doc.changedAt}"`);
  fm.push(
    `license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`
  );
  fm.push(`content_hash: "${contentHash(text)}"`);

  return `---\n${fm.join("\n")}\n---\n\n# ${titel}${apa ? ` — ${apa}` : ""}\n\n${text}\n`;
}

/**
 * Baut das Markdown für ein Judikatur-Dokument (Entscheidung).
 * Folgt demselben Frontmatter-Schema wie fetch-all-at-judikatur.ts.
 */
export function buildJudikaturMarkdown(doc: DeltaDocument, xmlText: string): string {
  const text = risXmlToText(xmlText) || "*Volltext nicht abrufbar — siehe Quelle.*";
  const az = doc.geschaeftszahl || doc.id;
  const title = `${doc.applikation} — ${az}`;

  const frontmatter = yamlDump(
    {
      type: "court_decision",
      jurisdiction: "at",
      court_type: doc.applikation.toLowerCase(),
      title,
      court: doc.applikation,
      date: doc.changedAt,
      decision_date: doc.changedAt,
      ecli: "",
      case_number: az,
      source: "ris-ogd",
      source_url: doc.dokumentUrl || doc.xmlUrl || "",
      nor_id: doc.id,
      id: `ris-${doc.id}`,
      zuletzt_geaendert: doc.changedAt,
    },
    { lineWidth: -1, noRefs: true }
  ).trimEnd();

  return `---\n${frontmatter}\n---\n\n# ${title}\n\n${text}\n\n---\n*Quelle: [RIS-OGD](${doc.dokumentUrl || doc.xmlUrl})*\n`;
}

/**
 * Baut das Markdown für ein Landesrecht-Dokument.
 */
export function buildLandesrechtMarkdown(doc: DeltaDocument, xmlText: string): string {
  const text = risXmlToText(xmlText);
  const titel = doc.kurztitel || doc.id;
  const apa = doc.artikelParagraphAnlage || "";

  const fm: string[] = [
    `title: "${esc(titel)}"`,
    `type: law`,
    `jurisdiction: at`,
    `gesetzesnummer: "${doc.gesetzesnummer || ""}"`,
    `nor_id: "${doc.id}"`,
    `id: "ris-${doc.id}"`,
  ];
  if (apa) fm.push(`paragraph: "${esc(apa)}"`);
  if (doc.inkrafttreten) fm.push(`inkrafttretensdatum: "${doc.inkrafttreten}"`);
  if (doc.ausserkrafttreten) fm.push(`ausserkrafttretensdatum: "${doc.ausserkrafttreten}"`);
  if (doc.ausserkrafttreten) fm.push(`deprecated: true`);
  fm.push(`source_url: "${doc.dokumentUrl || doc.xmlUrl || ""}"`);
  fm.push(`source_format: xml`);
  fm.push(`retrieved_at: "${new Date().toISOString().slice(0, 10)}"`);
  fm.push(`zuletzt_geaendert: "${doc.changedAt}"`);
  fm.push(
    `license: "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung."`
  );
  fm.push(`content_hash: "${contentHash(text)}"`);

  return `---\n${fm.join("\n")}\n---\n\n# ${titel}${apa ? ` — ${apa}` : ""}\n\n${text}\n`;
}

/**
 * Bestimmt den Dateipfad für ein Delta-Dokument.
 * Für Bundesrecht: <corpusDir>/<slug-or-gnr>/<key>.md
 * Für Judikatur: <corpusDir>/<changedAt>-<slug>.md
 * Für Landesrecht: <corpusDir>/<slug-or-gnr>/<key>.md
 */
export function docFilePath(app: DeltaApplikation, doc: DeltaDocument): string {
  const corpusDir = join(CORPUS_ROOT, app.corpusDir);

  if (app.endpoint === "Judikatur") {
    // Pfad OHNE Datum — verhindert Duplikate wenn sich changedAt ändert.
    // Bisherige Dateien mit Datum-Prefix müssen migriert werden (siehe migrate-judikatur-paths.ts).
    const slug = slugify(doc.geschaeftszahl || doc.id);
    return join(corpusDir, `${slug}.md`);
  }

  // Bundesrecht / Landesrecht
  const apa = doc.artikelParagraphAnlage;
  const key = normKey(apa) || doc.id.toLowerCase();
  const subDir = doc.gesetzesnummer
    ? `gnr-${doc.gesetzesnummer}`
    : slugify(doc.kurztitel || doc.id);
  return join(corpusDir, subDir, `${key}.md`);
}

/**
 * Verarbeitet ein einzelnes Delta-Dokument:
 *   1. XML holen (falls URL vorhanden)
 *   2. Text validieren
 *   3. Markdown bauen
 *   4. Auf Disk schreiben (atomic)
 *   5. markiereZumImport
 *
 * Returns true bei Erfolg, false bei Fehler.
 */
async function processDocument(app: DeltaApplikation, doc: DeltaDocument): Promise<boolean> {
  if (!doc.xmlUrl) {
    console.warn(`  ⚠️ Keine XML-URL für ${doc.id} (${app.applikation}) — überspringe`);
    return false;
  }

  const xml = await fetchXml(doc.xmlUrl);
  if (!xml || xml.length < 100) {
    console.warn(`  ⚠️ XML leer/fehlerhaft für ${doc.id} — überspringe`);
    return false;
  }

  // Markdown bauen je nach Endpoint
  let markdown: string;
  if (app.endpoint === "Judikatur") {
    markdown = buildJudikaturMarkdown(doc, xml);
  } else if (app.endpoint === "Landesrecht") {
    markdown = buildLandesrechtMarkdown(doc, xml);
  } else {
    markdown = buildStatuteMarkdown(doc, xml);
  }

  // Validiere den extrahierten Text (nur bei Normen, nicht bei Judikatur-Platzhaltern)
  if (app.endpoint !== "Judikatur") {
    const text = risXmlToText(xml);
    const validation = validateFetchedText(text);
    if (!validation.valid) {
      console.warn(`  ⚠️ Text invalid für ${doc.id}: ${validation.reason} — überspringe`);
      return false;
    }
  }

  // Content-Identity-Check für Judikatur: verhindert falsche Dokumente unter korrektem Frontmatter
  // (HTTP 200 mit Fehlerseite statt echtem Entscheidungstext — der 2026-07-15 Vorfall)
  if (app.endpoint === "Judikatur" && doc.geschaeftszahl) {
    const text = risXmlToText(xml);
    if (!contentMatchesDocument(text, { case_number: doc.geschaeftszahl })) {
      console.warn(
        `  ⚠️ Content-Identity-Check fehlgeschlagen für ${doc.id} (GZ ${doc.geschaeftszahl} nicht im Text) — überspringe`
      );
      return false;
    }
  }

  const filepath = docFilePath(app, doc);
  const relPath = filepath.replace(CORPUS_ROOT + "/", "");

  if (DRY_RUN) {
    console.log(`  [DRY] Würde schreiben: ${relPath}`);
    return true;
  }

  // Atomic write
  mkdirSync(dirname(filepath), { recursive: true });
  atomicWrite(filepath, markdown);

  // Für Import markieren (corpus-pipeline import stage wird es abholen)
  markiereZumImport(relPath, "edit");

  return true;
}

// ── Main ───────────────────────────────────────────────────────────────

async function syncApplikation(
  app: DeltaApplikation
): Promise<DeltaResult & { written: number; failed: number; skipped: number }> {
  const cursor = getCursor(app.stateKey);
  console.log(`\n═══ ${app.label} (${app.applikation}) ═══`);
  console.log(`  Cursor: ${cursor || "(keiner — erster Lauf)"}`);

  ensureSourceRow(app.stateKey);

  if (REPORT_ONLY) {
    const result = await fetchDelta(app, cursor);
    console.log(`  ${formatDeltaSummary(result)}`);
    return { ...result, written: 0, failed: 0, skipped: 0 };
  }

  // RIS Lock holen (serialisiert mit anderen RIS-Scripts)
  await acquireRisLock();
  console.log(`  ✅ RIS-Lock erhalten`);

  try {
    const result = await fetchDelta(app, cursor);
    console.log(`  ${formatDeltaSummary(result)}`);

    if (result.documents.length === 0) {
      // Keine Änderungen — Cursor trotzdem updaten
      updateCursor(app.stateKey, result.newCursor);
      clearAlerts(app.stateKey, "delta_sync_failed");
      appendHistory(app.stateKey, "delta", "no changes");
      return { ...result, written: 0, failed: 0, skipped: 0 };
    }

    // Gap-Alert prüfen
    if (result.totalHits > result.documents.length + GAP_ALERT_THRESHOLD) {
      raiseAlert(
        app.stateKey,
        "delta_gap",
        "warning",
        `${result.totalHits} Hits auf RIS, aber nur ${result.documents.length} nach Cursor gefiltert — möglicherweise verpasste Deltas`
      );
    }

    // Dokumente verarbeiten
    let written = 0;
    let failed = 0;
    let skipped = 0;
    const seenIds = new Set<string>();

    for (const doc of result.documents) {
      // Dedup: RIS kann bei Paginierung-Overlap dasselbe Dokument mehrfach liefern
      if (seenIds.has(doc.id)) {
        skipped++;
        continue;
      }
      seenIds.add(doc.id);

      // In-Kraft-Filter: Normen mit Ausserkrafttretensdatum in der Vergangenheit
      // werden mit deprecated: true geschrieben (nicht gelöscht — historische Anfragen)
      if (doc.ausserkrafttreten) {
        const today = new Date().toISOString().slice(0, 10);
        if (doc.ausserkrafttreten <= today) {
          console.log(
            `  ⚠️ ${doc.id} ausserkraft seit ${doc.ausserkrafttreten} — wird als deprecated markiert`
          );
        }
      }

      const ok = await processDocument(app, doc);
      if (ok) written++;
      else failed++;

      if (written % 50 === 0 && written > 0) {
        process.stderr.write(
          `\r  ${written}/${result.documents.length} verarbeitet · ${failed} fehlgeschlagen`
        );
      }
    }

    if (written > 0)
      process.stderr.write(
        `\r  ${written}/${result.documents.length} verarbeitet · ${failed} fehlgeschlagen\n`
      );

    // Cursor updaten nur bei erfolgreicher Verarbeitung
    if (failed === 0) {
      updateCursor(app.stateKey, result.newCursor);
      clearAlerts(app.stateKey, "delta_sync_failed");
      clearAlerts(app.stateKey, "delta_gap");
      appendHistory(app.stateKey, "delta", `${written} docs synced`);
    } else if (written > 0) {
      // Teilweise erfolgreich — Cursor updaten, aber Alert
      updateCursor(app.stateKey, result.newCursor);
      raiseAlert(
        app.stateKey,
        "delta_sync_partial",
        "warning",
        `${written} synced, ${failed} failed`
      );
      appendHistory(app.stateKey, "delta", `${written} synced, ${failed} failed`);
    } else {
      // Alles fehlgeschlagen — Cursor NICHT updaten
      raiseAlert(
        app.stateKey,
        "delta_sync_failed",
        "error",
        `All ${result.documents.length} documents failed to sync`
      );
      appendHistory(app.stateKey, "delta", `failed (${failed} docs)`);
    }

    console.log(`  ✅ ${written} geschrieben, ${failed} fehlgeschlagen, ${skipped} übersprungen`);
    console.log(`  📌 Neuer Cursor: ${result.newCursor}`);

    return { ...result, written, failed, skipped };
  } catch (err) {
    raiseAlert(app.stateKey, "delta_sync_failed", "error", `Sync error: ${(err as Error).message}`);
    appendHistory(app.stateKey, "delta", `error: ${(err as Error).message}`);
    console.error(`  ❌ Sync fehlgeschlagen: ${(err as Error).message}`);
    throw err;
  } finally {
    releaseRisLock();
    console.log(`  🔓 RIS-Lock freigegeben`);
  }
}

async function main() {
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  RIS Delta-Watcher — ${new Date().toISOString()}`);
  console.log(`  Corpus: ${CORPUS_ROOT}`);
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN" : REPORT_ONLY ? "REPORT ONLY" : "SYNC"}`);
  console.log(`═══════════════════════════════════════════════════════════`);

  // Reset-Cursor-Modus
  if (RESET_CURSOR) {
    const app = DELTA_APPLIKATIONS.find((a) => a.applikation === RESET_CURSOR);
    if (!app) {
      console.error(`Unbekannte Applikation: ${RESET_CURSOR}`);
      console.error(`Verfügbar: ${DELTA_APPLIKATIONS.map((a) => a.applikation).join(", ")}`);
      process.exit(1);
    }
    ensureSourceRow(app.stateKey);
    resetCursor(app.stateKey);
    console.log(`✅ Cursor zurückgesetzt für ${app.applikation} (${app.stateKey})`);
    process.exit(0);
  }

  // Applikationen filtern
  const apps = ONLY_APPLIKATION
    ? DELTA_APPLIKATIONS.filter((a) => a.applikation === ONLY_APPLIKATION)
    : DELTA_APPLIKATIONS;

  if (apps.length === 0) {
    console.error(`Keine Applikation gefunden für: ${ONLY_APPLIKATION}`);
    process.exit(1);
  }

  const results: Array<{
    app: DeltaApplikation;
    result: Awaited<ReturnType<typeof syncApplikation>>;
  }> = [];
  const errors: string[] = [];

  for (const app of apps) {
    try {
      const result = await syncApplikation(app);
      results.push({ app, result });
    } catch (err) {
      errors.push(`${app.applikation}: ${(err as Error).message}`);
    }
  }

  // Summary
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  ZUSAMMENFASSUNG`);
  console.log(`═══════════════════════════════════════════════════════════`);

  let totalNew = 0;
  let totalChanged = 0;
  let totalWritten = 0;
  let totalFailed = 0;

  for (const { app, result } of results) {
    const newCount = result.documents.filter((d) => d.changeType === "new").length;
    const changedCount = result.documents.filter((d) => d.changeType === "changed").length;
    totalNew += newCount;
    totalChanged += changedCount;
    totalWritten += result.written;
    totalFailed += result.failed;

    console.log(
      `  ${app.applikation.padEnd(12)} ${String(result.documents.length).padStart(5)} docs (${newCount} neu, ${changedCount} geändert) → ${result.written} geschrieben, ${result.failed} fehlgeschlagen`
    );
  }

  console.log(
    `\n  Gesamt: ${totalNew + totalChanged} Dokumente (${totalNew} neu, ${totalChanged} geändert)`
  );
  console.log(`  Geschrieben: ${totalWritten} | Fehlgeschlagen: ${totalFailed}`);

  // Summary history entry — parsed by corpus-pipeline for notifications
  const applikationen = results.map((r) => r.app.applikation).join(",");
  appendHistory(
    "ris-delta",
    "delta",
    `summary: ${totalNew} neu, ${totalChanged} geändert, ${totalFailed} fehlgeschlagen, applikationen: ${applikationen}`
  );

  if (errors.length > 0) {
    console.log(`\n  ❌ Fehler:`);
    for (const e of errors) console.log(`    • ${e}`);
  }

  // Pipeline-Config-Trigger löschen (falls vom Dashboard ausgelöst)
  if (!DRY_RUN && !REPORT_ONLY) {
    psqlQuery("DELETE FROM pipeline_config WHERE key = 'delta_sync_triggered'");
  }

  console.log(`\n✅ Fertig: ${new Date().toISOString()}`);

  if (errors.length > 0 && !ONCE) process.exit(1);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
