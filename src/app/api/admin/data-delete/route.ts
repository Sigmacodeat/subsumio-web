/**
 * T7.3 / WP7.3.3 — DSAR Data Delete (GDPR Art. 17 — Right to Erasure)
 *
 * Admin endpoint to delete all personal data for a given user.
 * Implements a soft-delete with 30-day grace period before hard deletion.
 * Legal hold cases prevent deletion until the hold is released.
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { getSharedPgPool } from "@/lib/auth/store";
import { checkFirmLegalHolds } from "@/lib/legal-hold-check";

import { logger } from "@/lib/logger";
const log = logger("api/admin/data-delete");

export const dynamic = "force-dynamic";

const deleteSchema = z.object({
  user_id: z.string().min(1).max(200),
  reason: z.enum([
    "user_request",
    "gdpr_art17",
    "deprovisioning",
    "legal_requirement",
    "data_minimization",
  ]),
  immediate: z.boolean().default(false),
  legal_hold_override: z.boolean().default(false),
});

export const POST = createHandler(
  {
    action: "platform.operator",
    rateTier: "heavy",
    body: deleteSchema,
    audit: (ctx, body) => ({
      action: "admin.data_delete",
      entityType: "user",
      entityId: body.user_id,
      details: {
        reason: body.reason,
        immediate: body.immediate,
        legal_hold_override: body.legal_hold_override,
        by: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError(
        "server_error",
        "Database not configured — data deletion requires PostgreSQL",
        503
      );
    }

    const userId = body.user_id;
    const actionsTaken: string[] = [];

    // 0. Legal hold gate — actually checked, not just reported. A matter
    // under legal hold keeps its personal data until the hold is released;
    // the operator must pass legal_hold_override knowingly. The check runs
    // with the operator's signed identity (ctx.headers) — the
    // engine-identity-guard forbids identity-less firm headers here, so the
    // scan covers exactly the matters the operator may see. Shared with the
    // 30-day hard-delete purge (cron/trash-purge) via checkFirmLegalHolds so
    // a hold placed during the grace window is caught by the SAME check,
    // not a second, divergent copy of it.
    const holdCheck = await checkFirmLegalHolds(ctx.headers);
    if (holdCheck.status === "unknown") {
      // Engine unreachable → fail closed: cannot prove no hold exists.
      log.error("[data-delete] legal hold check failed: engine unreachable");
      return apiError(
        "legal_hold_unknown",
        "Legal-Hold-Status der Akten nicht prüfbar — Löschung abgebrochen.",
        503
      );
    }
    const heldCases = holdCheck.status === "held" ? holdCheck.cases : [];
    if (heldCases.length > 0 && !body.legal_hold_override) {
      return apiError(
        "legal_hold_active",
        `Löschung blockiert: ${heldCases.length} Akte(n) unter Legal Hold (${heldCases.slice(0, 5).join(", ")}).`,
        409
      );
    }

    // 1. Revoke all sessions
    try {
      await pool.query(
        `INSERT INTO subsumio_session_revocations (user_id, min_version, updated_at)
         VALUES ($1, 999999, now())
         ON CONFLICT (user_id) DO UPDATE SET min_version = 999999, updated_at = now()`,
        [userId]
      );
      actionsTaken.push("sessions_revoked");
    } catch (err) {
      log.error(`[data-delete] session revocation failed: ${err}`);
    }

    // 2. Remove from ACL groups (via org data)
    try {
      await pool.query(
        `UPDATE subsumio_orgs
         SET data = data - 'members',
             updated_at = now()
         WHERE owner_id = $1 OR (data->>'members')::jsonb ? $1`,
        [userId]
      );
      actionsTaken.push("acl_groups_removed");
    } catch {
      // Non-critical
    }

    // 3. Delete comments
    try {
      if (body.immediate) {
        await pool.query(`DELETE FROM subsumio_comments WHERE user_id = $1`, [userId]);
        actionsTaken.push("comments_deleted");
      } else {
        await pool.query(
          `UPDATE subsumio_comments SET user_id = NULL, content = '[anonymized]' WHERE user_id = $1`,
          [userId]
        );
        actionsTaken.push("comments_anonymized");
      }
    } catch {
      // Table may not exist
      actionsTaken.push("comments_skipped");
    }

    // 4. Delete notifications
    try {
      if (body.immediate) {
        await pool.query(`DELETE FROM subsumio_notifications WHERE user_id = $1`, [userId]);
        actionsTaken.push("notifications_deleted");
      } else {
        await pool.query(`UPDATE subsumio_notifications SET user_id = NULL WHERE user_id = $1`, [
          userId,
        ]);
        actionsTaken.push("notifications_anonymized");
      }
    } catch {
      actionsTaken.push("notifications_skipped");
    }

    // 5. Delete settings
    try {
      await pool.query(`DELETE FROM subsumio_settings WHERE user_id = $1`, [userId]);
      actionsTaken.push("settings_deleted");
    } catch {
      actionsTaken.push("settings_skipped");
    }

    // 6. Delete usage data
    try {
      if (body.immediate) {
        await pool.query(`DELETE FROM subsumio_usage WHERE user_id = $1`, [userId]);
        actionsTaken.push("usage_deleted");
      } else {
        await pool.query(`UPDATE subsumio_usage SET user_id = NULL WHERE user_id = $1`, [userId]);
        actionsTaken.push("usage_anonymized");
      }
    } catch {
      actionsTaken.push("usage_skipped");
    }

    // 7. Anonymize audit log entries (keep action, remove PII)
    try {
      await pool.query(
        `UPDATE subsumio_audit_log
         SET user_id = NULL, user_email = NULL,
             details = jsonb_set(details, '{userId}', 'null') - 'userEmail'
         WHERE user_id = $1`,
        [userId]
      );
      actionsTaken.push("audit_log_anonymized");
    } catch {
      // Audit log may have immutability triggers — anonymization may need a separate column
      actionsTaken.push("audit_log_anonymization_skipped");
    }

    // 8. Soft-delete or hard-delete user profile
    if (body.immediate) {
      try {
        await pool.query(`DELETE FROM subsumio_users WHERE id = $1`, [userId]);
        actionsTaken.push("user_profile_deleted");
      } catch (err) {
        log.error(`[data-delete] user deletion failed: ${err}`);
        actionsTaken.push("user_profile_delete_failed");
      }
    } else {
      try {
        await pool.query(
          `UPDATE subsumio_users
           SET data = jsonb_set(data, '{deletedAt}', to_jsonb(now())),
               email = $2,
               updated_at = now()
           WHERE id = $1`,
          [userId, `deleted-${userId}@anonymized.local`]
        );
        actionsTaken.push("user_profile_soft_deleted");
      } catch (err) {
        log.error(`[data-delete] user soft-delete failed: ${err}`);
        actionsTaken.push("user_profile_soft_delete_failed");
      }
    }

    const deletionResult = {
      user_id: userId,
      reason: body.reason,
      immediate: body.immediate,
      scheduled_deletion: body.immediate
        ? new Date().toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: body.immediate ? "deleted" : "scheduled",
      actions_taken: actionsTaken,
      legal_hold_checked: true,
      legal_hold_held_cases: heldCases.length,
      legal_hold_override_applied: body.legal_hold_override && heldCases.length > 0,
    };

    await logAudit("admin.data_delete", "user", {
      entityId: userId,
      brainId: ctx.brainId,
      details: {
        reason: body.reason,
        immediate: body.immediate,
        status: deletionResult.status,
        actions_taken: actionsTaken,
        by: ctx.user.email,
      },
    });

    return apiSuccess(deletionResult);
  }
);
