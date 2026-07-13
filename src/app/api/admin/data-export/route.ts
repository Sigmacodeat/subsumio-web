/**
 * T7.3 / WP7.3.3 — DSAR Data Export (GDPR Art. 15)
 *
 * Admin endpoint to export all personal data for a given user.
 * Returns a JSON bundle with all user-related records.
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  user_id: z.string().min(1).max(200),
  format: z.enum(["json", "csv"]).default("json"),
});

export const POST = createHandler(
  {
    action: "admin.data_export",
    rateTier: "heavy",
    body: exportSchema,
    audit: (ctx, body) => ({
      action: "admin.data_export",
      entityType: "user",
      entityId: body.user_id,
      details: {
        format: body.format,
        by: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required for data export", 403);
    }

    const pool = getSharedPgPool();
    if (!pool) {
      return apiError(
        "server_error",
        "Database not configured — data export requires PostgreSQL",
        503
      );
    }

    const userId = body.user_id;
    const exportData: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      exported_by: ctx.user.email,
      user_id: userId,
      format: body.format,
    };

    // 1. User profile
    try {
      const { rows: userRows } = await pool.query(
        `SELECT id, email, referral_code, data, created_at, updated_at
         FROM subsumio_users WHERE id = $1`,
        [userId]
      );
      exportData.profile = userRows[0] ?? null;
    } catch (err) {
      exportData.profile_error = err instanceof Error ? err.message : String(err);
    }

    // 2. Session revocations
    try {
      const { rows: revRows } = await pool.query(
        `SELECT user_id, min_version, updated_at
         FROM subsumio_session_revocations WHERE user_id = $1`,
        [userId]
      );
      exportData.sessions = revRows;
    } catch (err) {
      exportData.sessions_error = err instanceof Error ? err.message : String(err);
    }

    // 3. Audit log entries
    try {
      const { rows: auditRows } = await pool.query(
        `SELECT id::text, action, entity_type, entity_id, user_id, user_email,
                details, ip, hash, prev_hash, created_at
         FROM subsumio_audit_log
         WHERE user_id = $1 OR (details->>'userId') = $1
         ORDER BY created_at DESC
         LIMIT 5000`,
        [userId]
      );
      exportData.audit_trail = auditRows;
    } catch (err) {
      exportData.audit_trail_error = err instanceof Error ? err.message : String(err);
    }

    // 4. Usage / quota data
    try {
      const { rows: usageRows } = await pool.query(
        `SELECT * FROM subsumio_usage WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
        [userId]
      );
      exportData.usage = usageRows;
    } catch {
      exportData.usage = [];
    }

    // 5. Comments
    try {
      const { rows: commentRows } = await pool.query(
        `SELECT * FROM subsumio_comments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
        [userId]
      );
      exportData.comments = commentRows;
    } catch {
      exportData.comments = [];
    }

    // 6. Notifications
    try {
      const { rows: notifRows } = await pool.query(
        `SELECT * FROM subsumio_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
        [userId]
      );
      exportData.notifications = notifRows;
    } catch {
      exportData.notifications = [];
    }

    // 7. Settings
    try {
      const { rows: settingsRows } = await pool.query(
        `SELECT * FROM subsumio_settings WHERE user_id = $1`,
        [userId]
      );
      exportData.settings = settingsRows;
    } catch {
      exportData.settings = [];
    }

    // 8. Org membership
    try {
      const { rows: orgRows } = await pool.query(
        `SELECT id, owner_id, data, created_at, updated_at
         FROM subsumio_orgs WHERE owner_id = $1 OR (data->>'members')::jsonb ? $1`,
        [userId]
      );
      exportData.org_memberships = orgRows;
    } catch {
      exportData.org_memberships = [];
    }

    await logAudit("admin.data_export", "user", {
      entityId: userId,
      brainId: ctx.brainId,
      details: { format: body.format, by: ctx.user.email },
    });

    return apiSuccess(exportData);
  }
);
