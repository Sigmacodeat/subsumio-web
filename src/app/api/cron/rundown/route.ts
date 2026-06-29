import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getRecipientsByBrain } from "@/lib/cron-utils";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { renderMarkdown } from "@/lib/markdown";
import { loadAllowedSenders } from "@/lib/whatsapp/verify";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/rundown — Daily Rundown Agent with email + WhatsApp delivery.
 *
 * For each brain (Kanzlei):
 *  1. Submits a supervisor job with the Rundown prompt
 *  2. Polls the engine for job completion (up to 120s)
 *  3. Emails the result to all recipients of that brain
 *  4. Sends a WhatsApp notification (if consent + window allow)
 *
 * The job is tagged name="rundown" so the frontend can filter for it
 * on the Reports page.
 */

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_MS = 120_000;

interface RundownResult {
  brainId: string;
  jobId: number | null;
  result: string | null;
  status: string;
}

async function submitAndWait(
  brainId: string,
  headers: Record<string, string>
): Promise<RundownResult> {
  const submitRes = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      prompt: RUNDOWN_PROMPT,
      name: "rundown",
      role: "planning",
      force_specialists: ["legal-analyst", "legal-deadline-extractor"],
      // Hard budget cap: aborts the entire tree once $0.50 is spent.
      // Prevents runaway subagent spawning from burning through credits.
      budget_remaining_cents: 50,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    return { brainId, jobId: null, result: null, status: "submit_failed" };
  }

  const submitData = await submitRes.json();
  const jobId = submitData.jobId ?? submitData.id;
  if (!jobId) {
    return { brainId, jobId: null, result: null, status: "no_job_id" };
  }

  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${ENGINE_URL}/api/agents/${jobId}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusRes.ok) continue;

    const job = await statusRes.json();
    const status = String(job.status ?? "");

    if (status === "completed" || status === "partial_success" || status === "needs_review") {
      return {
        brainId,
        jobId,
        result: String(job.result ?? job.output ?? ""),
        status,
      };
    }

    if (status === "failed") {
      return { brainId, jobId, result: null, status: "failed" };
    }
  }

  return { brainId, jobId, result: null, status: "timeout" };
}

function buildEmailHtml(result: string): string {
  const html = renderMarkdown(result);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">✨ Subsumio Rundown</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Tägliches Kanzlei-Briefing</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
    ${html}
  </div>
  <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px;">
    Generiert von Subsumio AI · <a href="https://subsum.io/dashboard/reports" style="color:#6366f1;">Alle Berichte ansehen</a>
  </p>
</body>
</html>`;
}

const RUNDOWN_PROMPT = `Du bist der Subsumio Rundown-Agent. Erstelle das tägliche Kanzlei-Briefing.

## Aufgabe
1. **Fristen-Check**: Durchsuche alle legal_case Pages nach Fristen der nächsten 7 Tage. Priorisiere nach Dringlichkeit (gerichtlich > vertraglich > intern).
2. **Offene Tasks**: Liste alle ausstehenden Freigaben (agent_actions mit status=pending) und Review-Lücken auf.
3. **Akten-Progress**: Fasse zusammen, welche Akten in den letzten 24 Stunden aktiv waren (neue Dokumente, Queries, Agenten-Läufe).
4. **Empfehlungen**: Gib 3-5 priorisierte Handlungsempfehlungen für den Tag, basierend auf Fristen, Offenem und Akten-Status.

## Format
Strukturiere als:
### 📅 Fristen diese Woche
### ✅ Offene Freigaben
### 📁 Kürzlich aktive Akten
### 🎯 Empfehlungen für heute

Sei präzise und kurz. Verweise auf Akten-Slugs wo möglich.`;

export const GET = createCronHandler(async (_req: NextRequest): Promise<Response> => {
  if (env("ENABLE_RUNDOWN_CRON") !== "true") {
    console.log(
      "[cron/rundown] DISABLED — set ENABLE_RUNDOWN_CRON=true to re-enable. Use daily-briefing cron instead ($0 vs ~$5/day)."
    );
    return Response.json({
      ok: false,
      disabled: true,
      reason:
        "Rundown cron disabled — use /api/cron/daily-briefing instead. Set ENABLE_RUNDOWN_CRON=true to override.",
    });
  }

  const recipientsByBrain = await getRecipientsByBrain();
  const brainIds = new Set(recipientsByBrain.keys());
  const senders = loadAllowedSenders();
  const mailOn = isMailConfigured();

  let submitted = 0;
  let completed = 0;
  let emailed = 0;
  let whatsapped = 0;
  let failed = 0;

  for (const brainId of brainIds) {
    try {
      const headers = engineHeadersForBrain(brainId);
      const result = await submitAndWait(brainId, headers);

      if (result.jobId) submitted++;
      else {
        failed++;
        continue;
      }

      if (result.result) {
        completed++;

        // Email delivery
        if (mailOn) {
          const recipients = recipientsByBrain.get(brainId) ?? [];
          const emails = recipients.map((u) => u.email).filter((e): e is string => Boolean(e));

          if (emails.length > 0) {
            const subject = `Subsumio Rundown — ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}`;
            const html = buildEmailHtml(result.result);

            const mailResult = await sendMail({
              to: emails,
              subject,
              html,
              text: result.result,
            });

            if (mailResult.sent) emailed++;
          }
        }

        // WhatsApp delivery (short notification with link)
        const brainSenders = senders.filter((s) => s.brainId === brainId);
        for (const sender of brainSenders) {
          try {
            const templateName = env("WHATSAPP_BRIEFING_TEMPLATE");
            const waResult = await sendProactiveMessage({
              to: sender.phone,
              brainId,
              scope: "daily_briefing",
              freeform: `✨ Subsumio Rundown ist bereit!\n\nIhr tägliches Kanzlei-Briefing wurde generiert.\n\n👉 https://subsum.io/dashboard/reports`,
              template: templateName ? { name: templateName, language: { code: "de" } } : undefined,
            });
            if (waResult.sent) whatsapped++;
          } catch {
            // WhatsApp send failure is non-fatal
          }
        }
      } else {
        failed++;
      }
    } catch (err) {
      console.error(
        `[cron/rundown] brain ${brainId} error:`,
        err instanceof Error ? err.message : String(err)
      );
      failed++;
    }
  }

  console.log(
    `[cron/rundown] submitted=${submitted} completed=${completed} emailed=${emailed} whatsapped=${whatsapped} failed=${failed} brains=${brainIds.size}`
  );

  return Response.json({
    submitted,
    completed,
    emailed,
    whatsapped,
    failed,
    brains: brainIds.size,
  });
});
