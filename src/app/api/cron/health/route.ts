import { NextRequest, NextResponse } from "next/server";
import { getSharedPgPool } from "@/lib/auth/store";
import { validateCronAuth } from "@/lib/cron-auth";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/health — Cron monitoring endpoint.
 *
 * Returns the status of all cron jobs, including:
 *   - Last execution time (from the dedup tables)
 *   - Whether the cron secret is configured
 *   - Database connectivity
 *   - Deadline digest dedup table (last notification per brain)
 *   - Pipeline-sync status (deadline_calendar pages exist)
 *   - Engine reachability
 *
 * This endpoint should be polled by external monitoring
 * (e.g. Hetzner Uptime Kuma, Better Stack) to detect silent cron failures.
 * Auth: Bearer CRON_SECRET (same as all cron endpoints).
 */
export async function GET(req: NextRequest) {
  const authError = validateCronAuth(req);
  if (authError) return authError;

  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1. Cron secret configured?
  checks.cron_secret = {
    ok: !!process.env.CRON_SECRET,
    detail: process.env.CRON_SECRET ? "configured" : "missing — cron endpoints unprotected",
  };

  // 2. Database connectivity (for dedup tables)
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await pool.query("SELECT 1");
      checks.database = { ok: true, detail: "connected" };
    } catch (err) {
      checks.database = {
        ok: false,
        detail: err instanceof Error ? err.message : "query failed",
      };
    }
  } else {
    checks.database = { ok: false, detail: "no pool (dev mode)" };
  }

  // 3. Deadline dedup table — check last notification
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT brain_id, MAX(day) as last_day
         FROM subsumio_notify_log
         GROUP BY brain_id
         ORDER BY last_day DESC
         LIMIT 5`
      );
      const entries = result.rows as Array<{ brain_id: string; last_day: string }>;
      checks.deadline_digest = {
        ok: entries.length > 0,
        detail:
          entries.length > 0
            ? `last: ${entries[0]?.last_day} (${entries.length} brains)`
            : "no notifications logged yet",
      };
    } catch {
      checks.deadline_digest = { ok: false, detail: "table not initialized" };
    }
  } else {
    checks.deadline_digest = { ok: false, detail: "no db — dedup disabled" };
  }

  // 4. Engine reachable?
  try {
    const res = await fetch(`${ENGINE_URL}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    checks.engine = { ok: res.ok, detail: res.ok ? "reachable" : `HTTP ${res.status}` };
  } catch (err) {
    checks.engine = {
      ok: false,
      detail: err instanceof Error ? err.message : "unreachable",
    };
  }

  // 5. Pipeline-sync: check if deadline_calendar pages exist (pipeline is feeding deadlines)
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as cnt FROM pages
         WHERE type = 'deadline_calendar' AND deleted_at IS NULL`
      );
      const count = Number((result.rows[0] as { cnt?: string }).cnt ?? 0);
      checks.pipeline_sync = {
        ok: true,
        detail:
          count > 0
            ? `${count} deadline_calendar page(s) — pipeline feeding`
            : "no deadline_calendar pages yet (pipeline may not have run)",
      };
    } catch {
      checks.pipeline_sync = { ok: true, detail: "table check skipped" };
    }
  } else {
    checks.pipeline_sync = { ok: false, detail: "no db — cannot verify" };
  }

  // 6. Notification channels configured (SMTP, WhatsApp, Push)
  try {
    const { loadKanzleiSettings } = await import("@/lib/kanzlei-settings");
    const smtpSettings = await loadKanzleiSettings();
    const smtpOn = !!(smtpSettings.smtpHost && smtpSettings.smtpUser && smtpSettings.smtpPassword);
    const waOn = !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
    const pushOn = !!(process.env.APNS_TEAM_ID || process.env.FCM_SERVER_KEY);
    const channels: string[] = [];
    if (!smtpOn) channels.push("email");
    if (!waOn) channels.push("whatsapp");
    if (!pushOn) channels.push("push");
    checks.notifications = {
      ok: smtpOn,
      detail: smtpOn
        ? `email✓ ${waOn ? "whatsapp✓" : "whatsapp✗"} ${pushOn ? "push✓" : "push✗"}`
        : `missing: ${channels.join(", ")} — deadline reminders degraded to in-app only`,
    };
  } catch {
    checks.notifications = { ok: false, detail: "cannot load kanzlei settings" };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      ok: allOk,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}
