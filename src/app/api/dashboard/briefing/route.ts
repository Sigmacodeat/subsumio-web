import { z } from "zod";
import { isDegradedAnswer } from "@/lib/engine-degraded";
import { uiLanguageSchema } from "@/lib/api-validation";
import { engineComplete } from "@/lib/engine-llm";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { DEFAULT_TYPES, fetchPagesByTypes } from "@/lib/cockpit";
import { overdueReconciliationAccounts } from "@/lib/trust-accounting";
import { activeDelegateFor, type AbsenceRecord } from "@/lib/absence";
import type { BrainPage } from "@/lib/types";

export const maxDuration = 60;

const briefingSchema = z.object({
  language: uiLanguageSchema.optional().default("de"),
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
  activeDelegations: Array<{ name: string; delegate: string; until: string }>;
  topDeadlines: Array<{ title: string; due: string; daysLeft: number; delegate?: string }>;
  topCases: Array<{ title: string; status: string }>;
}

async function fetchCockpitData(headers: Record<string, string>): Promise<BriefingData | null> {
  try {
    const pages = await fetchPagesByTypes(headers, {
      ...DEFAULT_TYPES,
      legal_follow_up: 50,
      trust_account: 50,
      absence_record: 50,
    });

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

    const absences = (pages.absence_record ?? [])
      .map((p: BrainPage) => p.frontmatter as AbsenceRecord | undefined)
      .filter((a): a is AbsenceRecord => Boolean(a?.user_email || a?.user_name));
    const responsibleByCase = new Map<string, string>();
    for (const c of cases) {
      const lawyer = (c.frontmatter as Record<string, unknown> | undefined)?.own_lawyer_name;
      if (typeof lawyer === "string" && lawyer.trim()) {
        responsibleByCase.set(c.slug, lawyer.trim());
      }
    }

    const deadlineItems = deadlines
      .map((p: BrainPage) => {
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
        const caseSlug = (fm as Record<string, unknown>).case_slug;
        const responsible =
          (fm as Record<string, unknown>).responsible ??
          (fm as Record<string, unknown>).assignee ??
          (typeof caseSlug === "string" ? responsibleByCase.get(caseSlug) : undefined);
        const delegate = activeDelegateFor(
          typeof responsible === "string" ? responsible : undefined,
          absences,
          new Date()
        );
        return {
          title: String(p.title ?? "Unbenannte Frist"),
          due: due.toISOString(),
          daysLeft,
          delegate: delegate?.name,
          overdue: daysLeft < 0 && isOpen((fm as Record<string, unknown>).status),
          critical:
            daysLeft >= 0 && daysLeft <= 3 && isOpen((fm as Record<string, unknown>).status),
        };
      })
      .filter(
        (
          item
        ): item is {
          title: string;
          due: string;
          daysLeft: number;
          delegate: string | undefined;
          overdue: boolean;
          critical: boolean;
        } => item !== null
      )
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const activeCases = cases.filter((p: BrainPage) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );

    const unassignedDocs = docs.filter((d: BrainPage) => {
      const fm = d.frontmatter ?? {};
      return (
        !(fm as Record<string, unknown>).case_slug &&
        (fm as Record<string, unknown>).assignment_status !== "assigned"
      );
    });

    const reviewGaps = docs.filter((d: BrainPage) => {
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
    const openInvoices = invoices.filter((p: BrainPage) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );
    const pendingSignatures = signatures.filter((p: BrainPage) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );
    const pendingReviews = [...reviews, ...agentActions].filter((p: BrainPage) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );

    return {
      criticalDeadlines: deadlineItems.filter((d) => d.critical).length,
      overdueDeadlines: deadlineItems.filter((d) => d.overdue).length,
      inboxItems: inboxItems.length,
      pendingReviews: pendingReviews.length,
      pendingSignatures: pendingSignatures.length,
      openInvoices: openInvoices.length,
      activeCases: activeCases.length,
      unassignedDocs: unassignedDocs.length,
      reviewGaps: reviewGaps.length,
      overdueReconciliations: overdueReconciliationAccounts(pages.trust_account ?? []).length,
      activeDelegations: (() => {
        const seen = new Set<string>();
        const nowReal = new Date();
        return absences
          .map((a) => {
            const key = (a.user_email || a.user_name).trim().toLowerCase();
            if (seen.has(key)) return null;
            const delegate = activeDelegateFor(a.user_email || a.user_name, absences, nowReal);
            if (!delegate) return null;
            seen.add(key);
            return {
              name: a.user_name || a.user_email,
              delegate: delegate.name,
              until: delegate.until.slice(0, 10),
            };
          })
          .filter((d): d is { name: string; delegate: string; until: string } => d !== null);
      })(),
      followUpsToday: followUps.filter((page: BrainPage) => {
        const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
        return String(fm.date ?? "").slice(0, 10) === todayKey && fm.completed !== true;
      }).length,
      topDeadlines: deadlineItems.slice(0, 5).map((d) => ({
        title: d.title,
        due: d.due,
        daysLeft: d.daysLeft,
        ...(d.delegate ? { delegate: d.delegate } : {}),
      })),
      topCases: activeCases.slice(0, 3).map((p: BrainPage) => ({
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
    parts.push(`Trust reconciliations overdue: ${data.overdueReconciliations}`);
    if (data.activeDelegations.length > 0) {
      parts.push("Active delegations (absent colleague → stand-in):");
      for (const d of data.activeDelegations) {
        parts.push(`- ${d.name} is absent, covered by ${d.delegate} until ${d.until}`);
      }
    }
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
      "Format: 3 sentences. First sentence: most urgent items. Second: what needs attention. Third: recommendation. Plain prose only — no title, no heading, no markdown formatting."
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
  parts.push(`Überfällige Treuhand-Abgleiche: ${data.overdueReconciliations}`);
  if (data.activeDelegations.length > 0) {
    parts.push("Aktive Vertretungen (abwesend → Vertretung):");
    for (const d of data.activeDelegations) {
      parts.push(`- ${d.name} ist abwesend, vertreten durch ${d.delegate} bis ${d.until}`);
    }
  }
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
    "Format: 3 Sätze. Erster Satz: Dringendstes. Zweiter: Was Aufmerksamkeit braucht. Dritter: Empfehlung. Nur Fließtext — kein Titel, keine Überschrift, keine Markdown-Formatierung."
  );
  return parts.join("\n");
}

// Three sentences from counts that are already known: one small completion on
// the utility tier. It used to run the full /api/think pipeline (retrieval,
// answer model, citation cross-check) — about 50× the cost, on every
// dashboard visit, for free accounts too.
async function generateNarrative(
  headers: Record<string, string>,
  prompt: string
): Promise<string | null> {
  const result = await engineComplete(headers, {
    purpose: "cockpit_briefing",
    tier: "utility",
    prompt,
    maxTokens: 300,
    timeoutMs: 20_000,
  });
  const answer = result?.text.trim();
  return answer && !isDegradedAnswer(answer) ? answer : null;
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
    if (data.overdueReconciliations > 0)
      attention.push(`${data.overdueReconciliations} trust reconciliation(s) overdue`);
    parts.push(
      attention.length > 0 ? attention.join(", ") + " need attention." : "Inbox is clear."
    );
    if (data.activeDelegations.length > 0) {
      const names = data.activeDelegations
        .map((d) => `${d.delegate} covers for ${d.name} until ${d.until}`)
        .join("; ");
      parts.push(`Delegations: ${names}.`);
    }
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
  if (data.overdueReconciliations > 0)
    attention.push(`${data.overdueReconciliations} überfällige Treuhand-Abgleiche`);
  parts.push(
    attention.length > 0 ? attention.join(", ") + " benötigen Aufmerksamkeit." : "Eingang ist leer."
  );
  if (data.activeDelegations.length > 0) {
    const names = data.activeDelegations
      .map((d) => `${d.delegate} vertritt ${d.name} bis ${d.until}`)
      .join("; ");
    parts.push(`Vertretungen: ${names}.`);
  }
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
    audit: (ctx, body) => ({
      action: "dashboard.briefing" as const,
      entityType: "briefing",
      details: { user: ctx.user.email, language: body.language },
    }),
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
