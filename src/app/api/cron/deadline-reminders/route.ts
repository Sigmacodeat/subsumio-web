import { NextRequest, NextResponse } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import nodemailer from "nodemailer";
import { createCronHandler } from "@/lib/api-handler";
import type { BrainPage } from "@/lib/types";
import { getRecipientsByBrain } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";

interface DeadlineItem {
  title?: string;
  due_date?: string;
  date?: string;
  reminder_sent_at?: string;
}

async function listCasePages(brainId: string): Promise<BrainPage[]> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=case&limit=1000`,
      { headers: engineHeadersForBrain(brainId) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function updatePageDeadlines(brainId: string, slug: string, fm: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...engineHeadersForBrain(brainId) },
      body: JSON.stringify({ slug, frontmatter: fm, merge: true }),
    });
  } catch {
    // Einzelne Update-Fehler dürfen Cron nicht abbrechen
  }
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const settings = await loadKanzleiSettings();
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
    return NextResponse.json({ error: "smtp_not_configured" }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: parseInt(settings.smtpPort ?? "587", 10),
    secure: settings.smtpSecure ?? false,
    auth: { user: settings.smtpUser, pass: settings.smtpPassword },
  });

  const fromAddr = settings.emailFrom ?? settings.smtpUser;
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  // Brain → Empfänger
  const recipientsByBrain = await getRecipientsByBrain();

  let brainsChecked = 0;
  let totalSent = 0;
  const errors: string[] = [];

  for (const [brainId, recipients] of recipientsByBrain) {
    brainsChecked++;
    const pages = await listCasePages(brainId);
    if (pages.length === 0) continue;

    const toEmail = recipients[0]?.email ?? settings.smtpUser;

    for (const page of pages) {
      const fm = page.frontmatter ?? {};
      const deadlines = Array.isArray(fm.deadlines) ? fm.deadlines as DeadlineItem[] : [];
      const upcoming = deadlines.filter((d) => {
        const dd = String(d.due_date ?? d.date ?? "");
        if (!dd || dd < today) return false;
        if (dd > in3Days) return false;
        if (d.reminder_sent_at) return false;
        return true;
      });

      if (upcoming.length === 0) continue;

      const subject = `Fristen-Erinnerung — Akte ${String(fm.case_number ?? page.slug)}`;
      const html = `<p>Sehr geehrte/r ${settings.anwaltName || "Anwalt"},</p>
<p>folgende Fristen stehen in den nächsten 3 Tagen an:</p>
<ul>
${upcoming.map((d) => `<li><strong>${String(d.title ?? "Frist")}</strong> — ${String(d.due_date ?? d.date ?? "")}</li>`).join("\n")}
</ul>
<p>Akte: ${String(fm.case_number ?? page.slug)} — ${String(fm.title ?? page.title ?? "")}</p>
<p>Subsumio Kanzlei-OS</p>`;

      try {
        await transporter.sendMail({ from: fromAddr, to: toEmail, subject, html });

        const updatedDeadlines = deadlines.map((d) => {
          const dd = String(d.due_date ?? d.date ?? "");
          if (dd >= today && dd <= in3Days && !d.reminder_sent_at) {
            return { ...d, reminder_sent_at: now.toISOString() };
          }
          return d;
        });

        await updatePageDeadlines(brainId, page.slug, { ...fm, deadlines: updatedDeadlines });
        totalSent += upcoming.length;
      } catch (err) {
        errors.push(String(err instanceof Error ? err.message : err));
      }
    }
  }

  return NextResponse.json({ ok: true, brains_checked: brainsChecked, sent: totalSent, errors: errors.length > 0 ? errors : undefined });
});
