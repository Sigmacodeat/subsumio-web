import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";

export const maxDuration = 60;

const briefingSchema = z.object({
  language: z.enum(["de", "en"]).optional().default("de"),
});

interface BriefingData {
  criticalDeadlines: number;
  overdueDeadlines: number;
  inboxItems: number;
  pendingReviews: number;
  pendingSignatures: number;
  openInvoices: number;
  activeCases: number;
  unassignedDocs: number;
  reviewGaps: number;
  overdueReconciliations: number;
  followUpsToday: number;
  topDeadlines: Array<{ title: string; due: string; daysLeft: number }>;
  topCases: Array<{ title: string; status: string }>;
}

async function fetchCockpitData(headers: Record<string, string>): Promise<BriefingData | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/dashboard/cockpit?recent_limit=5`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data.pages ?? {};

    const cases = pages.legal_case ?? [];
    const deadlines = pages.legal_deadline ?? [];
    const followUps = pages.legal_follow_up ?? [];
    const invoices = pages.invoice ?? [];
    const intake = pages.intake_request ?? [];
    const bea = pages.bea_draft ?? [];
    const beaMessages = pages.bea_message ?? [];
    const signatures = pages.signature_request ?? [];
    const reviews = pages.review_item ?? [];
    const agentActions = pages.agent_action ?? [];
    const docs = [...(pages.document ?? []), ...(pages.legal_document ?? [])];

    const closedStatuses = [
      "done",
      "closed",
      "settled",
      "won",
      "lost",
      "paid",
      "archived",
      "approved",
      "rejected",
      "fulfilled",
      "signed",
      "declined",
      "cancelled",
      "canceled",
    ];
    const isOpen = (status: unknown) =>
      !closedStatuses.includes(String(status ?? "").toLowerCase());

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayKey = now.toLocaleDateString("en-CA");

    const deadlineItems = deadlines
      .map((p: Record<string, unknown>) => {
        const fm = p.frontmatter ?? {};
        const dueStr =
          (fm as Record<string, unknown>).due_date ??
          (fm as Record<string, unknown>).date ??
          p.created_at;
        if (typeof dueStr !== "string" && typeof dueStr !== "number") return null;
        const due = new Date(dueStr);
        if (Number.isNaN(due.getTime())) return null;
        const target = new Date(due);
        target.setHours(0, 0, 0, 0);
        const daysLeft = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
        return {
          title: String(p.title ?? "Unbenannte Frist"),
          due: due.toISOString(),
          daysLeft,
          overdue: daysLeft < 0 && isOpen((fm as Record<string, unknown>).status),
          critical:
            daysLeft >= 0 && daysLeft <= 3 && isOpen((fm as Record<string, unknown>).status),
        };
      })
      .filter((item: unknown): item is NonNullable<typeof item> => item !== null)
      .sort((a: { daysLeft: number }, b: { daysLeft: number }) => a.daysLeft - b.daysLeft);

    const activeCases = cases.filter((p: Record<string, unknown>) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );

    const unassignedDocs = docs.filter((d: Record<string, unknown>) => {
      const fm = d.frontmatter ?? {};
      return (
        !(fm as Record<string, unknown>).case_slug &&
        (fm as Record<string, unknown>).assignment_status !== "assigned"
      );
    });

    const reviewGaps = docs.filter((d: Record<string, unknown>) => {
      const fm = d.frontmatter ?? {};
      const es = (fm as Record<string, unknown>).extraction_status;
      const as = (fm as Record<string, unknown>).analysis_status;
      return (
        es === "ocr_needed" ||
        es === "ocr_failed" ||
        es === "uploaded" ||
        es === "processing" ||
        es === "ocr_processing" ||
        (fm as Record<string, unknown>).extraction_unverified === true ||
        as === "failed" ||
        as === "pending"
      );
    });

    const inboxItems = [...intake, ...bea, ...beaMessages];
    const openInvoices = invoices.filter((p: Record<string, unknown>) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );
    const pendingSignatures = signatures.filter((p: Record<string, unknown>) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );
    const pendingReviews = [...reviews, ...agentActions].filter((p: Record<string, unknown>) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );

    return {
      criticalDeadlines: deadlineItems.filter((d: { critical: boolean }) => d.critical).length,
      overdueDeadlines: deadlineItems.filter((d: { overdue: boolean }) => d.overdue).length,
      inboxItems: inboxItems.length,
      pendingReviews: pendingReviews.length,
      pendingSignatures: pendingSignatures.length,
      openInvoices: openInvoices.length,
      activeCases: activeCases.length,
      unassignedDocs: unassignedDocs.length,
      reviewGaps: reviewGaps.length,
      overdueReconciliations: 0,
      followUpsToday: followUps.filter((page: Record<string, unknown>) => {
        const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
        return String(fm.date ?? "").slice(0, 10) === todayKey && fm.completed !== true;
      }).length,
      topDeadlines: deadlineItems
        .slice(0, 5)
        .map((d: { title: string; due: string; daysLeft: number }) => ({
          title: d.title,
          due: d.due,
          daysLeft: d.daysLeft,
        })),
      topCases: activeCases.slice(0, 3).map((p: Record<string, unknown>) => ({
        title: String(p.title ?? "Unbenannte Akte"),
        status: String((p.frontmatter as Record<string, unknown> | undefined)?.status ?? "open"),
      })),
    };
  } catch {
    return null;
  }
}

function buildBriefingPrompt(data: BriefingData, language: "de" | "en"): string {
  if (language === "en") {
    const parts: string[] = [];
    parts.push(
      "You are a legal assistant. Generate a concise 3-sentence morning briefing for a lawyer."
    );
    parts.push("Base it ONLY on the following data. Do not invent information.");
    parts.push("");
    parts.push(`Active cases: ${data.activeCases}`);
    parts.push(`Critical deadlines (≤3 days): ${data.criticalDeadlines}`);
    parts.push(`Overdue deadlines: ${data.overdueDeadlines}`);
    parts.push(`Inbox items: ${data.inboxItems}`);
    parts.push(`Follow-ups today: ${data.followUpsToday}`);
    parts.push(`Pending reviews: ${data.pendingReviews}`);
    parts.push(`Pending signatures: ${data.pendingSignatures}`);
    parts.push(`Open invoices: ${data.openInvoices}`);
    parts.push(`Unassigned documents: ${data.unassignedDocs}`);
    parts.push(`Review gaps: ${data.reviewGaps}`);
    if (data.topDeadlines.length > 0) {
      parts.push("");
      parts.push("Top deadlines:");
      for (const d of data.topDeadlines) {
        const daysLabel =
          d.daysLeft >= 0 ? `${d.daysLeft} days left` : `${Math.abs(d.daysLeft)} days overdue`;
        parts.push(`- ${d.title} (${daysLabel})`);
      }
    }
    if (data.topCases.length > 0) {
      parts.push("");
      parts.push("Active cases:");
      for (const c of data.topCases) {
        parts.push(`- ${c.title} [${c.status}]`);
      }
    }
    parts.push("");
    parts.push(
      "Format: 3 sentences. First sentence: most urgent items. Second: what needs attention. Third: recommendation."
    );
    return parts.join("\n");
  }

  const parts: string[] = [];
  parts.push(
    "Du bist ein Kanzlei-Assistent. Erstelle ein prägnantes 3-Satz Morgen-Briefing für einen Anwalt."
  );
  parts.push("Basiere es NUR auf den folgenden Daten. Erfinde keine Informationen.");
  parts.push("");
  parts.push(`Aktive Akten: ${data.activeCases}`);
  parts.push(`Kritische Fristen (≤3 Tage): ${data.criticalDeadlines}`);
  parts.push(`Überfällige Fristen: ${data.overdueDeadlines}`);
  parts.push(`Eingänge: ${data.inboxItems}`);
  parts.push(`Wiedervorlagen heute: ${data.followUpsToday}`);
  parts.push(`Offene Freigaben: ${data.pendingReviews}`);
  parts.push(`Offene Signaturen: ${data.pendingSignatures}`);
  parts.push(`Offene Rechnungen: ${data.openInvoices}`);
  parts.push(`Unzugeordnete Dokumente: ${data.unassignedDocs}`);
  parts.push(`Review-Lücken: ${data.reviewGaps}`);
  if (data.topDeadlines.length > 0) {
    parts.push("");
    parts.push("Nächste Fristen:");
    for (const d of data.topDeadlines) {
      parts.push(
        `- ${d.title} (${d.daysLeft >= 0 ? `noch ${d.daysLeft} Tage` : `${Math.abs(d.daysLeft)} Tage überfällig`})`
      );
    }
  }
  if (data.topCases.length > 0) {
    parts.push("");
    parts.push("Aktive Akten:");
    for (const c of data.topCases) {
      parts.push(`- ${c.title} [${c.status}]`);
    }
  }
  parts.push("");
  parts.push(
    "Format: 3 Sätze. Erster Satz: Dringendstes. Zweiter: Was Aufmerksamkeit braucht. Dritter: Empfehlung."
  );
  return parts.join("\n");
}

async function generateNarrative(
  headers: Record<string, string>,
  prompt: string
): Promise<string | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ query: prompt, mode: "balanced", query_mode: "balanced" }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("Content-Type") || "";
    if (contentType.includes("text/event-stream")) {
      let answer = "";
      const reader = res.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (typeof parsed.chunk === "string") answer += parsed.chunk;
            } catch {
              // ignore non-JSON lines
            }
          }
        }
      }
      return answer || null;
    }

    const data = await res.json();
    return typeof data.answer === "string" ? data.answer : null;
  } catch {
    return null;
  }
}

function fallbackBriefing(data: BriefingData, language: "de" | "en"): string {
  if (language === "en") {
    const parts: string[] = [];
    if (data.overdueDeadlines > 0) {
      parts.push(`${data.overdueDeadlines} overdue deadline(s) need immediate attention.`);
    } else if (data.criticalDeadlines > 0) {
      parts.push(`${data.criticalDeadlines} critical deadline(s) due within 3 days.`);
    } else {
      parts.push("No critical deadlines today.");
    }
    const attention: string[] = [];
    if (data.inboxItems > 0) attention.push(`${data.inboxItems} inbox items`);
    if (data.pendingReviews > 0) attention.push(`${data.pendingReviews} pending reviews`);
    if (data.pendingSignatures > 0) attention.push(`${data.pendingSignatures} signatures`);
    if (data.unassignedDocs > 0) attention.push(`${data.unassignedDocs} unassigned documents`);
    parts.push(
      attention.length > 0 ? attention.join(", ") + " need attention." : "Inbox is clear."
    );
    parts.push(
      data.activeCases > 0
        ? `Review your ${data.activeCases} active case(s) and prioritize accordingly.`
        : "No active cases — consider creating one."
    );
    return parts.join(" ");
  }

  const parts: string[] = [];
  if (data.overdueDeadlines > 0) {
    parts.push(
      `${data.overdueDeadlines} überfällige Frist(en) benötigen sofortige Aufmerksamkeit.`
    );
  } else if (data.criticalDeadlines > 0) {
    parts.push(`${data.criticalDeadlines} kritische Frist(en) in den nächsten 3 Tagen.`);
  } else {
    parts.push("Keine kritischen Fristen heute.");
  }
  const attention: string[] = [];
  if (data.inboxItems > 0) attention.push(`${data.inboxItems} Eingänge`);
  if (data.pendingReviews > 0) attention.push(`${data.pendingReviews} offene Freigaben`);
  if (data.pendingSignatures > 0) attention.push(`${data.pendingSignatures} Signaturen`);
  if (data.unassignedDocs > 0) attention.push(`${data.unassignedDocs} unzugeordnete Dokumente`);
  parts.push(
    attention.length > 0 ? attention.join(", ") + " benötigen Aufmerksamkeit." : "Eingang ist leer."
  );
  parts.push(
    data.activeCases > 0
      ? `Übersicht über ${data.activeCases} aktive Akte(n) und Prioritäten setzen.`
      : "Keine aktiven Akten — eventuell neue anlegen."
  );
  return parts.join(" ");
}

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: briefingSchema,
  },
  async (ctx, body, _query, _req) => {
    const data = await fetchCockpitData(ctx.headers);
    if (!data) {
      return apiError("service_unavailable", "Cockpit-Daten nicht verfügbar", 503);
    }

    const prompt = buildBriefingPrompt(data, body.language);
    const narrative = await generateNarrative(ctx.headers, prompt);

    return apiSuccess({
      narrative: narrative ?? fallbackBriefing(data, body.language),
      data,
      generatedAt: new Date().toISOString(),
      usedFallback: narrative === null,
    });
  }
);
