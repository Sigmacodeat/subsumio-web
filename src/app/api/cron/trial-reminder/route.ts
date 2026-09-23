/**
 * "Your trial ends in three days" — the one mail a firm gets before its free
 * trial runs out without a plan.
 *
 * Firms that already chose a plan during the trial are Stripe's business
 * (customer.subscription.trial_will_end in api/billing/webhook); this job is
 * for the accounts Stripe knows nothing about, which is most of them, since
 * the trial needs no card.
 */
import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import { isTrialActive, trialDaysLeft } from "@/lib/billing/trial";
import { sendMail, siteUrl } from "@/lib/mail";
import { logger } from "@/lib/logger";

const log = logger("cron/trial-reminder");

export const dynamic = "force-dynamic";

/** Days before the end at which the mail goes out. */
export const REMIND_AT_DAYS_LEFT = 3;

export function trialReminderMail(name: string, daysLeft: number, endsAt: string) {
  const day = new Date(endsAt).toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return {
    subject: `Ihre Subsumio-Testphase endet in ${daysLeft} Tagen`,
    text: [
      `Guten Tag${name ? ` ${name}` : ""},`,
      "",
      `Ihre Testphase läuft noch bis ${day}. Wählen Sie bis dahin keinen Tarif, bleiben Ihre Akten,`,
      "Fristen und Dokumente erhalten und die Fristenerinnerungen laufen weiter. KI-Funktionen gibt es",
      "danach nur mit einem Tarif oder zugekauftem KI-Guthaben.",
      "",
      `Tarif wählen: ${siteUrl()}/dashboard/billing`,
      "",
      "Wenn Sie Fragen haben oder eine Verlängerung brauchen, antworten Sie einfach auf diese E-Mail.",
    ].join("\n"),
  };
}

async function handler(_req: NextRequest): Promise<Response> {
  const store = getStore();
  const users = await store.list();
  const now = new Date();
  let sent = 0;
  let failed = 0;

  for (const user of users) {
    if (user.deactivatedAt || user.trialReminderSentAt) continue;
    if (!isTrialActive(user, now)) continue;
    const daysLeft = trialDaysLeft(user, now);
    if (daysLeft > REMIND_AT_DAYS_LEFT || daysLeft < 1) continue;
    if (!user.email) continue;

    const mail = trialReminderMail(user.name ?? "", daysLeft, user.trialEndsAt as string);
    try {
      await sendMail({ to: user.email, subject: mail.subject, text: mail.text });
      await store.update(user.id, { trialReminderSentAt: new Date().toISOString() });
      sent++;
    } catch (err) {
      failed++;
      log.warn("trial reminder failed", {
        user: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("trial reminders", { sent, failed });
  return Response.json({ ok: true, sent, failed });
}

export const GET = createCronHandler(handler);
export const POST = createCronHandler(handler);
