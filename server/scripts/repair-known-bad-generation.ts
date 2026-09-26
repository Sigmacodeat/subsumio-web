#!/usr/bin/env bun
/**
 * Repairs the 2026-08-03 Landesrecht fetch generation instead of leaving it
 * blanket-flagged forever.
 *
 * ABGELÖST (2026-09-26) — no longer started by corpus-pipeline.ts. It writes
 * the fresh file beside the old one (docFilePath uses the land-qualified
 * statute_id, "gnr-tir-10000001" instead of "gnr-10000001"), and the
 * normalizer's per-doc_id winner choice goes by text quality, not recency,
 * so the repair can silently lose. Failed fetches are checkpointed as
 * processed and never retried. Use docs/guides/korpus-reparatur-0803.md
 * (fetch-at-landesrecht-xml.ts --ids) instead.
 *
 * audit-plausibility-full.ts marks every page whose `frontmatter.retrieved_at
 * === "2026-08-03"` as `generation:known_bad` — a whole-generation flag, not
 * a per-page verdict. That flag was set because a 55-document sample of this
 * generation (korpus-inventur-2026-09-21) found 10.9% text deviation from
 * the RIS XML original. It does not say which 10.9%. Since then all 58,599
 * pages in this generation have sat unembedded — including the ~89% that
 * were probably always fine.
 *
 * Nothing about that flag deletes anything (tombstone-dead-end-pages.ts
 * explicitly excludes `generation:known_bad` — see its file header) and this
 * script doesn't either. It re-fetches each document's XML directly from
 * RIS by its known doc_id (the per-document URL is predictable — no search
 * pagination needed), and:
 *   - if the fresh XML validates (validateFetchedText): rebuilds the
 *     markdown exactly as the daily delta sync would
 *     (buildLandesrechtMarkdown) and overwrites the SAME raw file path the
 *     original fetch used (docFilePath), with today's retrieved_at. The
 *     normal pipeline (normalize → import, mtime-aware since 2026-09-23)
 *     picks this up on its next cycle like any other on-disk change — no
 *     import logic duplicated here. A fresh retrieved_at naturally clears
 *     the blanket flag on the next plausibility audit (every 6h); if the
 *     re-fetched text differs from what was in the DB, the reimport updates
 *     it to the corrected text — a repair, not a guess.
 *   - if the fresh fetch fails or the text doesn't validate: the page is
 *     left exactly as it is now — still flagged, still unembedded, nothing
 *     removed — for a later retry. Never delete, never guess.
 *
 * Resumable and bounded per run: processes documents for at most
 * --batch-minutes (default 8, leaving headroom inside the pipeline's
 * 10-minute cycle) and exits 0, checkpointing as it goes
 * (_state/repair-<source>-<generation>.json under the corpus root). The
 * pipeline restarts it next cycle until the checkpoint reports done — the
 * same resumability discipline as every other long RIS job here, and safer
 * than one multi-hour process a redeploy could kill mid-run.
 *
 * Usage:
 *   bun scripts/repair-known-bad-generation.ts --dry-run --limit 20
 *   bun scripts/repair-known-bad-generation.ts --yes
 *   bun scripts/repair-known-bad-generation.ts --yes --batch-minutes 8
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { parseArgs } from "util";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { RIS_PAUSE_MS, RIS_USER_AGENT } from "./ris-pace.ts";
import { proxyFetchOptions } from "./ris-proxy.ts";
import {
  atomicWrite,
  fetchWithRetry,
  risXmlToText,
  validateFetchedText,
} from "./backfill-utils.ts";
import { buildLandesrechtMarkdown, docFilePath } from "./ris-delta-watcher.ts";
import type { DeltaApplikation, DeltaDocument } from "./ris-delta.ts";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: "string", default: "law-at-landesrecht" },
    generation: { type: "string", default: "2026-08-03" },
    yes: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string" },
    "batch-minutes": { type: "string", default: "8" },
    "checkpoint-file": { type: "string" },
  },
  allowPositionals: false,
});

const SOURCE_ID = values.source as string;
const GENERATION = values.generation as string;
const APPLY = (values.yes as boolean) && !(values["dry-run"] as boolean);
const LIMIT = values.limit ? Number(values.limit) : Infinity;
const BATCH_MS = Number(values["batch-minutes"]) * 60_000;
const CORPUS_ROOT = process.env.LAW_CORPUS_ROOT ?? "/law-corpus";
const CHECKPOINT_FILE =
  (values["checkpoint-file"] as string | undefined) ??
  join(CORPUS_ROOT, "_state", `repair-${SOURCE_ID}-${GENERATION}.json`);

const APP: DeltaApplikation = {
  applikation: "LrKons",
  endpoint: "Landesrecht",
  corpusDir: "at-landesrecht",
  label: `Reparatur ${GENERATION}`,
  stateKey: `repair-${SOURCE_ID}-${GENERATION}`,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The words of a text, lower-cased, punctuation and markup characters dropped — same rule as verify-text-against-ris-xml.ts, kept local to avoid importing a CLI script with top-level arg parsing. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[   ]/g, " ")
    .replace(/[^\p{L}\p{N}§]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 0);
}

/** Share of `expected`'s words present in `actual`, counted as a multiset. */
export function coverage(expected: string[], actual: string[]): number {
  if (expected.length === 0) return 1;
  const have = new Map<string, number>();
  for (const w of actual) have.set(w, (have.get(w) ?? 0) + 1);
  let hit = 0;
  for (const w of expected) {
    const c = have.get(w) ?? 0;
    if (c > 0) {
      hit++;
      have.set(w, c - 1);
    }
  }
  return hit / expected.length;
}

interface Checkpoint {
  source: string;
  generation: string;
  processedIds: string[];
  written: number;
  unchanged: number;
  failed: number;
  startedAt: string;
  updatedAt: string;
  done: boolean;
}

function loadCheckpoint(): Checkpoint {
  try {
    if (existsSync(CHECKPOINT_FILE)) {
      return JSON.parse(readFileSync(CHECKPOINT_FILE, "utf-8")) as Checkpoint;
    }
  } catch {
    /* corrupt or missing — start fresh */
  }
  return {
    source: SOURCE_ID,
    generation: GENERATION,
    processedIds: [],
    written: 0,
    unchanged: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    done: false,
  };
}

function saveCheckpoint(cp: Checkpoint): void {
  mkdirSync(dirname(CHECKPOINT_FILE), { recursive: true });
  cp.updatedAt = new Date().toISOString();
  const tmp = `${CHECKPOINT_FILE}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(cp, null, 2));
  renameSync(tmp, CHECKPOINT_FILE);
}

interface Engine {
  executeRaw(sql: string, params?: unknown[]): Promise<unknown[]>;
  connect(cfg: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

export interface DbRow {
  doc_id: string;
  statute_id: string | null;
  paragraph_ref: string | null;
  short_title: string | null;
  abbr: string | null;
  compiled_truth: string | null;
}

export function xmlUrlFor(docId: string): string {
  return `https://www.ris.bka.gv.at/Dokumente/Landesnormen/${docId}/${docId}.xml`;
}

export function syntheticDoc(row: DbRow): DeltaDocument {
  const url = xmlUrlFor(row.doc_id);
  return {
    id: row.doc_id,
    applikation: APP.applikation,
    changedAt: new Date().toISOString(),
    dokumentUrl: url,
    xmlUrl: url,
    htmlUrl: null,
    pdfUrl: null,
    kurztitel: row.short_title,
    gesetzesnummer: row.statute_id,
    geschaeftszahl: null,
    artikelParagraphAnlage: row.paragraph_ref,
    changeType: "changed",
    inkrafttreten: null,
    ausserkrafttreten: null,
    abkuerzung: row.abbr,
  };
}

async function main() {
  const fileCfg = loadConfig();
  if (!fileCfg) throw new Error("No engine configured. Set DATABASE_URL or ~/.gbrain/config.json.");
  const cfg = toEngineConfig(fileCfg);
  const engine = (await createEngine(cfg)) as unknown as Engine;
  await engine.connect(cfg);

  const cp = loadCheckpoint();
  if (cp.done) {
    console.log(`Bereits abgeschlossen (siehe ${CHECKPOINT_FILE}). Nichts zu tun.`);
    await engine.disconnect();
    return;
  }
  const alreadyDone = new Set(cp.processedIds);

  console.log(
    `Reparatur ${SOURCE_ID} / Generation ${GENERATION}: ${alreadyDone.size.toLocaleString("de-AT")} bereits verarbeitet.`
  );

  const allRows = (await engine.executeRaw(
    `SELECT frontmatter->>'doc_id' AS doc_id,
            frontmatter->>'statute_id' AS statute_id,
            frontmatter->>'paragraph_ref' AS paragraph_ref,
            frontmatter->>'short_title' AS short_title,
            frontmatter->>'abbr' AS abbr,
            compiled_truth
       FROM pages
      WHERE deleted_at IS NULL AND source_id = $1 AND frontmatter->>'retrieved_at' = $2
        AND frontmatter->>'doc_id' IS NOT NULL`,
    [SOURCE_ID, GENERATION]
  )) as DbRow[];

  const pending = allRows.filter((r) => !alreadyDone.has(r.doc_id));
  console.log(
    `Insgesamt ${allRows.length.toLocaleString("de-AT")} Seiten in dieser Generation, ${pending.length.toLocaleString("de-AT")} offen.`
  );

  const deadline = Date.now() + BATCH_MS;
  let processedThisRun = 0;

  for (const row of pending) {
    if (processedThisRun >= LIMIT) break;
    if (Date.now() >= deadline) {
      console.log(
        `Zeitbudget (${values["batch-minutes"]} min) erreicht — wird nächsten Zyklus fortgesetzt.`
      );
      break;
    }

    await sleep(RIS_PAUSE_MS);
    const doc = syntheticDoc(row);
    const url = doc.xmlUrl!;

    const res = await fetchWithRetry(url, {
      headers: { "User-Agent": RIS_USER_AGENT },
      timeoutMs: 30_000,
      maxRetries: 3,
      proxyFetchOptions: proxyFetchOptions(),
    });

    processedThisRun++;
    alreadyDone.add(row.doc_id);
    cp.processedIds.push(row.doc_id);

    if (!res || !res.ok) {
      cp.failed++;
      console.log(
        `  ❌ ${row.doc_id}: Abruf fehlgeschlagen (HTTP ${res?.status ?? "—"}) — bleibt markiert, später erneut versuchen.`
      );
      continue;
    }

    const xml = await res.text();
    const text = risXmlToText(xml);
    const validation = validateFetchedText(text);
    if (!validation.valid) {
      cp.failed++;
      console.log(
        `  ❌ ${row.doc_id}: Text ungültig (${validation.reason}) — bleibt markiert, kein Datenverlust.`
      );
      continue;
    }

    // Informational only — logs whether this was a real repair or a
    // confirmation, doesn't gate the write. The write always happens on
    // valid fetched text, same as the daily delta sync would.
    const oldWords = words(row.compiled_truth ?? "");
    const newWords = words(validation.cleanedText);
    const cov = oldWords.length > 0 ? coverage(oldWords, newWords) : 1;
    const changed = cov < 0.999;

    if (APPLY) {
      const filepath = docFilePath(APP, doc);
      const markdown = buildLandesrechtMarkdown(doc, xml);
      mkdirSync(dirname(filepath), { recursive: true });
      atomicWrite(filepath, markdown);
    }

    if (changed) {
      cp.written++;
      console.log(
        `  ${APPLY ? "🔧" : "🔧 (Trockenlauf)"} ${row.doc_id}: Text weicht ab (Deckung alt→neu ${(cov * 100).toFixed(1)}%) — ${APPLY ? "aktualisiert" : "würde aktualisiert"}.`
      );
    } else {
      cp.unchanged++;
      if (APPLY) {
        console.log(`  ✅ ${row.doc_id}: bestätigt unverändert, retrieved_at aufgefrischt.`);
      }
    }

    if (processedThisRun % 50 === 0) {
      saveCheckpoint(cp);
      console.log(
        `  … ${cp.processedIds.length.toLocaleString("de-AT")}/${allRows.length.toLocaleString("de-AT")} — ${cp.written} repariert, ${cp.unchanged} bestätigt, ${cp.failed} fehlgeschlagen`
      );
    }
  }

  if (cp.processedIds.length >= allRows.length) {
    cp.done = true;
  }
  saveCheckpoint(cp);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(
    `  ${cp.done ? "FERTIG" : "Zyklus beendet — Fortsetzung nächster Lauf"}: ${cp.processedIds.length.toLocaleString("de-AT")}/${allRows.length.toLocaleString("de-AT")} verarbeitet`
  );
  console.log(
    `  Repariert: ${cp.written.toLocaleString("de-AT")} · Bestätigt: ${cp.unchanged.toLocaleString("de-AT")} · Fehlgeschlagen (bleibt markiert): ${cp.failed.toLocaleString("de-AT")}`
  );
  console.log("═══════════════════════════════════════════════════════════");

  await engine.disconnect();
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
