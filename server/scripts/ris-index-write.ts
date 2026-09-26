/**
 * Shared write discipline for the RIS in-force ("Soll") indexes
 * (_state/ris-inforce{,-landesrecht}.jsonl).
 *
 * These files decide which statute pages count as orphaned
 * (tombstone-db-orphans.ts) and which rows the completeness view keeps
 * (audit-completeness-vs-ris.ts). An empty or gap-ridden index therefore
 * must never land at the target path:
 *
 *   - `parseTotalHits` treats a response without a `Hits` count as a
 *     failure (null), never as "0 documents";
 *   - `assessIndexCompleteness` accepts a run only when no page was lost
 *     and at least 99 % of the announced documents arrived;
 *   - `writeIndexAtomic` writes to a temp file in the same directory and
 *     renames it into place, so a crash mid-write leaves the previous
 *     index untouched.
 */
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeSync } from "node:fs";

/** Share of announced documents a run must deliver to be written. */
export const INDEX_MIN_SHARE = 0.99;

/** `Hits` from a RIS OGD search response; null when absent or not a positive number. */
export function parseTotalHits(data: unknown): number | null {
  const hits = (data as any)?.OgdSearchResult?.OgdDocumentResults?.Hits;
  const raw = typeof hits === "object" && hits !== null ? hits["#text"] : hits;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type IndexVerdict = { ok: true } | { ok: false; reason: string };

export function assessIndexCompleteness(input: {
  total: number | null;
  written: number;
  failedPages: number[];
}): IndexVerdict {
  const { total, written, failedPages } = input;
  if (total === null || total <= 0) {
    return { ok: false, reason: "RIS meldete keine Trefferzahl — Antwort unbrauchbar" };
  }
  if (failedPages.length > 0) {
    return {
      ok: false,
      reason: `${failedPages.length} Seite(n) nicht geladen: ${failedPages.slice(0, 20).join(", ")}`,
    };
  }
  if (written < total * INDEX_MIN_SHARE) {
    return { ok: false, reason: `nur ${written} von ${total} erwarteten Normen erfasst` };
  }
  return { ok: true };
}

/** Write lines to `path` via temp file + rename (same directory, fsynced). */
export function writeIndexAtomic(path: string, lines: string[]): void {
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, lines.join("\n") + "\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}
