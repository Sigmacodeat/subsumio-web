import { NextRequest, NextResponse } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import {
  batchFetchPages,
  fetchPendingApprovals,
  fetchRecentCaseActivity,
  fetchRecentDocuments,
  fetchContradictions,
  getRecipientsByBrain,
  createDailyDedup,
} from "@/lib/cron-utils";
import { loadAllowedSenders, phoneHash } from "@/lib/whatsapp/verify";
import {
  buildDailyBriefing,
  BRIEFING_DEDUP_TABLE,
  type BriefingCase,
  type BriefingApproval,
  type BriefingCaseActivity,
  type BriefingDocument,
  type BriefingContradiction,
} from "@/lib/whatsapp/daily-briefing";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { env } from "@/lib/env";
import type { QuietHours } from "@/lib/whatsapp/outbound-gate";

// One GPT-4o-mini call to sharpen the "Empfehlungen für heute" section.
// Input: structured briefing data (already computed, $0). Output: 3-5 German sentences.
// Cost: ~$0.001/day. Falls back silently to deterministic recommendations on any error.
async function enrichRecommendationsWithAI(
  baseText: string,
  context: { deadlineCount: number; approvalCount: number; docCount: number; activityCount: number }
): Promise<string> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) return baseText;

  const systemPrompt = `Du bist ein erfahrener Kanzleiassistent. Gib 3-5 präzise, priorisierte Handlungsempfehlungen für den heutigen Arbeitstag auf Basis der strukturierten Kanzleidaten. Deutsch, kurz, actionable. Keine Wiederholung von Fakten die im Briefing schon stehen.`;
  const userPrompt = `Kanzlei-Daten heute:
- Fristen in 7 Tagen: ${context.deadlineCount}
- Offene Freigaben: ${context.approvalCount}
- Neue Dokumente (24h): ${context.docCount}
- Aktive Akten (24h): ${context.activityCount}

Bestehende Empfehlungen (deterministisch):
${baseText.split("🎯 Empfehlungen für heute:")[1]?.split("\n\n")[0] ?? "–"}

Verbessere die Empfehlungen: priorisiere klarer, erkenne Muster (z.B. viele Fristen + keine Fortschritte = Kapazitätsproblem), formuliere konkrete nächste Schritte.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return baseText;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const improved = data.choices?.[0]?.message?.content?.trim();
    if (!improved) return baseText;
    // Replace the recommendations block in the existing text
    const marker = "🎯 Empfehlungen für heute:";
    const idx = baseText.indexOf(marker);
    if (idx === -1) return baseText + `\n\n${marker}\n${improved}`;
    const afterMarker = baseText.indexOf("\n\n", idx + marker.length);
    const before = baseText.slice(0, idx);
    const after = afterMarker !== -1 ? baseText.slice(afterMarker) : "";
    return `${before}${marker}\n${improved}${after}`;
  } catch {
    return baseText;
  }
}

export const dynamic = "force-dynamic";

/**
 * Proactive daily briefing (Paket 33, P1-SECR-004).
 *
 * For each configured WhatsApp sender (a lawyer, with their E.164 number), build a
 * "Guten Morgen" digest of upcoming deadlines from their brain's case pages and
 * push it through the gated outbound path. The gate enforces consent + the 24h
 * window / template rule, so this cron can never bypass compliance.
 *
 * Delivery requires the recipient to hold an active `daily_briefing` consent; the
 * E.164 number comes from the configured sender list. When the 24h window is
 * closed, an approved template (env `WHATSAPP_BRIEFING_TEMPLATE`) is required —
 * otherwise the send is gated and audited as `outbound_blocked` (honest no-op).
 */

const dedupBriefing = createDailyDedup(BRIEFING_DEDUP_TABLE);

function quietHoursFromEnv(now: Date): QuietHours | undefined {
  const raw = env("WHATSAPP_BRIEFING_QUIET_HOURS"); // e.g. "21-7"
  if (!raw) return undefined;
  const m = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (!m) return undefined;
  return {
    startHour: parseInt(m[1], 10),
    endHour: parseInt(m[2], 10),
    localHour: now.getHours(),
  };
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const now = new Date();
  const senders = loadAllowedSenders().filter((s) => s.role !== "assistant");
  const briefingTemplate = env("WHATSAPP_BRIEFING_TEMPLATE");
  const quietHours = quietHoursFromEnv(now);
  const mailOn = isMailConfigured();
  const recipientsByBrain = await getRecipientsByBrain();

  let sent = 0;
  let blocked = 0;
  let empty = 0;
  let emailed = 0;
  const errors: string[] = [];
  const emailedBrains = new Set<string>();

  for (const sender of senders) {
    try {
      // Dedup per recipient per day so a re-run can't double-brief.
      const key = `${sender.brainId}:${phoneHash(sender.phone)}`;
      if (await dedupBriefing(key)) continue;

      // Subsumio: was "case" — a page type nothing in this codebase writes
      // (legal cases are typed "legal_case" everywhere else, e.g. cron/
      // deadlines.ts, matter-context.ts), so the briefing was silently
      // grounded on an empty/wrong page set. Also folds in standalone
      // legal_deadline pages, the same second source cron/deadlines.ts
      // reads — a deadline tracked as its own page (not embedded in a
      // case's frontmatter.deadlines[]) was invisible to the briefing.
      const batch = await batchFetchPages(sender.brainId, ["legal_case", "legal_deadline"], 1000);
      const pages = batch["legal_case"] ?? [];
      const standaloneDeadlinePages = batch["legal_deadline"] ?? [];

      // Fetch pending approvals, recent case activity, new documents, contradictions (deterministic, $0)
      const [approvalPages, recentCases, recentDocs, contradictionsRaw] = await Promise.all([
        fetchPendingApprovals(sender.brainId),
        fetchRecentCaseActivity(sender.brainId),
        fetchRecentDocuments(sender.brainId),
        fetchContradictions(sender.brainId, 10),
      ]);

      const approvals: BriefingApproval[] = approvalPages.map((p) => {
        const fm = p.frontmatter ?? {};
        return {
          id: p.slug,
          action_type: String(fm.action_type ?? fm.type ?? "unknown"),
          summary: String(fm.summary ?? fm.title ?? p.title ?? "Aktion freigeben"),
          case_slug: fm.case_slug ? String(fm.case_slug) : undefined,
          proposed_at: String(fm.proposed_at ?? fm.created_at ?? new Date().toISOString()),
        };
      });

      const caseActivity: BriefingCaseActivity[] = recentCases.map((p) => {
        const fm = p.frontmatter ?? {};
        return {
          caseNumber: String(fm.case_number ?? p.slug),
          title: String(fm.title ?? p.title ?? ""),
          activity: "Aktualisiert",
          timestamp: String(p.updated_at ?? fm.updated_at ?? new Date().toISOString()),
        };
      });

      const cases: BriefingCase[] = pages.map((p) => {
        const fm = p.frontmatter ?? {};
        return {
          caseNumber: String(fm.case_number ?? p.slug),
          title: String(fm.title ?? p.title ?? ""),
          deadlines: Array.isArray(fm.deadlines) ? (fm.deadlines as BriefingCase["deadlines"]) : [],
        };
      });

      if (standaloneDeadlinePages.length > 0) {
        cases.push({
          caseNumber: "—",
          title: "Eigenständige Fristen",
          deadlines: standaloneDeadlinePages.map((p) => {
            const fm = p.frontmatter ?? {};
            return {
              title: p.title || "Frist",
              due_date: String(fm.due_date ?? fm.date ?? fm.deadline_date ?? ""),
              done: fm.status === "done",
            };
          }),
        });
      }

      const newDocuments: BriefingDocument[] = recentDocs.map((p) => ({
        id: p.slug,
        title: String(p.title ?? p.slug),
        case_slug: p.frontmatter?.case_slug ? String(p.frontmatter.case_slug) : undefined,
        created_at: String(p.created_at ?? new Date().toISOString()),
      }));

      const contradictions: BriefingContradiction[] = contradictionsRaw.map((c) => ({
        case_slug: c.case_slug,
        severity: c.severity,
        chunk_a: c.chunk_a,
        chunk_b: c.chunk_b,
        explanation: c.explanation,
        detected_at: c.detected_at,
      }));

      const baseText = buildDailyBriefing({
        anwaltName: sender.name,
        cases,
        now,
        horizonDays: 7,
        pendingApprovals: approvals,
        caseActivity,
        newDocuments,
        contradictions,
      });
      if (!baseText) {
        empty++;
        continue;
      }

      // Optional: one GPT-4o-mini call to sharpen recommendations (~$0.001, silent fallback)
      const text = await enrichRecommendationsWithAI(baseText, {
        deadlineCount: cases.reduce((n, c) => n + c.deadlines.length, 0),
        approvalCount: approvals.length,
        docCount: newDocuments.length,
        activityCount: caseActivity.length,
      });

      const result = await sendProactiveMessage({
        to: sender.phone,
        brainId: sender.brainId,
        scope: "daily_briefing",
        freeform: text,
        template: briefingTemplate
          ? { name: briefingTemplate, language: { code: "de" } }
          : undefined,
        quietHours,
        now,
      });

      if (result.sent) sent++;
      else blocked++;

      // Email delivery — once per brain (not per sender), sent to all brain recipients
      if (mailOn && !emailedBrains.has(sender.brainId)) {
        emailedBrains.add(sender.brainId);
        const recipients = recipientsByBrain.get(sender.brainId) ?? [];
        const emails = recipients.map((u) => u.email).filter((e): e is string => Boolean(e));
        if (emails.length > 0) {
          const subject = `Subsumio Briefing — ${now.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}`;
          try {
            const mailResult = await sendMail({
              to: emails,
              subject,
              text,
            });
            if (mailResult.sent) emailed++;
          } catch (err) {
            errors.push(`email: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    } catch (err) {
      errors.push(String(err instanceof Error ? err.message : err));
    }
  }

  return NextResponse.json({
    ok: true,
    recipients: senders.length,
    sent,
    blocked,
    empty,
    emailed,
    errors: errors.length > 0 ? errors : undefined,
  });
});
