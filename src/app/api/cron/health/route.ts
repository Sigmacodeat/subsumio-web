import { NextRequest, NextResponse } from "next/server";
import { getSharedPgPool } from "@/lib/auth/store";
import { validateCronAuth } from "@/lib/cron-auth";
import { ENGINE_URL } from "@/lib/engine";
import { checkBackup, checkDisk } from "@/lib/ops-health";

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
 * (e.g. self-hosted Uptime Kuma, Better Stack) to detect silent cron failures.
 * Auth: Bearer CRON_SECRET (same as all cron endpoints).
 */
export async function GET(req: NextRequest) {
  const authError = await validateCronAuth(req);
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
      // Freshness, not mere existence: the digest runs daily (06:00 UTC) and
      // logs one row per firm it mailed. The newest row must be from today or
      // yesterday (UTC) — before 06:00 today's run has not happened yet. An
      // older newest row means the digest has stopped running.
      const lastDay = entries[0]?.last_day ? String(entries[0].last_day).slice(0, 10) : "";
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const fresh = lastDay !== "" && lastDay >= yesterday;
      checks.deadline_digest = {
        ok: fresh,
        detail:
          entries.length === 0
            ? "no notifications logged yet"
            : fresh
              ? `last: ${lastDay} (${entries.length} brains)`
              : `STALE — last digest ${lastDay}, expected ${yesterday} or later`,
      };
    } catch {
      checks.deadline_digest = { ok: false, detail: "table not initialized" };
    }
  } else {
    checks.deadline_digest = { ok: false, detail: "no db — dedup disabled" };
  }

  // 4. Engine reachable?
  try {
    // /health is the engine's unauthenticated probe; /api/* needs a tenant header.
    const res = await fetch(`${ENGINE_URL}/health`, { signal: AbortSignal.timeout(5_000) });
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

  // 6. Notification channels (SMTP, WhatsApp, Push). SMTP is configured PER
  // FIRM, so every firm's settings are read from its own brain with trusted
  // headers. A firm without SMTP is a firm choice (reminders fall back to
  // in-app) and only shows in the detail; a firm whose settings cannot be
  // read at all is a failure — the reminder cron cannot mail it either.
  try {
    const { loadKanzleiSettingsForBrain, isSmtpConfigured } =
      await import("@/lib/kanzlei-settings-server");
    const { getRecipientsByBrain, mapWithConcurrency } = await import("@/lib/cron-utils");
    const brains = [...(await getRecipientsByBrain()).keys()];
    const reads = await mapWithConcurrency(brains, (brainId) =>
      loadKanzleiSettingsForBrain(brainId, { timeoutMs: 5_000 })
    );
    let smtpFirms = 0;
    let unreadable = 0;
    for (const r of reads) {
      if (r.status === "rejected") unreadable++;
      else if (isSmtpConfigured(r.value)) smtpFirms++;
    }
    const smtpOn = smtpFirms > 0;
    const waOn = !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
    const pushOn = !!(process.env.APNS_TEAM_ID || process.env.FCM_SERVICE_ACCOUNT_PATH);
    const platformMailOn = !!process.env.RESEND_API_KEY;
    checks.notifications = {
      ok: unreadable === 0,
      detail:
        `email(SMTP) ${smtpFirms}/${brains.length} firms${smtpOn ? "" : " — reminders in-app only"}` +
        ` · digest-mail ${platformMailOn ? "✓" : "✗"} ${waOn ? "whatsapp✓" : "whatsapp✗"} ${pushOn ? "push✓" : "push✗"}` +
        (unreadable > 0 ? ` · settings unreadable for ${unreadable} firm(s)` : ""),
    };
  } catch (err) {
    checks.notifications = {
      ok: false,
      detail: `cannot check firm settings: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 7. Free disk space — a full disk took the engine down for weeks unnoticed.
  checks.disk = await checkDisk();

  // 8. Age of the last successful backup.
  checks.backup = await checkBackup();

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
