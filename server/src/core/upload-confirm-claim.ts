/**
 * One confirm per upload token at a time. Confirm downloads, scans, extracts
 * and imports — minutes for a large file. A second confirm with the same
 * token (double click, browser retry after a proxy timeout, a second tab)
 * used to run the whole chain again: a second document page and double
 * extraction/pipeline cost.
 */
export interface ClaimableUpload {
  confirming?: boolean;
}

/** Claim the upload for this confirm; false when another confirm is already running. */
export function claimPendingUpload(pending: ClaimableUpload): boolean {
  if (pending.confirming) return false;
  pending.confirming = true;
  return true;
}

/** Give the upload back after a confirm that did not finish (so it can be retried). */
export function releasePendingUpload(pending: ClaimableUpload): void {
  pending.confirming = false;
}
