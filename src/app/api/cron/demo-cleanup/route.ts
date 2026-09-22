// Demo cleanup cron: purges the isolated engine source of every expired
// demo session and marks the row deleted. Idempotent — purgeDemoSource
// swallows engine errors so a dead engine just retries next run.
//
// Also the demo budget watchdog: when today's question volume crosses
// DEMO_ALERT_BUDGET_PCT of the daily cap (or the purge backlog crosses
// DEMO_ALERT_PURGE_BACKLOG), a once-per-day alert mail goes to
// QUEUE_ALERT_EMAIL (same ops mailbox as the pipeline watchdog).

import { createCronHandler } from "@/lib/api-handler";
import { createDailyDedup } from "@/lib/cron-utils";
import { getDemoCapacity } from "@/lib/demo/analytics";
import { env } from "@/lib/env";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { logger } from "@/lib/logger";
import {
  listExpiredDemoSessions,
  updateDemoSession,
  purgeDemoSource,
  recordDemoEvent,
} from "@/lib/demo/session";

const log = logger("api/cron/demo-cleanup");

export const dynamic = "force-dynamic";

const alertDedup = createDailyDedup("subsumio_demo_alert_dedup");

function pct(name: string, fallback: number): number {
  const raw = env(name);
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : fallback;
}

async function checkBudgetAlerts(): Promise<{ breaches: string[]; notified: boolean }> {
  const cap = await getDemoCapacity();
  const budgetThreshold = pct("DEMO_ALERT_BUDGET_PCT", 80);
  const purgeBacklogThreshold = Number(env("DEMO_ALERT_PURGE_BACKLOG") ?? 50) || 50;

  const breaches: string[] = [];
  const budgetPct =
    cap.dailyQuestionCap > 0 ? (cap.questionsToday / cap.dailyQuestionCap) * 100 : 0;
  if (budgetPct >= budgetThreshold)
    breaches.push(
      `Demo-Fragen heute: ${cap.questionsToday}/${cap.dailyQuestionCap} (${Math.round(budgetPct)} % ≥ ${budgetThreshold} %)`
    );
  if (cap.pendingPurge >= purgeBacklogThreshold)
    breaches.push(
      `Ausstehende Source-Bereinigung: ${cap.pendingPurge} (≥ ${purgeBacklogThreshold})`
    );
  if (cap.activeSessions >= cap.maxActiveSessions)
    breaches.push(`Aktive Sessions am Limit: ${cap.activeSessions}/${cap.maxActiveSessions}`);

  if (breaches.length === 0) return { breaches, notified: false };

  const alertEmail = env("QUEUE_ALERT_EMAIL");
  if (!alertEmail || !isMailConfigured()) {
    log.error("[demo-cleanup] BREACH (no alert email / mail unconfigured):", breaches.join(" | "));
    return { breaches, notified: false };
  }
  // Dedup: one alert per day per breach-free window — a second breach on the
  // same day is already covered by the first mail.
  if (await alertDedup("demo-budget")) {
    return { breaches, notified: false };
  }
  const body =
    `Subsumio Demo-Alarm — ${breaches.length} Schwellwert(e) überschritten:\n\n` +
    breaches.map((b) => `• ${b}`).join("\n") +
    `\n\nZeitpunkt: ${new Date().toISOString()}\nDetails: /ops/demo`;
  const result = await sendMail({
    to: alertEmail,
    subject: `⚠️ Subsumio Demo-Alarm (${breaches.length})`,
    text: body,
  });
  return { breaches, notified: result.sent };
}

export const GET = createCronHandler(async () => {
  const expired = await listExpiredDemoSessions(100);
  let purged = 0;
  for (const s of expired) {
    await purgeDemoSource(s.sourceId);
    await updateDemoSession(s.id, { deletedAt: new Date().toISOString() });
    await recordDemoEvent(s.id, "expired", {
      props: { questions: s.questionsUsed, ingested: s.ingested, gated: Boolean(s.email) },
    });
    purged++;
  }
  const alerts = await checkBudgetAlerts();
  return Response.json({
    ok: true,
    expired: expired.length,
    purged,
    alerts: alerts.breaches,
    alerted: alerts.notified,
  });
});
