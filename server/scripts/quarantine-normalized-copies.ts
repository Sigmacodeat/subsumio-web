#!/usr/bin/env bun
/**
 * Moves canonical copies out of _normalized/<corpus> that no longer stand for
 * a raw file — into _normalized/_quarantine/<date>/<corpus>/, never deleted.
 *
 * WHY (measured 2026-09-26): a full run of the normalizer produced 18,036
 * fewer at-landesrecht and 857 fewer at-normen files than _normalized held.
 * Nothing was lost — the surplus were copies the normalizer would never
 * write again:
 *   - orphans: 17,945 state-law copies whose raw file is gone (17,062 from the
 *     defective 2026-08-03 fetch). They counted as "on the server" and kept
 *     their old metadata and text in the database, unverifiable.
 *   - replaced: copies whose path now holds another document's raw file —
 *     a later fetch wrote a newer version there; the copy shows the old one.
 *   - losers:  855 federal copies of a document number whose raw file lost
 *     the normalizer's duplicate selection (selectWinners). The importer
 *     writes one page per document number, so whichever copy it read last
 *     won — a stale loser could overwrite the corrected winner.
 *
 * After moving, the database pages of orphans are ordinary "nur in DB" cases
 * (tombstone-db-orphans.ts) or, when RIS still lists the number, "fehlt" and
 * are fetched again (fetch-at-landesrecht-xml.ts --from-index), which updates
 * the same page by document number.
 *
 *   bun scripts/quarantine-normalized-copies.ts --corpus at-landesrecht          # dry run
 *   bun scripts/quarantine-normalized-copies.ts --corpus at-landesrecht --apply
 *
 * Refuses to run when the raw corpus looks unmounted (fewer raw files than
 * half the canonical ones) — an empty mount must never quarantine everything.
 */

import { parseArgs } from "util";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { selectWinners } from "./normalize/normalize-corpus.ts";
import { rawDocIdOf } from "./corpus-sync-inventory.ts";

export type QuarantineReason = "no_raw" | "raw_replaced" | "duplicate_loser";

export interface QuarantinePlan {
  normalized: number;
  raw: number;
  moves: Array<{ rel: string; reason: QuarantineReason; docId: string | null }>;
  /**
   * Losers kept because the winner has no canonical copy yet — moving them
   * would take the document off the server. The next full normalization
   * writes the winner; then they can go.
   */
  keptLosers: number;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

const DOC_ID_RE = /^doc_id:\s*["']?([^"'\s]+)/m;

function docIdOfFile(path: string): string | null {
  try {
    return readFileSync(path, "utf8").slice(0, 4096).match(DOC_ID_RE)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Pure over the file system state: which canonical copies to move and why. */
export function planQuarantine(rawDir: string, normDir: string): QuarantinePlan {
  const rawFiles = walk(rawDir);
  const normFiles = walk(normDir);
  if (rawFiles.length < normFiles.length / 2)
    throw new Error(
      `${rawDir}: nur ${rawFiles.length} Rohdateien bei ${normFiles.length} normalisierten — Korpus nicht eingehängt? Abbruch.`
    );
  // The normalizer's own duplicate selection — the same rule decides here.
  const { winners } = selectWinners(rawFiles);
  // Document number → canonical copy of its winning raw file, if there is one.
  const winnerCopy = new Map<string, string>();
  for (const w of winners) {
    const id = rawDocIdOf(w);
    const copy = join(normDir, w.slice(rawDir.length + 1));
    if (id && existsSync(copy) && docIdOfFile(copy) === id) winnerCopy.set(id, copy);
  }
  const moves: QuarantinePlan["moves"] = [];
  let keptLosers = 0;
  for (const n of normFiles) {
    const rel = n.slice(normDir.length + 1);
    const raw = join(rawDir, rel);
    const docId = docIdOfFile(n);
    if (!existsSync(raw)) moves.push({ rel, reason: "no_raw", docId });
    // A later fetch put another document (usually a newer version) here.
    else if (rawDocIdOf(raw) !== docId) moves.push({ rel, reason: "raw_replaced", docId });
    else if (!winners.has(raw)) {
      const w = docId ? winnerCopy.get(docId) : undefined;
      if (w && w !== n) moves.push({ rel, reason: "duplicate_loser", docId });
      else keptLosers++;
    }
  }
  return { normalized: normFiles.length, raw: rawFiles.length, moves, keptLosers };
}

async function main() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      corpus: { type: "string" },
      apply: { type: "boolean", default: false },
    },
  });
  const corpus = values.corpus;
  if (!corpus || !/^[a-z0-9-]+$/.test(corpus)) {
    console.error("--corpus <ordner> erforderlich (z. B. at-landesrecht)");
    process.exit(2);
  }
  const root = process.env.LAW_CORPUS_ROOT ?? "/law-corpus";
  const rawDir = join(root, corpus);
  const normDir = join(root, "_normalized", corpus);
  const plan = planQuarantine(rawDir, normDir);
  const count = (r: QuarantineReason) => plan.moves.filter((m) => m.reason === r).length;
  const f = (n: number) => n.toLocaleString("de-AT");
  console.log(
    `${corpus}: ${f(plan.normalized)} normalisierte Dateien, ${f(plan.raw)} Rohdateien · ` +
      `${f(count("no_raw"))} ohne Rohdatei · ${f(count("raw_replaced"))} Rohdatei ist inzwischen ein anderes Dokument · ${f(count("duplicate_loser"))} unterlegene Dubletten · ${f(plan.keptLosers)} Dubletten bleiben (Gewinner noch ohne Kopie)`
  );
  for (const m of plan.moves.slice(0, 5)) console.log(`  z. B. ${m.reason}: ${m.rel} (${m.docId})`);

  if (!values.apply) {
    console.log("TROCKENLAUF — mit --apply verschieben.");
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const qRoot = join(root, "_normalized", "_quarantine", day, corpus);
  const inventory = join(root, "_state", `quarantine-normalized-${corpus}-${day}.jsonl`);
  mkdirSync(join(root, "_state"), { recursive: true });
  let moved = 0;
  for (const m of plan.moves) {
    const from = join(normDir, m.rel);
    const to = join(qRoot, m.rel);
    // Inventory line first: a crash leaves a record of every file touched.
    appendFileSync(
      inventory,
      JSON.stringify({ ...m, from, to, at: new Date().toISOString() }) + "\n"
    );
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
    moved++;
  }
  console.log(`${f(moved)} Dateien nach ${qRoot} verschoben · Inventar: ${inventory}`);
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
