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
 *   - 2 s Pause zwischen Requests (RIS_PAUSE_MS, ris-pace.ts)
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
  nextCursorAfterBatch,
  type DeltaApplikation,
  type DeltaDocument,
  type DeltaResult,
} from "./ris-delta";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { forwardAlert } from "./pipeline-alert";
import {
  clearFailure,
  isQuarantined,
  loadQuarantine,
  recordFailure,
  saveQuarantine,
  type DocFailure,
} from "./ris-delta-quarantine";
import { proxyFetchOptions, getUserAgent } from "./ris-proxy";
import { mapRisReference } from "../src/core/ingestion/connectors/legal-judgements.ts";
import {
  buildMarkdown as buildDecisionFile,
  decisionFileName,
  decisionTypeOf,
  dokumentnummerOf,
} from "./judikatur-file";
import { landOfDocId } from "./normalize/normalize-corpus";
import { buildTextMarkdown, textRefsOf } from "./fetch-entscheidungstexte";
import { RIS_PAUSE_MS } from "./ris-pace";
import { normKey, resolveBundesnormDir, resolveNormFileName, slugify } from "./ris-norm-paths";
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
// --once is accepted for CLI compatibility; every run is a single cycle.
const ONCE = args.includes("--once");
const DRY_RUN = args.includes("--dry-run");
const REPORT_ONLY = args.includes("--report-only");
const applikationIdx = args.indexOf("--applikation");
const ONLY_APPLIKATION = applikationIdx >= 0 ? args[applikationIdx + 1] : null;
const resetIdx = args.indexOf("--reset-cursor");
const RESET_CURSOR = resetIdx >= 0 ? args[resetIdx + 1] : null;

const RIS_UA = { "User-Agent": getUserAgent() };
const QUARANTINE_FILE = join(CORPUS_ROOT, "_state", "ris-delta-quarantine.json");
const GAP_ALERT_THRESHOLD = 50;

// ── DB Helpers (gleicher Pattern wie corpus-pipeline.ts) ───────────────

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch (err) {
    // Never silent: a failed state write (cursor, alert) must show in the log.
    console.error(`  ❌ Befehl fehlgeschlagen: ${(err as Error).message.split("\n")[0]}`);
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

/**
 * BUG (2026-09-23, go-live corpus audit): this used to run the bare SELECT
 * as-is. `psql -t -A` prints a plain timestamp for `SELECT last_cycle_at …`,
 * not JSON, so `JSON.parse` always threw and `getCursor()` always returned
 * null — every daily run re-fetched the last month from RIS instead of only
 * what changed since the last successful sync. Same fix as
 * `corpus-pipeline.ts`: auto-wrap in `json_agg`.
 */
function psqlJSON(query: string): Record<string, unknown>[] {
  const raw = psqlQuery(`SELECT json_agg(t) FROM (${query}) t`);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
    return String(rows[0].last_cycle_at);
  }
  return null;
}

function updateCursor(stateKey: string, cursor: string): void {
  const out = psqlQuery(
    `UPDATE pipeline_state SET last_cycle_at = '${cursor}', updated_at = NOW() WHERE source_key = '${stateKey}' RETURNING source_key`
  );
  // The run must not report success when the cursor was not stored.
  if (!out.includes(stateKey)) throw new Error(`Cursor für ${stateKey} nicht gespeichert`);
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
  // Webhook + ops mail (error/critical); awaited before the process exits.
  pendingAlerts.push(forwardAlert({ source: stateKey, ...alert }));
}

const pendingAlerts: Promise<unknown>[] = [];

/**
 * Exit code of a watcher run. Any application error, incomplete RIS fetch
 * or batch in which every document failed is a failure — also with --once,
 * which is how the pipeline starts it and how it learns about the outcome.
 * Exported for tests.
 */
export function deltaExitCode(input: {
  errors: string[];
  results: Array<{ complete: boolean; documents: unknown[]; written: number; failed: number }>;
}): number {
  if (input.errors.length > 0) return 1;
  for (const r of input.results) {
    if (!r.complete) return 1;
    if (r.documents.length > 0 && r.written === 0 && r.failed > 0) return 1;
  }
  return 0;
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
  // One document per pause — the watcher fetched back to back before.
  await new Promise((r) => setTimeout(r, RIS_PAUSE_MS));
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

// Same naming as the full fetch (ris-xml-fetch-normen.ts) — one module for both.
export { slugify, normKey };

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
  if (doc.abkuerzung) fm.push(`abbreviation: "${esc(doc.abkuerzung)}"`);
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
/** RIS document number of a corpus file, from its source_url. */
function dokNrOfFile(path: string): string | null {
  const url = readFileSync(path, "utf8")
    .slice(0, 2000)
    .match(/^source_url:\s*["']?([^\s"']+)/m)?.[1];
  return url ? dokumentnummerOf(url) : null;
}

/** RIS document numbers carry the decision date: JJR_20190326_… → 2019-03-26. */
export function decisionDateOfDocNr(id: string): string | null {
  const m = id.match(/^J[A-Z]{2}_(\d{4})(\d{2})(\d{2})_/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** RIS application → court key used by the corpus directories. */
const COURT_KEY: Record<string, string> = { Justiz: "ogh" };

/**
 * Baut das Markdown für ein Judikatur-Dokument — im selben Format wie der
 * Vollabruf (judikatur-file.ts): echtes Entscheidungsdatum, ECLI, Gericht,
 * zitierte Normen und Entscheidungsart aus den RIS-Metadaten. Vorher stand
 * hier das RIS-Änderungsdatum als Entscheidungsdatum und die Normen fehlten.
 */
export function buildJudikaturMarkdown(doc: DeltaDocument, xmlText: string): string {
  const text = risXmlToText(xmlText) || "";
  const item = doc.raw ? mapRisReference(doc.raw, new Date(doc.changedAt)) : null;
  const courtKey = COURT_KEY[doc.applikation] ?? doc.applikation.toLowerCase();
  const url = doc.dokumentUrl || doc.xmlUrl || item?.url || "";
  return buildDecisionFile(
    {
      id: doc.id,
      court: item?.court && item.court !== "Unbekannt" ? item.court : doc.applikation,
      date: item?.date ?? decisionDateOfDocNr(doc.id) ?? "",
      az: item?.az ?? doc.geschaeftszahl ?? doc.id,
      ecli: item?.ecli,
      legalArea: item?.legalArea ?? "Allgemein",
      keywords: item?.keywords ?? [],
      normen: item?.normen ?? [],
      decisionType: doc.raw ? decisionTypeOf(doc.raw) : undefined,
      text,
      url,
      title: item?.title ?? `${doc.applikation} — ${doc.geschaeftszahl ?? doc.id}`,
    },
    courtKey
  );
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
  if (doc.abkuerzung) fm.push(`abbreviation: "${esc(doc.abkuerzung)}"`);
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
 * Für Bundesrecht: derselbe Pfad wie beim Vollabruf (ris-norm-paths.ts):
 *   <corpusDir>/<abk-slug>[-<gnr>]/<key>[-nor<id>].md, ohne Abkürzung gnr-<gnr>/
 * Für Judikatur: <corpusDir>/<dokumentnummer>.md
 * Für Landesrecht: <corpusDir>/<land>/gnr-<gnr>/<key>.md
 */
export function docFilePath(
  app: DeltaApplikation,
  doc: DeltaDocument,
  corpusRoot: string = CORPUS_ROOT
): string {
  const corpusDir = join(corpusRoot, app.corpusDir);

  if (app.endpoint === "Judikatur") {
    // Named by the RIS document number: several Rechtssätze share one
    // Geschäftszahl, a name built from it let them overwrite each other.
    // An older file of the same document keeps its name.
    const legacy = join(corpusDir, `${slugify(doc.geschaeftszahl || doc.id)}.md`);
    if (existsSync(legacy) && dokNrOfFile(legacy) === doc.id) return legacy;
    return join(corpusDir, decisionFileName(doc.id));
  }

  const apa = doc.artikelParagraphAnlage;
  const key = normKey(apa) || doc.id.toLowerCase();

  // Bundesrecht: the folder and file the full fetch uses, so an amendment
  // replaces the norm the citation check and the norm reader read.
  if (app.endpoint === "Bundesrecht" && doc.gesetzesnummer) {
    const dir = resolveBundesnormDir(corpusDir, doc.abkuerzung, doc.gesetzesnummer);
    return join(corpusDir, dir, resolveNormFileName(join(corpusDir, dir), key, doc.id));
  }

  // Landesrecht (and Bundesrecht without Gesetzesnummer)
  const gnrDir = doc.gesetzesnummer
    ? `gnr-${doc.gesetzesnummer}`
    : slugify(doc.kurztitel || doc.id);
  // The states number their laws independently: the state is part of the path
  // (same layout as fetch-at-landesrecht-xml.ts).
  const land = app.endpoint === "Landesrecht" ? landOfDocId(doc.id) : null;
  return join(corpusDir, ...(land ? [land] : []), gnrDir, `${key}.md`);
}

/**
 * Verarbeitet ein einzelnes Delta-Dokument:
 *   1. XML holen (falls URL vorhanden)
 *   2. Text validieren
 *   3. Markdown bauen
 *   4. Auf Disk schreiben (atomic)
 *   5. markiereZumImport
 *
 * Returns true bei Erfolg, sonst den Fehler — `permanent` heißt: ein
 * weiterer Versuch mit derselben RIS-Fassung kann nicht gelingen
 * (→ sofort Quarantäne, siehe ris-delta-quarantine.ts).
 */
async function processDocument(
  app: DeltaApplikation,
  doc: DeltaDocument
): Promise<true | DocFailure> {
  if (!doc.xmlUrl) {
    console.warn(`  ⚠️ Keine XML-URL für ${doc.id} (${app.applikation}) — überspringe`);
    return { permanent: true, reason: "keine XML-URL" };
  }

  const xml = await fetchXml(doc.xmlUrl);
  if (!xml || xml.length < 100) {
    console.warn(`  ⚠️ XML leer/fehlerhaft für ${doc.id} — überspringe`);
    return { permanent: false, reason: "XML nicht abrufbar oder leer" };
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
      return { permanent: true, reason: `Text ungültig: ${validation.reason}` };
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
      return { permanent: true, reason: "Geschäftszahl nicht im Text" };
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

  // A new Rechtssatz of OGH/VwGH/VfGH names its decisions; fetch the ones not
  // on disk yet, so the daily sync brings the decisions and not only the
  // Rechtssätze (same files as fetch-entscheidungstexte.ts).
  if (app.endpoint === "Judikatur" && doc.raw) {
    for (const t of textRefsOf(doc.raw)) {
      const target = join(dirname(filepath), `${t.dokNr.toLowerCase()}.md`);
      if (existsSync(target)) continue;
      const textXml = await fetchXml(
        `https://www.ris.bka.gv.at/Dokumente/${app.applikation}/${t.dokNr}/${t.dokNr}.xml`
      );
      const body = textXml ? risXmlToText(textXml) : "";
      if (body.length < 200 || (t.gz && !contentMatchesDocument(body, { case_number: t.gz })))
        continue;
      const ecli = textXml?.match(/ECLI:AT:[A-Z0-9]+:\d{4}:[A-Z0-9.]+/)?.[0] ?? null;
      const courtKey = COURT_KEY[app.applikation] ?? app.applikation.toLowerCase();
      atomicWrite(target, buildTextMarkdown(t, courtKey, app.applikation, body, ecli));
      markiereZumImport(target.replace(CORPUS_ROOT + "/", ""), "edit");
    }
  }

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
      if (!result.complete) {
        raiseAlert(
          app.stateKey,
          "delta_sync_failed",
          "error",
          "RIS-Abfrage unvollständig — Cursor bleibt stehen"
        );
        appendHistory(app.stateKey, "delta", "incomplete fetch, cursor kept");
        return { ...result, written: 0, failed: 0, skipped: 0 };
      }
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
    const failedChangedAt: string[] = [];
    const quarantine = loadQuarantine(QUARANTINE_FILE);
    const newlyQuarantined: string[] = [];
    let quarantineChanged = false;

    for (const doc of result.documents) {
      // Dedup: RIS kann bei Paginierung-Overlap dasselbe Dokument mehrfach liefern
      if (seenIds.has(doc.id)) {
        skipped++;
        continue;
      }
      seenIds.add(doc.id);

      // Bereits in Quarantäne (gleiche RIS-Fassung) — nicht erneut abrufen.
      if (isQuarantined(quarantine, doc)) {
        skipped++;
        continue;
      }

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

      const outcome = await processDocument(app, doc);
      if (outcome === true) {
        written++;
        if (quarantine[doc.id]) {
          clearFailure(quarantine, doc.id);
          quarantineChanged = true;
        }
      } else {
        failed++;
        quarantineChanged = true;
        // Quarantänierte Dokumente halten den Cursor nicht mehr fest.
        if (recordFailure(quarantine, doc, outcome)) newlyQuarantined.push(doc.id);
        else failedChangedAt.push(doc.changedAt);
      }

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

    if (quarantineChanged && !DRY_RUN) saveQuarantine(QUARANTINE_FILE, quarantine);
    if (newlyQuarantined.length > 0) {
      raiseAlert(
        app.stateKey,
        "delta_quarantine",
        "error",
        `${newlyQuarantined.length} Dokument(e) dauerhaft fehlgeschlagen und in Quarantäne ` +
          `(${newlyQuarantined.slice(0, 10).join(", ")}${newlyQuarantined.length > 10 ? ", …" : ""}) — ` +
          `siehe _state/ris-delta-quarantine.json`
      );
    }

    // The cursor only moves past what was fully written: on partial failure
    // it stops at the earliest failed change, so those come again next run.
    const nextCursor = nextCursorAfterBatch({
      newCursor: result.newCursor,
      complete: result.complete,
      failedChangedAt,
    });
    // Quarantined failures do not count against the batch — they are
    // alerted separately and no longer block the cursor.
    const openFailures = failed - newlyQuarantined.length;
    if (openFailures === 0 && nextCursor) {
      updateCursor(app.stateKey, nextCursor);
      clearAlerts(app.stateKey, "delta_sync_failed");
      clearAlerts(app.stateKey, "delta_gap");
      appendHistory(app.stateKey, "delta", `${written} docs synced`);
    } else if (written > 0 || (openFailures === 0 && !nextCursor)) {
      // Teilweise erfolgreich oder unvollständig abgerufen — Cursor nur bis
      // zur ersten Lücke, Alert
      if (nextCursor) updateCursor(app.stateKey, nextCursor);
      raiseAlert(
        app.stateKey,
        "delta_sync_partial",
        "warning",
        result.complete
          ? `${written} synced, ${openFailures} failed — werden beim nächsten Lauf erneut geholt`
          : `${written} synced, RIS-Abfrage unvollständig — Cursor bleibt stehen`
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
    console.log(`  📌 Cursor: ${nextCursor ?? `${cursor ?? "(keiner)"} (unverändert)`}`);

    return { ...result, written, failed: openFailures, skipped };
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

  const exitCode = deltaExitCode({ errors, results: results.map((r) => r.result) });
  await Promise.allSettled(pendingAlerts);
  console.log(
    exitCode === 0
      ? `\n✅ Fertig: ${new Date().toISOString()}`
      : `\n❌ Fertig mit Fehlern: ${new Date().toISOString()}`
  );
  if (exitCode !== 0) process.exit(exitCode);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
