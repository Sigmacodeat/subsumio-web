import { z } from "zod";
import { isDegradedAnswer } from "@/lib/engine-degraded";
import { uiLanguageSchema } from "@/lib/api-validation";
import { engineComplete } from "@/lib/engine-llm";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { DEFAULT_TYPES, fetchPagesByTypesResult } from "@/lib/cockpit";
import { DEADLINE_SOURCES, loadFristenReadModel } from "@/lib/fristen-read-model";
import { isClosedDeadline } from "@/lib/deadline-reminders";
import { zonedDateString } from "@/lib/datetime";
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
  /** A deadline source failed to load: the deadline counts are lower bounds
   *  and the briefing must never say "no critical deadlines". */
  deadlinesIncomplete: boolean;
  /** Page types that failed to load — their counts are unknown, not 0. */
  failedTypes: string[];
  /** Counts that hit the read budget and are lower bounds ("N+"). */
  cappedCounts: CountKey[];
}

type CountKey =
  | "inboxItems"
  | "pendingReviews"
  | "pendingSignatures"
  | "openInvoices"
  | "activeCases"
  | "unassignedDocs"
  | "reviewGaps"
  | "followUpsToday";

/** Which page types feed which count — a failed/capped type taints it. */
const COUNT_SOURCES: Record<CountKey, string[]> = {
  inboxItems: ["intake_request", "bea_message"],
  pendingReviews: ["review_item", "agent_action"],
  pendingSignatures: ["signature_request"],
  openInvoices: ["invoice"],
  activeCases: ["legal_case"],
  unassignedDocs: ["document", "legal_document"],
  reviewGaps: ["document", "legal_document"],
  followUpsToday: ["legal_follow_up"],
};

// Deadlines come from the Fristen read model, not from this list.
const BRIEFING_TYPES: Record<string, number> = Object.fromEntries(
  Object.entries({
    ...DEFAULT_TYPES,
    legal_follow_up: 500,
    trust_account: 100,
    absence_record: 500,
  }).filter(([type]) => type !== "legal_deadline")
);

const CLOSED_STATUSES = [
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
const isOpen = (status: unknown) => !CLOSED_STATUSES.includes(String(status ?? "").toLowerCase());

/** Whole calendar days from the firm's today (Europe/Vienna) to `due`. */
function daysFromToday(due: string, todayKey: string): number {
  const target = Date.parse(`${due.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

async function fetchCockpitData(headers: Record<string, string>): Promise<BriefingData | null> {
  try {
    const [lists, fristenModel] = await Promise.all([
      fetchPagesByTypesResult(headers, BRIEFING_TYPES),
      // Every deadline source (Fristenbuch, deadline pages, deadlines in
      // matters), fully paged — not the 50 most recently edited pages.
      loadFristenReadModel(headers),
    ]);
    const { pages, failedTypes, cappedTypes } = lists;
    const deadlinesIncomplete = fristenModel.failedSources.some((src) =>
      DEADLINE_SOURCES.includes(src)
    );
    const allFailed =
      DEADLINE_SOURCES.every((src) => fristenModel.failedSources.includes(src)) &&
      Object.keys(BRIEFING_TYPES).every((type) => failedTypes.includes(type));
    if (allFailed) return null;

    const cases = pages.legal_case ?? [];
    const followUps = pages.legal_follow_up ?? [];
    const invoices = pages.invoice ?? [];
    const intake = pages.intake_request ?? [];
    // bea_draft is deliberately NOT counted: the beA dashboard is retired, so
    // a draft has no live surface to open — the briefing must not report
    // "Eingänge" the lawyer cannot act on. bea_message stays: imported beA
    // mail is listed under /dashboard/communications.
    const beaMessages = pages.bea_message ?? [];
    const signatures = pages.signature_request ?? [];
    const reviews = pages.review_item ?? [];
    const agentActions = pages.agent_action ?? [];
    const docs = [...(pages.document ?? []), ...(pages.legal_document ?? [])];

    const todayKey = zonedDateString(new Date());

    const absences = (pages.absence_record ?? [])
      .map((p: BrainPage) => p.frontmatter as AbsenceRecord | undefined)
      .filter((a): a is AbsenceRecord => Boolean(a?.user_email || a?.user_name));

    // Status comes from the read model (Europe/Vienna calendar day, the
    // central closed/discarded set); the stand-in from the matter's lawyer.
    const deadlineItems = fristenModel.fristen
      .filter((f) => f.status !== "done" && !isClosedDeadline(f))
      .map((f) => ({
        title: f.title || "Unbenannte Frist",
        due: f.due_date,
        daysLeft: daysFromToday(f.due_date, todayKey),
        delegate: f.deputy,
        overdue: f.status === "overdue",
        critical: f.status === "critical",
      }))
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

    const inboxItems = [...intake, ...beaMessages];
    const openInvoices = invoices.filter((p: BrainPage) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );
    const pendingSignatures = signatures.filter((p: BrainPage) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );
    const pendingReviews = [...reviews, ...agentActions].filter((p: BrainPage) =>
      isOpen((p.frontmatter as Record<string, unknown> | undefined)?.status)
    );

    const cappedCounts = (Object.keys(COUNT_SOURCES) as CountKey[]).filter((key) =>
      COUNT_SOURCES[key].some((type) => cappedTypes.includes(type))
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
      deadlinesIncomplete,
      failedTypes,
      cappedCounts,
    };
  } catch {
    return null;
  }
}

/** A count as text: "N+" when it hit the read budget, "unbekannt" when its
 *  source failed — never a bare number that is really a lower bound or 0. */
function countText(data: BriefingData, key: CountKey, language: "de" | "en"): string {
  if (COUNT_SOURCES[key].some((type) => data.failedTypes.includes(type))) {
    return language === "en" ? "unknown (could not be loaded)" : "unbekannt (nicht geladen)";
  }
  return data.cappedCounts.includes(key) ? `${data[key]}+` : String(data[key]);
}

function buildBriefingPrompt(data: BriefingData, language: "de" | "en"): string {
  if (language === "en") {
    const parts: string[] = [];
    parts.push(
      "You are a legal assistant. Generate a concise 3-sentence morning briefing for a lawyer."
    );
    parts.push("Base it ONLY on the following data. Do not invent information.");
    parts.push("");
    parts.push(`Active cases: ${countText(data, "activeCases", "en")}`);
    parts.push(`Critical deadlines (≤3 days): ${data.criticalDeadlines}`);
    parts.push(`Overdue deadlines: ${data.overdueDeadlines}`);
    parts.push(`Inbox items: ${countText(data, "inboxItems", "en")}`);
    parts.push(`Follow-ups today: ${countText(data, "followUpsToday", "en")}`);
    parts.push(`Pending reviews: ${countText(data, "pendingReviews", "en")}`);
    parts.push(`Pending signatures: ${countText(data, "pendingSignatures", "en")}`);
    parts.push(`Open invoices: ${countText(data, "openInvoices", "en")}`);
    parts.push(`Unassigned documents: ${countText(data, "unassignedDocs", "en")}`);
    parts.push(`Review gaps: ${countText(data, "reviewGaps", "en")}`);
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
  parts.push(`Aktive Akten: ${countText(data, "activeCases", "de")}`);
  parts.push(`Kritische Fristen (≤3 Tage): ${data.criticalDeadlines}`);
  parts.push(`Überfällige Fristen: ${data.overdueDeadlines}`);
  parts.push(`Eingänge: ${countText(data, "inboxItems", "de")}`);
  parts.push(`Wiedervorlagen heute: ${countText(data, "followUpsToday", "de")}`);
  parts.push(`Offene Freigaben: ${countText(data, "pendingReviews", "de")}`);
  parts.push(`Offene Signaturen: ${countText(data, "pendingSignatures", "de")}`);
  parts.push(`Offene Rechnungen: ${countText(data, "openInvoices", "de")}`);
  parts.push(`Unzugeordnete Dokumente: ${countText(data, "unassignedDocs", "de")}`);
  parts.push(`Review-Lücken: ${countText(data, "reviewGaps", "de")}`);
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

const INCOMPLETE_DE =
  "Fristen konnten nicht vollständig geladen werden — bitte im Fristenbuch prüfen.";
const INCOMPLETE_EN = "Deadlines could not be loaded completely — please check the deadline book.";

function fallbackBriefing(data: BriefingData, language: "de" | "en"): string {
  if (language === "en") {
    const parts: string[] = [];
    if (data.deadlinesIncomplete) {
      parts.push(INCOMPLETE_EN);
      if (data.overdueDeadlines > 0) {
        parts.push(`At least ${data.overdueDeadlines} overdue deadline(s) found.`);
      } else if (data.criticalDeadlines > 0) {
        parts.push(`At least ${data.criticalDeadlines} critical deadline(s) found.`);
      }
    } else if (data.overdueDeadlines > 0) {
      parts.push(`${data.overdueDeadlines} overdue deadline(s) need immediate attention.`);
    } else if (data.criticalDeadlines > 0) {
      parts.push(`${data.criticalDeadlines} critical deadline(s) due within 3 days.`);
    } else {
      parts.push("No critical deadlines today.");
    }
    const attention: string[] = [];
    if (data.inboxItems > 0) attention.push(`${countText(data, "inboxItems", "en")} inbox items`);
    if (data.pendingReviews > 0)
      attention.push(`${countText(data, "pendingReviews", "en")} pending reviews`);
    if (data.pendingSignatures > 0)
      attention.push(`${countText(data, "pendingSignatures", "en")} signatures`);
    if (data.unassignedDocs > 0)
      attention.push(`${countText(data, "unassignedDocs", "en")} unassigned documents`);
    if (data.overdueReconciliations > 0)
      attention.push(`${data.overdueReconciliations} trust reconciliation(s) overdue`);
    parts.push(
      attention.length > 0
        ? attention.join(", ") + " need attention."
        : data.failedTypes.length > 0
          ? "Some areas could not be loaded."
          : "Inbox is clear."
    );
    if (data.activeDelegations.length > 0) {
      const names = data.activeDelegations
        .map((d) => `${d.delegate} covers for ${d.name} until ${d.until}`)
        .join("; ");
      parts.push(`Delegations: ${names}.`);
    }
    parts.push(
      data.activeCases > 0
        ? `Review your ${countText(data, "activeCases", "en")} active case(s) and prioritize accordingly.`
        : data.failedTypes.includes("legal_case")
          ? "Cases could not be loaded."
          : "No active cases — consider creating one."
    );
    return parts.join(" ");
  }

  const parts: string[] = [];
  if (data.deadlinesIncomplete) {
    parts.push(INCOMPLETE_DE);
    if (data.overdueDeadlines > 0) {
      parts.push(`Mindestens ${data.overdueDeadlines} überfällige Frist(en) gefunden.`);
    } else if (data.criticalDeadlines > 0) {
      parts.push(`Mindestens ${data.criticalDeadlines} kritische Frist(en) gefunden.`);
    }
  } else if (data.overdueDeadlines > 0) {
    parts.push(
      `${data.overdueDeadlines} überfällige Frist(en) benötigen sofortige Aufmerksamkeit.`
    );
  } else if (data.criticalDeadlines > 0) {
    parts.push(`${data.criticalDeadlines} kritische Frist(en) in den nächsten 3 Tagen.`);
  } else {
    parts.push("Keine kritischen Fristen heute.");
  }
  const attention: string[] = [];
  if (data.inboxItems > 0) attention.push(`${countText(data, "inboxItems", "de")} Eingänge`);
  if (data.pendingReviews > 0)
    attention.push(`${countText(data, "pendingReviews", "de")} offene Freigaben`);
  if (data.pendingSignatures > 0)
    attention.push(`${countText(data, "pendingSignatures", "de")} Signaturen`);
  if (data.unassignedDocs > 0)
    attention.push(`${countText(data, "unassignedDocs", "de")} unzugeordnete Dokumente`);
  if (data.overdueReconciliations > 0)
    attention.push(`${data.overdueReconciliations} überfällige Treuhand-Abgleiche`);
  parts.push(
    attention.length > 0
      ? attention.join(", ") + " benötigen Aufmerksamkeit."
      : data.failedTypes.length > 0
        ? "Einzelne Bereiche konnten nicht geladen werden."
        : "Eingang ist leer."
  );
  if (data.activeDelegations.length > 0) {
    const names = data.activeDelegations
      .map((d) => `${d.delegate} vertritt ${d.name} bis ${d.until}`)
      .join("; ");
    parts.push(`Vertretungen: ${names}.`);
  }
  parts.push(
    data.activeCases > 0
      ? `Übersicht über ${countText(data, "activeCases", "de")} aktive Akte(n) und Prioritäten setzen.`
      : data.failedTypes.includes("legal_case")
        ? "Akten konnten nicht geladen werden."
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

    // Incomplete deadlines: no model prose — it could still read "keine
    // kritischen Fristen". The deterministic text leads with the warning.
    const narrative = data.deadlinesIncomplete
      ? null
      : await generateNarrative(ctx.headers, buildBriefingPrompt(data, body.language));

    return apiSuccess({
      narrative: narrative ?? fallbackBriefing(data, body.language),
      data,
      generatedAt: new Date().toISOString(),
      usedFallback: narrative === null,
      degraded: data.deadlinesIncomplete || data.failedTypes.length > 0,
    });
  }
);
