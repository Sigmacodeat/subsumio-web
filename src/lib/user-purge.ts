/**
 * Hard-deletes users past the 30-day GDPR grace period that admin/data-delete
 * (POST /api/admin/data-delete) soft-deletes into (`data->>'deletedAt'`).
 *
 * A legal hold can be placed on a matter AFTER a user was soft-deleted but
 * BEFORE the 30 days elapse — admin/data-delete only ever checked the hold
 * once, at the moment of the request. This re-checks with the exact same
 * function (checkFirmLegalHolds) right before the irreversible hard delete,
 * per firm (brain), so the two checks can never diverge. Fail-closed: a
 * held firm, or one whose hold status can't be determined, is skipped this
 * run and retried on the next.
 */

import type { Pool } from "pg";
import { getOrgStore, getStore } from "./auth/store";
import { engineHeadersForBrain } from "./engine";
import { checkFirmLegalHolds, type LegalHoldCheckResult } from "./legal-hold-check";
import { logAudit } from "./audit";

export const USER_SOFT_DELETE_GRACE_DAYS = 30;

export interface UserPurgeReport {
  failed: number;
  errors: string[];
  skippedHold: number;
}

export interface UserPurgeDeps {
  /** Injectable for tests; defaults to the real per-firm engine check. */
  checkHolds?: (headers: Record<string, string>) => Promise<LegalHoldCheckResult>;
  /** Injectable for tests; defaults to resolving via the real org store. */
  resolveBrainId?: (orgId: string | null, userBrainId: string) => Promise<string>;
}

async function defaultResolveBrainId(orgId: string | null, userBrainId: string): Promise<string> {
  if (!orgId) return userBrainId;
  const org = await getOrgStore().getById(orgId);
  return org?.brainId ?? userBrainId;
}

/**
 * Legal-hold check for the firm of the user about to be deleted — not the
 * firm of whoever asks. Used by the operator's DSGVO deletion, which runs
 * from the operator's own context. Same brain resolution and check as the
 * 30-day purge below. A suspended firm is still checked (its data is kept).
 * Unknown user → "not_found"; engine trouble → "unknown" (fail closed).
 */
export async function checkLegalHoldsForUser(
  userId: string,
  deps: UserPurgeDeps = {}
): Promise<LegalHoldCheckResult | { status: "not_found" }> {
  const checkHolds = deps.checkHolds ?? checkFirmLegalHolds;
  const resolveBrainId = deps.resolveBrainId ?? defaultResolveBrainId;
  const user = await getStore().getById(userId);
  if (!user) return { status: "not_found" };
  let brainId: string;
  try {
    brainId = await resolveBrainId(user.orgId ?? null, user.brainId);
  } catch {
    return { status: "unknown" };
  }
  if (!brainId) return { status: "unknown" };
  return checkHolds(engineHeadersForBrain(brainId));
}

export async function purgeExpiredSoftDeletedUsers(
  pool: Pick<Pool, "query">,
  report: UserPurgeReport,
  deps: UserPurgeDeps = {}
): Promise<number> {
  const checkHolds = deps.checkHolds ?? checkFirmLegalHolds;
  const resolveBrainId = deps.resolveBrainId ?? defaultResolveBrainId;

  const { rows } = await pool.query<{ id: string; brain_id: string; org_id: string | null }>(
    `SELECT id,
            data->>'brainId' AS brain_id,
            data->>'orgId' AS org_id
       FROM subsumio_users
      WHERE data->>'deletedAt' IS NOT NULL
        AND (data->>'deletedAt')::timestamptz < now() - interval '${USER_SOFT_DELETE_GRACE_DAYS} days'`
  );

  // One hold check per firm per run — several soft-deleted users can share
  // a brain, and a hold check hits the engine, so cache within the run.
  const holdCache = new Map<string, LegalHoldCheckResult>();

  let purged = 0;
  for (const row of rows) {
    try {
      const brainId = await resolveBrainId(row.org_id, row.brain_id);
      let hold = holdCache.get(brainId);
      if (!hold) {
        hold = await checkHolds(engineHeadersForBrain(brainId));
        holdCache.set(brainId, hold);
      }
      if (hold.status !== "clear") {
        // "held" AND "unknown" both skip — never purge on unproven ground.
        report.skippedHold++;
        continue;
      }

      await pool
        .query(`DELETE FROM subsumio_comments WHERE user_id = $1`, [row.id])
        .catch(() => {});
      await pool
        .query(`DELETE FROM subsumio_notifications WHERE user_id = $1`, [row.id])
        .catch(() => {});
      await pool
        .query(`DELETE FROM subsumio_settings WHERE user_id = $1`, [row.id])
        .catch(() => {});
      await pool.query(`DELETE FROM subsumio_usage WHERE user_id = $1`, [row.id]).catch(() => {});
      // Session registry rows carry IP + user-agent — personal data that must
      // not outlive the account.
      await pool
        .query(`DELETE FROM subsumio_user_sessions WHERE user_id = $1`, [row.id])
        .catch(() => {});
      await pool.query(`DELETE FROM subsumio_users WHERE id = $1`, [row.id]);
      purged++;
      void logAudit("admin.data_delete", "user", {
        brainId,
        entityId: row.id,
        details: { reason: "grace_period_expired", days: USER_SOFT_DELETE_GRACE_DAYS },
      });
    } catch (err) {
      report.failed++;
      report.errors.push(
        `user ${row.id}: purge failed — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  return purged;
}
