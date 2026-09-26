#!/usr/bin/env bun
/**
 * Fetch exactly the decisions the RIS index lists and the disk does not have.
 *
 * Reads <LAW_CORPUS_ROOT>/_state/ris-index-jud-<court>.jsonl (written by
 * ris-jud-index-crawl.ts), compares it with the corpus the same way
 * fullScanCourt does (loadExistingDocs over _normalized/<outDir>) and fetches
 * the full text of each missing document with fetchRisFullText. The markdown
 * is built with buildMarkdown/decisionFileName exactly as fullScanCourt
 * writes it — the index line carries the same metadata the search hit had.
 *
 * Unlike the full scan, a document without obtainable text gets NO
 * placeholder file: the reason goes to _state/ris-fetch-outcomes.jsonl
 * (no_text | not_found | failed) and the inventory reports it as such.
 *
 * Resumable by construction: every run recomputes what is missing. Besides
 * _normalized/, it skips
 *   - raw files in <outDir>/ written since the index was crawled (fetched by
 *     an earlier run of this campaign, not yet through the normalizer), and
 *   - documents with a no_text/not_found outcome recorded since the index
 *     was crawled (RIS will not have changed its mind within a campaign).
 * A raw file OLDER than the index that never passed the normalizer is
 * fetched again — that is the repair path fullScanCourt has too.
 *
 * Usage:
 *   bun scripts/fetch-jud-from-index.ts --court ogh [--limit 500]
 *   bun scripts/fetch-jud-from-index.ts --court ogh --dry-run
 */

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { acquireRisLock, releaseRisLock } from "./ris-lock";
import { risMassPause, RIS_PAUSE_MS } from "./ris-pace";
import { COURT_CONFIGS } from "./ris-jud-courts";
import {
  CORPUS_ROOT,
  classifyNoText,
  fetchRisFullText,
  newFullTextDiag,
  slugify,
} from "./fetch-all-at-judikatur";
import {
  buildMarkdown,
  decisionFileName,
  isAlreadyOnDisk,
  loadExistingDocs,
  type ExistingDocs,
  type JudikaturDoc,
} from "./judikatur-file";
import { readFetchOutcomes, recordFetchOutcome, type FetchOutcomeLine } from "./ris-fetch-outcomes";
import { indexPaths, type IndexLine, type IndexMeta } from "./ris-jud-index-crawl";

// ── Pure ───────────────────────────────────────────────────────────────

/** Parse the index JSONL; lines without an id are ignored. */
export function parseIndex(text: string): IndexLine[] {
  const out: IndexLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const l = JSON.parse(raw) as IndexLine;
      if (l && typeof l.id === "string" && l.id && l.meta) out.push(l);
    } catch {
      // A torn line cannot come from the atomic writer; skip defensively.
    }
  }
  return out;
}

export interface DiffInput {
  lines: IndexLine[];
  /** loadExistingDocs over _normalized/<outDir>. */
  existing: ExistingDocs;
  /** Ids whose raw file was written since the index was crawled. */
  freshRaw: Set<string>;
  /** Latest fetch outcome per `${corpus}|${id}`. */
  outcomes: Map<string, FetchOutcomeLine>;
  corpus: string;
  /** Index crawl time (ISO); outcomes before it do not count. */
  since: string;
}

export interface DiffResult {
  missing: IndexLine[];
  onDisk: number;
  freshRaw: number;
  knownNoText: number;
}

/** Which index documents still have to be fetched. Same identity rules as fullScanCourt. */
export function missingFromIndex(input: DiffInput): DiffResult {
  const missing: IndexLine[] = [];
  let onDisk = 0;
  let freshRaw = 0;
  let knownNoText = 0;
  const seen = new Set<string>();
  for (const l of input.lines) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    const slugDate = (l.meta.date || "").split("T")[0];
    const slugAz = slugify(l.meta.az || l.id);
    const fileKey = `${slugDate}-${slugAz}`;
    if (isAlreadyOnDisk(input.existing, l.id, l.meta.url, fileKey, slugAz)) {
      onDisk++;
      continue;
    }
    if (input.freshRaw.has(l.id)) {
      freshRaw++;
      continue;
    }
    const o = input.outcomes.get(`${input.corpus}|${l.id}`);
    if (o && o.outcome !== "failed" && o.at >= input.since) {
      knownNoText++;
      continue;
    }
    missing.push(l);
  }
  return { missing, onDisk, freshRaw, knownNoText };
}

/** Index line + fetched text → the document fullScanCourt would have built from the search hit. */
export function docFromLine(l: IndexLine, text: string): JudikaturDoc {
  return {
    id: l.id,
    court: l.meta.court,
    date: l.meta.date,
    az: l.meta.az ?? "",
    ecli: l.meta.ecli,
    legalArea: l.meta.legalArea,
    keywords: l.meta.keywords ?? [],
    normen: l.meta.normen ?? [],
    decisionType: l.meta.decisionType,
    text,
    url: l.meta.url,
    title: l.meta.title,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

/** Ids whose raw file in outDir is newer than `sinceMs`. */
function freshRawIds(outDir: string, lines: IndexLine[], sinceMs: number): Set<string> {
  const out = new Set<string>();
  if (!existsSync(outDir)) return out;
  for (const l of lines) {
    const p = join(outDir, decisionFileName(l.id));
    try {
      if (statSync(p).mtimeMs >= sinceMs) out.add(l.id);
    } catch {
      /* not there */
    }
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const courtIdx = args.indexOf("--court");
  const sourceIdx = args.indexOf("--source"); // pipeline trigger vocabulary
  const courtKey = courtIdx >= 0 ? args[courtIdx + 1] : sourceIdx >= 0 ? args[sourceIdx + 1] : "";
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? "", 10) : Infinity;
  const dryRun = args.includes("--dry-run");
  const court = COURT_CONFIGS[courtKey ?? ""];
  if (!court || !(limit > 0)) {
    console.error(
      `Usage: bun scripts/fetch-jud-from-index.ts --court <${Object.keys(COURT_CONFIGS).join("|")}> [--limit N] [--dry-run]`
    );
    process.exit(2);
  }

  const paths = indexPaths(CORPUS_ROOT, courtKey);
  if (!existsSync(paths.index)) {
    console.error(`Kein Index: ${paths.index} — zuerst ris-jud-index-crawl.ts --court ${courtKey}`);
    process.exit(1);
  }
  const lines = parseIndex(readFileSync(paths.index, "utf8"));
  let meta: IndexMeta | null = null;
  try {
    meta = JSON.parse(readFileSync(paths.meta, "utf8")) as IndexMeta;
  } catch {
    /* index without meta: treat as crawled at file mtime */
  }
  const since = meta?.crawledAt ?? new Date(statSync(paths.index).mtimeMs).toISOString();
  if (meta && !meta.complete)
    console.warn(
      `  ⚠️ Index ist unvollständig (${meta.notes.join("; ")}) — es fehlen ggf. weitere Dokumente`
    );

  const outDir = join(CORPUS_ROOT, court.outDir);
  const diff = missingFromIndex({
    lines,
    existing: loadExistingDocs(join(CORPUS_ROOT, "_normalized", court.outDir)),
    freshRaw: freshRawIds(outDir, lines, Date.parse(since)),
    outcomes: readFetchOutcomes(CORPUS_ROOT),
    corpus: court.outDir,
    since,
  });
  const todo = diff.missing.slice(0, Number.isFinite(limit) ? limit : undefined);
  console.log(`═══ ${court.label}: Index ${lines.length} (Stand ${since})`);
  console.log(
    `  vorhanden ${diff.onDisk} · roh seit Index ${diff.freshRaw} · bei RIS ohne Text ${diff.knownNoText} · ` +
      `fehlend ${diff.missing.length} → jetzt ${todo.length}`
  );
  if (dryRun) {
    for (const l of todo.slice(0, 50)) console.log(`  ${l.id}  ${l.datum}  ${l.kurztitel}`);
    return;
  }
  if (todo.length === 0) return;

  await acquireRisLock();
  console.log(`  RIS-Pacing: ${RIS_PAUSE_MS} ms vor jeder Anfrage.`);
  mkdirSync(outDir, { recursive: true });
  let written = 0;
  let noText = 0;
  for (const l of todo) {
    await risMassPause("Judikatur-Abruf");
    const diag = newFullTextDiag();
    const text = await fetchRisFullText(
      l.meta.htmlUrl ?? "",
      l.meta.url,
      l.meta.az ?? "",
      l.meta.ecli ?? "",
      {
        pause: () => risMassPause("Judikatur-Abruf"),
        diag,
      }
    );
    if (!text) {
      const outcome = classifyNoText(diag);
      recordFetchOutcome(
        CORPUS_ROOT,
        court.outDir,
        l.id,
        outcome,
        `HTTP ${diag.statuses.join(",") || "-"}`
      );
      noText++;
      continue;
    }
    const path = join(outDir, decisionFileName(l.id));
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, buildMarkdown(docFromLine(l, text), courtKey), "utf-8");
    renameSync(tmp, path);
    written++;
    if (written % 200 === 0) console.log(`  [${written}] ${l.datum} ${l.kurztitel}`);
  }
  console.log(
    `  ${court.label}: ${written} geschrieben, ${noText} ohne Text (→ ris-fetch-outcomes.jsonl)`
  );
}

if (import.meta.main) {
  main()
    .then(() => releaseRisLock())
    .catch((err) => {
      console.error("Fatal:", err);
      releaseRisLock();
      process.exit(1);
    });
}
