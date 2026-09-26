/**
 * Quarantine for RIS delta documents that keep failing.
 *
 * The delta cursor stops at the earliest failed change so failures are
 * fetched again (nextCursorAfterBatch). A document that can never succeed —
 * no XML URL, text that fails validation, a decision whose case number is
 * not in its text — would hold the cursor forever and make every run re-fetch
 * everything changed since. Such documents go into quarantine at once;
 * transient failures (fetch errors) after MAX_TRANSIENT_ATTEMPTS runs.
 *
 * A quarantined document no longer holds the cursor and is not fetched
 * again — until RIS reports a newer change date for it, which releases it
 * for one more attempt. The file lives in the corpus state dir and is
 * listed in the run's alert, so the operator can follow up.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const MAX_TRANSIENT_ATTEMPTS = 3;

export interface DocFailure {
  permanent: boolean;
  reason: string;
}

export interface QuarantineEntry {
  applikation: string;
  changedAt: string;
  reason: string;
  attempts: number;
  first_failed_at: string;
  last_failed_at: string;
  quarantined_at: string | null;
}

export type Quarantine = Record<string, QuarantineEntry>;

export function loadQuarantine(path: string): Quarantine {
  if (!existsSync(path)) return {};
  try {
    const v = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Quarantine) : {};
  } catch {
    return {};
  }
}

export function saveQuarantine(path: string, q: Quarantine): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(q, null, 2) + "\n");
  renameSync(tmp, path);
}

/** Skip this document: quarantined for exactly this RIS change. */
export function isQuarantined(q: Quarantine, doc: { id: string; changedAt: string }): boolean {
  const e = q[doc.id];
  return !!e && e.quarantined_at !== null && e.changedAt === doc.changedAt;
}

/**
 * Record a failure. Returns true when the document is (now) quarantined —
 * it then must not hold the cursor.
 */
export function recordFailure(
  q: Quarantine,
  doc: { id: string; applikation: string; changedAt: string },
  failure: DocFailure,
  now: Date = new Date()
): boolean {
  const ts = now.toISOString();
  const prev = q[doc.id];
  // A newer RIS change starts the count afresh.
  const sameChange = prev && prev.changedAt === doc.changedAt;
  const attempts = sameChange ? prev.attempts + 1 : 1;
  const quarantine = failure.permanent || attempts >= MAX_TRANSIENT_ATTEMPTS;
  q[doc.id] = {
    applikation: doc.applikation,
    changedAt: doc.changedAt,
    reason: failure.reason,
    attempts,
    first_failed_at: sameChange ? prev.first_failed_at : ts,
    last_failed_at: ts,
    quarantined_at: quarantine ? ts : null,
  };
  return quarantine;
}

export function clearFailure(q: Quarantine, id: string): void {
  delete q[id];
}
