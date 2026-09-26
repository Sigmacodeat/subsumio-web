/**
 * Why a RIS document is not on disk — one JSON line per failed fetch.
 *
 * The fetchers used to drop a document silently when RIS returned 404 or an
 * XML without text (typically an Anlage that exists only as a PDF or image).
 * The document then stayed "missing" forever and nobody could tell a real gap
 * from one RIS cannot close. Every such outcome is now appended to
 * `_state/ris-fetch-outcomes.jsonl`; corpus-sync-inventory.ts reads the
 * latest outcome per document id and splits the gap into "noch offen" and
 * "bei RIS ohne Text / nicht auffindbar".
 *
 * Append-only and best-effort: a failed write never stops a fetch.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type FetchOutcome = "no_text" | "not_found" | "failed" | "superseded";

export interface FetchOutcomeLine {
  corpus: string;
  id: string;
  outcome: FetchOutcome;
  at: string;
  detail?: string;
}

export function fetchOutcomesPath(corpusRoot: string): string {
  return join(corpusRoot, "_state", "ris-fetch-outcomes.jsonl");
}

export function recordFetchOutcome(
  corpusRoot: string,
  corpus: string,
  id: string,
  outcome: FetchOutcome,
  detail?: string
): void {
  try {
    const dir = join(corpusRoot, "_state");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line: FetchOutcomeLine = { corpus, id, outcome, at: new Date().toISOString() };
    if (detail) line.detail = detail.slice(0, 200);
    appendFileSync(fetchOutcomesPath(corpusRoot), JSON.stringify(line) + "\n");
  } catch {
    // Best effort — the fetch itself must not fail over bookkeeping.
  }
}

/** Latest outcome per corpus + document id (later lines win). */
export function readFetchOutcomes(corpusRoot: string): Map<string, FetchOutcomeLine> {
  const out = new Map<string, FetchOutcomeLine>();
  const path = fetchOutcomesPath(corpusRoot);
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    if (!raw.trim()) continue;
    try {
      const l = JSON.parse(raw) as FetchOutcomeLine;
      if (l.corpus && l.id && l.outcome) out.set(`${l.corpus}|${l.id}`, l);
    } catch {
      // Torn last line of a killed process — skip.
    }
  }
  return out;
}
