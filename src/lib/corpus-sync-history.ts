/**
 * Liest den Verlauf der Nachweis-Messung (_state/corpus-sync-history.jsonl,
 * geschrieben von server/scripts/corpus-sync-inventory.ts, eine Zeile je
 * stündlicher Messung) und verdichtet ihn auf den letzten Stand je Tag und
 * Quelle. Nur auf dem Server nutzbar (fs); die Auswertung steht in
 * corpus-progress.ts.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { lawCorpusDir } from "@/lib/corpus-paths";
import { PROOF_BUCKETS, type ProofCounts } from "@/lib/corpus-proof";
import { pointOf, type DailyPoint } from "@/lib/corpus-progress";

const HISTORY_FILE = "corpus-sync-history.jsonl";
export const HISTORY_VIEW_DAYS = 30;

/** Kalendertag in Wien — ein Tag endet für den Betreiber um Mitternacht Ortszeit. */
function viennaDay(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
}

/** Rein: JSONL → je Quelle die Tagesstände der letzten `days` Tage, aufsteigend. */
export function parseSyncHistory(
  jsonl: string,
  now = Date.now(),
  days = HISTORY_VIEW_DAYS
): Record<string, DailyPoint[]> {
  const cutoff = now - days * 86_400_000;
  // corpus → day → letzter Stand (Zeilen sind chronologisch; später überschreibt).
  const byCorpus = new Map<string, Map<string, DailyPoint>>();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let rec: { at?: unknown; s?: Record<string, unknown> };
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof rec.at !== "string" || !rec.s || Date.parse(rec.at) < cutoff) continue;
    const day = viennaDay(rec.at);
    for (const [corpus, arr] of Object.entries(rec.s)) {
      if (!Array.isArray(arr) || arr.length !== PROOF_BUCKETS.length + 1) continue;
      const counts = Object.fromEntries(
        PROOF_BUCKETS.map((b, i) => [b, Number(arr[i + 1]) || 0])
      ) as ProofCounts;
      let days = byCorpus.get(corpus);
      if (!days) byCorpus.set(corpus, (days = new Map()));
      days.set(day, pointOf(day, counts));
    }
  }
  const out: Record<string, DailyPoint[]> = {};
  for (const [corpus, days] of byCorpus)
    out[corpus] = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

let cache: {
  path: string;
  mtimeMs: number;
  day: string;
  data: Record<string, DailyPoint[]>;
} | null = null;

/** Verlauf je Quelle; leer, solange es noch keine Messung mit Nachweis gibt. */
export function readSyncHistory(root: string = lawCorpusDir()): Record<string, DailyPoint[]> {
  const path = join(root, "_state", HISTORY_FILE);
  if (!existsSync(path)) return {};
  try {
    const mtimeMs = statSync(path).mtimeMs;
    const today = viennaDay(new Date().toISOString());
    if (cache && cache.path === path && cache.mtimeMs === mtimeMs && cache.day === today)
      return cache.data;
    const data = parseSyncHistory(readFileSync(path, "utf8"));
    cache = { path, mtimeMs, day: today, data };
    return data;
  } catch {
    return {};
  }
}
