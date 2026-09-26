import { listEnginePages } from "@/lib/engine-pages";
import { PARTY_ROLE_LABEL } from "@/lib/legal/case-suggestions";
import type { BrainPage } from "@/lib/types";

export interface ReviewInboxItem {
  id: string;
  type:
    | "document_request"
    | "suggested_deadline"
    | "client_submission"
    | "suggested_party"
    | "pending_fact"
    | "case_scan_finding";
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
  /** The request offers the client portal; a fresh link is issued on copy. */
  portalLink: boolean;
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

/** A case scan result still awaiting a lawyer's review. */
export function isOpenCaseScanFinding(page: { frontmatter?: Record<string, unknown> }): boolean {
  const f = (page.frontmatter ?? {}) as Record<string, unknown>;
  if (f.review_origin !== "case_scan") return false;
  const status = typeof f.review_status === "string" ? f.review_status : "unreviewed";
  return status !== "reviewed" && status !== "rejected";
}

async function fetchPages(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<BrainPage[]> {
  // Batched: the engine returns at most 200 pages per request.
  return (await listEnginePages(headers, type, limit, {
    timeoutMs: 10_000,
  })) as unknown as BrainPage[];
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

/**
 * Open review-inbox items of the firm: document requests, AI deadline
 * suggestions and unreviewed AI calendar deadlines, client submissions,
 * suggested parties and pending facts. Shared by the review-inbox list, the
 * approvals overview and the sidebar badges, so counts always match the list.
 */
export async function loadReviewInboxItems(
  headers: Record<string, string>
): Promise<ReviewInboxItem[]> {
  const [docRequests, deadlines, submissions, casePages, agentRuns] = await Promise.all([
    fetchPages(headers, "document_request", 5_000),
    fetchPages(headers, "legal_deadline", 10_000),
    fetchPages(headers, "client_submission", 5_000),
    fetchPages(headers, "legal_case", 10_000),
    fetchPages(headers, "agent_run", 5_000),
  ]);

  const items: ReviewInboxItem[] = [];

  // Build case title lookup from fetched case pages
  const caseTitleMap = new Map<string, string>();
  for (const cp of casePages) {
    if (cp.slug && cp.title) caseTitleMap.set(cp.slug, cp.title);
  }
  const lookupCaseTitle = (slug: string | null): string | null => {
    if (!slug) return null;
    return caseTitleMap.get(slug) ?? null;
  };

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
      caseTitle: lookupCaseTitle(str(f.case_slug) || null),
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
      portalLink: f.portal_link === true || !!str(f.portal_url),
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
      caseTitle: lookupCaseTitle(str(f.case_slug) || null),
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
      portalLink: false,
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
        str(f.normalized_text || page.content).slice(0, 180) || "Neue WhatsApp-Einreichung prüfen.",
      caseSlug: str(f.case_slug) || null,
      caseTitle: lookupCaseTitle(str(f.case_slug) || null),
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
      portalLink: false,
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
      if (urgency === "high" || urgency === "critical" || (daysUntil !== null && daysUntil <= 3)) {
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
        portalLink: false,
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
        description: `Rolle: ${PARTY_ROLE_LABEL[party.role] ?? (party.role || "unbekannt")} · Quelle: ${party.source || "KI"}`,
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
        portalLink: false,
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
      if (rs === "approved" || rs === "party_assertion" || rs === "corrected" || rs === "rejected")
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
        portalLink: false,
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

  // ── Case scan results (AI, awaiting a lawyer's review) ──
  // Nothing of the scan is written into the matter: the result page stays a
  // review item until it is marked reviewed or discarded.
  for (const page of agentRuns) {
    if (!isOpenCaseScanFinding(page)) continue;
    const f = fm(page);
    const caseSlug = str(f.case_slug) || null;
    const caseTitle = lookupCaseTitle(caseSlug);
    items.push({
      id: page.slug,
      type: "case_scan_finding",
      title: `Fall-Scan: ${caseTitle ?? caseSlug ?? (page.title || "Akte")}`,
      description: "KI-Prüfergebnis zur Akte — anwaltlich zu prüfen, bevor etwas übernommen wird.",
      caseSlug,
      caseTitle,
      priority: "medium",
      source: "Fall-Scanner (KI)",
      createdAt: dateStr(page.created_at) || dateStr(page.updated_at),
      status: str(f.review_status) || "unreviewed",
      actionLabel: "Als geprüft markieren",
      secondaryLabel: "Verwerfen",
      pageSlug: page.slug,
      requestSlug: null,
      items: [],
      channel: null,
      portalLink: false,
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

  items.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const byPriority = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (byPriority !== 0) return byPriority;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  return items;
}
