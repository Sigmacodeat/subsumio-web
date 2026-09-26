/**
 * Bookkeeping of repair-known-bad-generation.ts, pure and without the
 * script's argument parsing so it can be tested.
 */

/**
 * Checkpoint v2. v1 kept a flat list of processed ids and declared itself
 * done once that list was as long as the CURRENT known-bad set — but every
 * repaired page leaves that set on re-import, so the set shrank under the
 * counter and the run stopped "done" with 25,327 pages never touched
 * (2026-09-26). v2 records an attempt per id: an id counts as handled only
 * once it has left the known-bad set; one still there RETRY_AFTER_MS after
 * its last attempt (failed fetch, or the write did not reach the DB) is tried
 * again, up to MAX_ATTEMPTS. Done = nothing left but given-up ids.
 */
export interface Attempt {
  n: number;
  at: string;
  ok: boolean;
}

export interface Checkpoint {
  version: 2;
  source: string;
  generation: string;
  attempts: Record<string, Attempt>;
  written: number;
  unchanged: number;
  failed: number;
  startedAt: string;
  updatedAt: string;
  done: boolean;
}

export const MAX_ATTEMPTS = 3;
export const RETRY_AFTER_MS = 48 * 3600 * 1000;

/** Rows still known-bad that are due for a (first or next) attempt. */
export function duePending<R extends { doc_id: string }>(
  rows: R[],
  attempts: Record<string, Attempt>,
  now = Date.now()
): R[] {
  return rows.filter((r) => {
    const a = attempts[r.doc_id];
    if (!a) return true;
    if (a.n >= MAX_ATTEMPTS) return false;
    return now - Date.parse(a.at) >= RETRY_AFTER_MS;
  });
}

/** Done only when every remaining known-bad row has used up its attempts. */
export function repairDone(rows: Array<{ doc_id: string }>, attempts: Record<string, Attempt>) {
  return rows.every((r) => (attempts[r.doc_id]?.n ?? 0) >= MAX_ATTEMPTS);
}
