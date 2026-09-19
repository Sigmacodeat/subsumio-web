import { listEnginePages } from "@/lib/engine-pages";
import { loadReviewInboxItems, type ReviewInboxItem } from "@/lib/review-inbox-items";

/**
 * Everything waiting for a lawyer's decision, in one place: AI deadline
 * suggestions, client submissions and other review-inbox items, agent and
 * copilot actions, automatic matter analyses and the user's own time
 * suggestions.
 *
 * Each category is counted with the SAME filter as the list it links to, so
 * the sidebar badge, the overview and the target list never disagree.
 */

export type ApprovalCategoryKey =
  | "deadlines"
  | "client_input"
  | "requests"
  | "agent_actions"
  | "analyses"
  | "time";

export interface ApprovalPreview {
  title: string;
  detail: string | null;
  caseTitle: string | null;
  href: string;
  urgent: boolean;
}

export interface ApprovalCategory {
  key: ApprovalCategoryKey;
  label: string;
  description: string;
  href: string;
  count: number;
  urgent: number;
  preview: ApprovalPreview[];
}

export interface ApprovalSummary {
  total: number;
  urgent: number;
  categories: ApprovalCategory[];
  /** Categories whose source could not be read — shown instead of a false "0". */
  unavailable: ApprovalCategoryKey[];
}

type Page = { slug: string; title?: string; frontmatter?: Record<string, unknown> };

const PREVIEW = 3;
const REVIEW_HREF = "/dashboard/communications?view=review";

function fm(p: Page): Record<string, unknown> {
  return p.frontmatter ?? {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Agent/copilot actions still waiting for a decision (same rule as /dashboard/approvals). */
export function isPendingAgentAction(p: Page): boolean {
  const status = str(fm(p).status) || "pending";
  return status === "pending";
}

/** Automatic matter analyses waiting for review (same rule as /dashboard/review-queue). */
export function isPendingAnalysis(p: Page): boolean {
  const status = str(fm(p).status);
  return status === "awaiting_review" || status === "needs_human_review";
}

/** The user's own open time suggestions (same rule as /dashboard/time-suggestions). */
export function isOpenTimeSuggestion(p: Page, userEmail: string): boolean {
  const f = fm(p);
  return (
    (f.status ?? "suggested") === "suggested" &&
    str(f.user_email).toLowerCase() === userEmail.toLowerCase()
  );
}

function inboxPreview(item: ReviewInboxItem): ApprovalPreview {
  return {
    title: item.title,
    detail: item.description || null,
    caseTitle: item.caseTitle,
    href: REVIEW_HREF,
    urgent: item.priority === "high",
  };
}

function category(
  key: ApprovalCategoryKey,
  label: string,
  description: string,
  href: string,
  previews: ApprovalPreview[]
): ApprovalCategory {
  return {
    key,
    label,
    description,
    href,
    count: previews.length,
    urgent: previews.filter((p) => p.urgent).length,
    preview: [...previews].sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, PREVIEW),
  };
}

/** Pure assembly — exported for tests. */
export function buildApprovalSummary(input: {
  inbox: ReviewInboxItem[] | null;
  agentActions: Page[] | null;
  analyses: Page[] | null;
  timeSuggestions: Page[] | null;
  userEmail: string;
}): ApprovalSummary {
  const unavailable: ApprovalCategoryKey[] = [];
  const inbox = input.inbox ?? [];
  if (!input.inbox) unavailable.push("deadlines", "client_input", "requests");
  if (!input.agentActions) unavailable.push("agent_actions");
  if (!input.analyses) unavailable.push("analyses");
  if (!input.timeSuggestions) unavailable.push("time");

  const deadlines = inbox.filter((i) => i.type === "suggested_deadline").map(inboxPreview);
  const clientInput = inbox
    .filter(
      (i) =>
        i.type === "client_submission" || i.type === "suggested_party" || i.type === "pending_fact"
    )
    .map(inboxPreview);
  const requests = inbox.filter((i) => i.type === "document_request").map(inboxPreview);

  const agentActions = (input.agentActions ?? []).filter(isPendingAgentAction).map((p) => ({
    title: str(fm(p).summary) || p.title || "Aktion",
    detail: str(fm(p).proposed_by) || null,
    caseTitle: null,
    href: "/dashboard/approvals",
    urgent: false,
  }));
  const analyses = (input.analyses ?? []).filter(isPendingAnalysis).map((p) => ({
    title: p.title || "Aktenanalyse",
    detail: str(fm(p).case_slug).split("/").pop() || null,
    caseTitle: null,
    href: "/dashboard/review-queue",
    urgent: str(fm(p).status) === "needs_human_review",
  }));
  const time = (input.timeSuggestions ?? [])
    .filter((p) => isOpenTimeSuggestion(p, input.userEmail))
    .map((p) => {
      const f = fm(p);
      return {
        title: str(f.description) || "Zeitvorschlag",
        detail: [str(f.date), f.duration_minutes ? `${f.duration_minutes} Min.` : ""]
          .filter(Boolean)
          .join(" · "),
        caseTitle: str(f.case_slug).split("/").pop() || null,
        href: "/dashboard/time-suggestions",
        urgent: false,
      };
    });

  const categories = [
    category(
      "deadlines",
      "KI-Fristen",
      "Von der KI erkannte Fristen. Erst nach Ihrer Freigabe verbindlich im Kalender.",
      REVIEW_HREF,
      deadlines
    ),
    category(
      "agent_actions",
      "Aktionen von Copilot und Agenten",
      "Vorgeschlagene Schreib- und Versandaktionen, die Ihre Zustimmung brauchen.",
      "/dashboard/approvals",
      agentActions
    ),
    category(
      "client_input",
      "Mandanteneingaben und erkannte Angaben",
      "Unterlagen aus dem Portal, erkannte Beteiligte und Tatsachen.",
      REVIEW_HREF,
      clientInput
    ),
    category(
      "analyses",
      "Automatische Aktenanalysen",
      "Analyseergebnisse, die vor der Verwendung geprüft werden müssen.",
      "/dashboard/review-queue",
      analyses
    ),
    category(
      "requests",
      "Unterlagenanforderungen",
      "Offene oder noch nicht versendete Anforderungen an Mandanten.",
      REVIEW_HREF,
      requests
    ),
    category(
      "time",
      "Ihre Zeitvorschläge",
      "Aus Ihrer Aktenarbeit gebündelte Zeiten, bereit zum Buchen.",
      "/dashboard/time-suggestions",
      time
    ),
  ];

  return {
    total: categories.reduce((n, c) => n + c.count, 0),
    urgent: categories.reduce((n, c) => n + c.urgent, 0),
    categories,
    unavailable,
  };
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

export async function loadApprovalSummary(
  headers: Record<string, string>,
  userEmail: string
): Promise<ApprovalSummary> {
  const [inbox, agentActions, analyses, timeSuggestions] = await Promise.all([
    orNull(loadReviewInboxItems(headers)),
    orNull(listEnginePages(headers, "agent_action", 2_000, { timeoutMs: 8_000 })),
    orNull(listEnginePages(headers, "pipeline_state", 2_000, { timeoutMs: 8_000 })),
    orNull(listEnginePages(headers, "time_suggestion", 2_000, { timeoutMs: 8_000 })),
  ]);
  return buildApprovalSummary({
    inbox,
    agentActions: agentActions as Page[] | null,
    analyses: analyses as Page[] | null,
    timeSuggestions: timeSuggestions as Page[] | null,
    userEmail,
  });
}
