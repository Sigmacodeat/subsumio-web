import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { env } from "@/lib/env";
import { isMailConfigured, sendMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/queue-alert
 *
 * Watchdog for the ingestion + agent pipeline. Pulls the engine's
 * /api/jobs/health and raises an email alert when a breach threshold is
 * crossed — dead-lettered jobs, a wedged queue (no completion for N minutes
 * while work waits), a backlog spike, or outbox dead-letters piling up.
 *
 * All thresholds are env-tunable; defaults are conservative (alert early).
 * Alerts go to QUEUE_ALERT_EMAIL (falls back to no-op + logged breach if mail
 * isn't configured, so the cron is always safe to enable).
 */

function num(name: string, fallback: number): number {
  const raw = env(name);
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

interface JobsHealth {
  by_type?: Array<{ name: string; dead: number; failed: number }>;
  queue_health?: { waiting: number; active: number; stalled: number };
  wedge?: { waiting: number; minutes_since_completion: number | null } | null;
  dead_letter?: { outbox_exhausted: number | null; docs_failed: number | null };
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const res = await fetch(`${ENGINE_URL}/api/jobs/health`, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return Response.json(
      { ok: false, error: "engine_unreachable", status: res.status },
      { status: 502 }
    );
  }
  const health = (await res.json()) as JobsHealth;

  const deadThreshold = num("QUEUE_ALERT_DEAD_THRESHOLD", 1);
  const exhaustedThreshold = num("QUEUE_ALERT_OUTBOX_THRESHOLD", 1);
  const docsFailedThreshold = num("QUEUE_ALERT_DOCS_FAILED_THRESHOLD", 10);
  const backlogThreshold = num("QUEUE_ALERT_BACKLOG", 100);
  const wedgeMinutes = num("QUEUE_ALERT_WEDGE_MINUTES", 30);

  const deadTotal = (health.by_type ?? []).reduce((sum, t) => sum + (t.dead ?? 0), 0);
  const waiting = health.queue_health?.waiting ?? 0;
  const outboxExhausted = health.dead_letter?.outbox_exhausted ?? 0;
  const docsFailed = health.dead_letter?.docs_failed ?? 0;
  const wedgeMins = health.wedge?.minutes_since_completion ?? null;
  const wedgeWaiting = health.wedge?.waiting ?? 0;

  const breaches: string[] = [];
  if (deadTotal >= deadThreshold)
    breaches.push(`Dead-lettered Jobs: ${deadTotal} (≥ ${deadThreshold})`);
  if (outboxExhausted >= exhaustedThreshold)
    breaches.push(`Post-Upload-Tasks erschöpft: ${outboxExhausted} (≥ ${exhaustedThreshold})`);
  if (docsFailed >= docsFailedThreshold)
    breaches.push(
      `Dokumente mit fehlgeschlagener Extraktion/Analyse: ${docsFailed} (≥ ${docsFailedThreshold})`
    );
  if (waiting >= backlogThreshold)
    breaches.push(`Queue-Backlog: ${waiting} wartende Jobs (≥ ${backlogThreshold})`);
  if (wedgeMins !== null && wedgeMins >= wedgeMinutes && wedgeWaiting > 0)
    breaches.push(
      `Queue verklemmt: seit ${Math.round(wedgeMins)} min kein Abschluss bei ${wedgeWaiting} wartenden Jobs`
    );

  if (breaches.length === 0) {
    return Response.json({
      ok: true,
      healthy: true,
      checked: { deadTotal, waiting, outboxExhausted, docsFailed, wedgeMins },
    });
  }

  const alertEmail = env("QUEUE_ALERT_EMAIL");
  let notified = false;
  if (alertEmail && isMailConfigured()) {
    const body =
      `Subsumio Pipeline-Alarm — ${breaches.length} Schwellwert(e) überschritten:\n\n` +
      breaches.map((b) => `• ${b}`).join("\n") +
      `\n\nZeitpunkt: ${new Date().toISOString()}\nDetails: /dashboard/monitoring`;
    const result = await sendMail({
      to: alertEmail,
      subject: `⚠️ Subsumio Pipeline-Alarm (${breaches.length})`,
      text: body,
    });
    notified = result.sent;
  } else {
    console.error(
      "[queue-alert] BREACH (no alert email / mail unconfigured):",
      breaches.join(" | ")
    );
  }

  return Response.json({ ok: true, healthy: false, breaches, notified });
});
