import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

interface ReviewInboxItem {
  id: string;
  type:
    | "document_request"
    | "suggested_deadline"
    | "client_submission"
    | "suggested_party"
    | "pending_fact";
  title: string;
  description: string;
  caseSlug: string | null;
  caseTitle: string | null;
  priority: "high" | "medium" | "low";
  source: string;
  createdAt: string;
  status: string;
  actionLabel: string;
  secondaryLabel: string | null;
  pageSlug: string;
  requestSlug: string | null;
  items: string[];
  channel: string | null;
  portalUrl: string | null;
  messageDraft: string | null;
  dueDate: string | null;
  urgency: string | null;
  law: string | null;
  confidence: string | null;
  sourceQuote: string | null;
  partyName: string | null;
  partyRole: string | null;
  factId: string | null;
  factStatement: string | null;
  factConfidence: string | null;
  arrayIndex: number | null;
}

async function fetchPages(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<BrainPage[]> {
  try {
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("limit", String(limit));
    const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as BrainPage[]) : [];
  } catch {
    return [];
  }
}

function fm(page: BrainPage): Record<string, unknown> {
  return (page.frontmatter ?? {}) as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function dateStr(value: unknown): string {
  return typeof value === "string" && value ? value : "";
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, _req) => {
    const [docRequests, deadlines, submissions, casePages] = await Promise.all([
      fetchPages(ctx.headers, "document_request", 200),
      fetchPages(ctx.headers, "legal_deadline", 300),
      fetchPages(ctx.headers, "client_submission", 200),
      fetchPages(ctx.headers, "legal_case", 300),
    ]);

    const items: ReviewInboxItem[] = [];

    // ── Document Requests (open, not fulfilled) ──
    for (const page of docRequests) {
      const f = fm(page);
      const status = str(f.status);
      if (status === "fulfilled" || status === "expired") continue;
      const openItems = Array.isArray(f.items)
        ? (f.items as Array<{ label?: string; received_document_slug?: string }>)
            .filter((item) => !item.received_document_slug)
            .map((item) => item.label || "Unterlage")
        : [];
      if (openItems.length === 0 && status !== "draft") continue;

      items.push({
        id: page.slug,
        type: "document_request",
        title: page.title || "Dokumentenanfrage",
        description: openItems.join(", ") || str(f.message_draft).slice(0, 180),
        caseSlug: str(f.case_slug) || null,
        caseTitle: null,
        priority: status === "draft" ? "medium" : "low",
        source: str(f.channel) || "manual",
        createdAt: dateStr(f.created_at) || dateStr(page.created_at),
        status,
        actionLabel: status === "draft" ? "Senden" : "Öffnen",
        secondaryLabel: status === "sent" ? "Erledigt" : null,
        pageSlug: page.slug,
        requestSlug: page.slug,
        items: openItems,
        channel: str(f.channel) || null,
        portalUrl: str(f.portal_url) || null,
        messageDraft: str(f.message_draft) || null,
        dueDate: null,
        urgency: null,
        law: null,
        confidence: null,
        sourceQuote: null,
        partyName: null,
        partyRole: null,
        factId: null,
        factStatement: null,
        factConfidence: null,
        arrayIndex: null,
      });
    }

    // ── Legal Deadlines (unreviewed AI suggestions) ──
    for (const page of deadlines) {
      const f = fm(page);
      const reviewStatus = str(f.review_status);
      if (reviewStatus === "approved" || reviewStatus === "rejected") continue;
      if (str(f.status) === "done" || str(f.status) === "completed") continue;

      const urgency = str(f.urgency) || str(f.ai_confidence);
      const dueDate = dateStr(f.due_date) || dateStr(f.date);
      const daysUntil = dueDate
        ? Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
        : null;

      let priority: "high" | "medium" | "low" = "medium";
      if (urgency === "high" || urgency === "critical" || (daysUntil !== null && daysUntil <= 3)) {
        priority = "high";
      } else if (daysUntil !== null && daysUntil < 0) {
        priority = "high";
      }

      items.push({
        id: page.slug,
        type: "suggested_deadline",
        title: page.title || "Fristvorschlag",
        description: dueDate
          ? `${dueDate}${daysUntil !== null ? ` (${daysUntil < 0 ? `${Math.abs(daysUntil)} Tage überfällig` : `${daysUntil} Tage`})` : ""}${str(f.source_quote) ? ` · "${str(f.source_quote).slice(0, 90)}"` : ""}`
          : str(f.description).slice(0, 180),
        caseSlug: str(f.case_slug) || null,
        caseTitle: null,
        priority,
        source: str(f.source) || "ai",
        createdAt: dateStr(f.created_at) || dateStr(page.created_at),
        status: reviewStatus || "unreviewed",
        actionLabel: "Übernehmen",
        secondaryLabel: "Verwerfen",
        pageSlug: page.slug,
        requestSlug: null,
        items: [],
        channel: null,
        portalUrl: null,
        messageDraft: null,
        dueDate,
        urgency: urgency || null,
        law: str(f.law) || null,
        confidence: str(f.confidence) || str(f.ai_confidence) || null,
        sourceQuote: str(f.source_quote) || null,
        partyName: null,
        partyRole: null,
        factId: null,
        factStatement: null,
        factConfidence: null,
        arrayIndex: null,
      });
    }

    // ── Client Submissions (not reviewed) ──
    for (const page of submissions) {
      const f = fm(page);
      const reviewStatus = str(f.review_status);
      if (reviewStatus === "reviewed") continue;

      items.push({
        id: page.slug,
        type: "client_submission",
        title: page.title || "Mandanten-Einreichung",
        description:
          str(f.normalized_text || page.content).slice(0, 180) ||
          "Neue WhatsApp-Einreichung prüfen.",
        caseSlug: str(f.case_slug) || null,
        caseTitle: null,
        priority: "high",
        source: str(f.source) || "WhatsApp",
        createdAt: dateStr(f.created_at) || dateStr(page.created_at),
        status: reviewStatus || "new",
        actionLabel: "Als geprüft markieren",
        secondaryLabel: "Dokumente",
        pageSlug: page.slug,
        requestSlug: null,
        items: [],
        channel: str(f.channel) || null,
        portalUrl: null,
        messageDraft: null,
        dueDate: null,
        urgency: null,
        law: null,
        confidence: null,
        sourceQuote: null,
        partyName: null,
        partyRole: null,
        factId: null,
        factStatement: null,
        factConfidence: null,
        arrayIndex: null,
      });
    }

    // ── Suggested Deadlines from Case Frontmatter (unconfirmed AI suggestions) ──
    for (const page of casePages) {
      const f = fm(page);
      const sds = Array.isArray(f.suggested_deadlines)
        ? (f.suggested_deadlines as Array<{
            title: string;
            due_date: string;
            urgency?: string;
            source?: string;
            source_quote?: string;
            confirmed: boolean;
            review_status?: string;
          }>)
        : [];
      for (let i = 0; i < sds.length; i++) {
        const sd = sds[i];
        if (!sd || sd.confirmed) continue;
        if (sd.review_status === "approved" || sd.review_status === "rejected") continue;

        const urgency = sd.urgency || "medium";
        const dueDate = sd.due_date;
        const daysUntil = dueDate
          ? Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
          : null;
        let priority: "high" | "medium" | "low" = "medium";
        if (
          urgency === "high" ||
          urgency === "critical" ||
          (daysUntil !== null && daysUntil <= 3)
        ) {
          priority = "high";
        }

        items.push({
          id: `${page.slug}#suggested_deadlines.${i}`,
          type: "suggested_deadline",
          title: sd.title || "Fristvorschlag",
          description: dueDate
            ? `${dueDate}${daysUntil !== null ? ` (${daysUntil < 0 ? `${Math.abs(daysUntil)} Tage überfällig` : `${daysUntil} Tage`})` : ""}${sd.source_quote ? ` · "${sd.source_quote.slice(0, 90)}"` : ""}`
            : sd.title || "",
          caseSlug: page.slug,
          caseTitle: page.title || null,
          priority,
          source: sd.source || "ai",
          createdAt: dateStr(f.created_at) || dateStr(page.created_at),
          status: sd.review_status || "unreviewed",
          actionLabel: "Übernehmen",
          secondaryLabel: "Verwerfen",
          pageSlug: page.slug,
          requestSlug: null,
          items: [],
          channel: null,
          portalUrl: null,
          messageDraft: null,
          dueDate: dueDate || null,
          urgency: urgency || null,
          law: null,
          confidence: null,
          sourceQuote: sd.source_quote || null,
          partyName: null,
          partyRole: null,
          factId: null,
          factStatement: null,
          factConfidence: null,
          arrayIndex: i,
        });
      }
    }

    // ── Suggested Parties (from legal_case frontmatter, unconfirmed) ──
    for (const page of casePages) {
      const f = fm(page);
      const parties = Array.isArray(f.suggested_parties)
        ? (f.suggested_parties as Array<{
            name: string;
            role: string;
            source: string;
            confirmed: boolean;
            review_status?: string;
          }>)
        : [];
      for (let i = 0; i < parties.length; i++) {
        const party = parties[i];
        if (!party || party.confirmed) continue;
        if (party.review_status === "approved" || party.review_status === "rejected") continue;

        items.push({
          id: `${page.slug}#suggested_parties.${i}`,
          type: "suggested_party",
          title: party.name || "Parteienvorschlag",
          description: `Rolle: ${party.role || "unbekannt"} · Quelle: ${party.source || "KI"}`,
          caseSlug: page.slug,
          caseTitle: page.title || null,
          priority: "medium",
          source: party.source || "ai",
          createdAt: dateStr(f.created_at) || dateStr(page.created_at),
          status: party.review_status || "unreviewed",
          actionLabel: "Bestätigen",
          secondaryLabel: "Verwerfen",
          pageSlug: page.slug,
          requestSlug: null,
          items: [],
          channel: null,
          portalUrl: null,
          messageDraft: null,
          dueDate: null,
          urgency: null,
          law: null,
          confidence: null,
          sourceQuote: null,
          partyName: party.name || null,
          partyRole: party.role || null,
          factId: null,
          factStatement: null,
          factConfidence: null,
          arrayIndex: i,
        });
      }
    }

    // ── Pending Facts (from legal_case frontmatter, review_status=pending) ──
    for (const page of casePages) {
      const f = fm(page);
      const facts = Array.isArray(f.facts)
        ? (f.facts as Array<{
            id?: string;
            statement: string;
            source?: string;
            confidence?: string;
            review_status?: string;
          }>)
        : [];
      for (let i = 0; i < facts.length; i++) {
        const fact = facts[i];
        if (!fact) continue;
        const rs = fact.review_status || "pending";
        if (
          rs === "approved" ||
          rs === "party_assertion" ||
          rs === "corrected" ||
          rs === "rejected"
        )
          continue;

        items.push({
          id: `${page.slug}#facts.${fact.id || i}`,
          type: "pending_fact",
          title: fact.statement?.slice(0, 80) || "Offene Tatsache",
          description: fact.statement?.slice(0, 180) || "",
          caseSlug: page.slug,
          caseTitle: page.title || null,
          priority: fact.confidence === "high" ? "medium" : "low",
          source: fact.source || "ai",
          createdAt: dateStr(f.created_at) || dateStr(page.created_at),
          status: rs,
          actionLabel: "Bestätigen",
          secondaryLabel: "Als Parteibehauptung",
          pageSlug: page.slug,
          requestSlug: null,
          items: [],
          channel: null,
          portalUrl: null,
          messageDraft: null,
          dueDate: null,
          urgency: null,
          law: null,
          confidence: fact.confidence || null,
          sourceQuote: null,
          partyName: null,
          partyRole: null,
          factId: fact.id || String(i),
          factStatement: fact.statement || null,
          factConfidence: fact.confidence || null,
          arrayIndex: i,
        });
      }
    }

    items.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const byPriority = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (byPriority !== 0) return byPriority;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return apiSuccess({ items, total: items.length });
  }
);
