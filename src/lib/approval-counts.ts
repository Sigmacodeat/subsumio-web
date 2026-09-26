import type { ApprovalCategoryKey } from "@/lib/approval-summary";
import {
  fetchPageStatusCounts,
  type PageStatusCount,
  type PageStatusCountQuery,
  type PageStatusCounts,
} from "@/lib/engine-page-counts";
import { addDaysToIsoDate, firmToday } from "@/lib/datetime";

/**
 * The numbers of the approvals summary (approval-summary.ts), counted by the
 * engine (`GET /api/page-status-counts`) instead of listing every page — for
 * the sidebar badges, which only need counts. Each category applies the same
 * filter as its list (see approval-summary.ts / review-inbox-items.ts),
 * expressed over grouped fields.
 */

/** Days until a suggested deadline counts as urgent (same as the review inbox). */
const URGENT_DAYS = 3;

export interface ApprovalCounts {
  total: number;
  /** At least one urgent item (danger badge). */
  urgent: boolean;
  byKey: Record<ApprovalCategoryKey, number>;
  /** Categories whose count failed or is only a lower bound. */
  incomplete: ApprovalCategoryKey[];
}

type Result = PageStatusCounts | null;

export interface ApprovalCountResults {
  /** agent_action, pipeline_state, time_suggestion, client_submission, agent_run, document_request */
  pages: Result;
  /** legal_deadline, grouped by review status, status and urgency */
  deadlines: Result;
  /** document_request items: open (not received) items per request status */
  requestItems: Result;
  /** legal_case suggested_deadlines elements */
  caseDeadlines: Result;
  /** legal_case suggested_parties elements */
  caseParties: Result;
  /** legal_case facts elements */
  caseFacts: Result;
}

export function approvalCountQueries(
  today: string
): Record<keyof ApprovalCountResults, PageStatusCountQuery> {
  const dateBefore = addDaysToIsoDate(today, URGENT_DAYS);
  return {
    pages: {
      types: [
        "agent_action",
        "pipeline_state",
        "time_suggestion",
        "client_submission",
        "agent_run",
        "document_request",
      ],
      groupFields: ["review_status", "review_origin", "user_email"],
    },
    deadlines: {
      types: ["legal_deadline"],
      statusField: "review_status",
      groupFields: ["status", "urgency", "ai_confidence"],
      dateFields: ["due_date", "date"],
      dateBefore,
      dateFallback: false,
    },
    requestItems: {
      types: ["document_request"],
      arrayField: "items",
      presentFields: ["received_document_slug"],
    },
    caseDeadlines: {
      types: ["legal_case"],
      arrayField: "suggested_deadlines",
      groupFields: ["confirmed", "review_status", "urgency"],
      dateFields: ["due_date"],
      dateBefore,
      dateFallback: false,
    },
    caseParties: {
      types: ["legal_case"],
      arrayField: "suggested_parties",
      groupFields: ["confirmed", "review_status"],
    },
    caseFacts: {
      types: ["legal_case"],
      arrayField: "facts",
      groupFields: ["review_status"],
    },
  };
}

const URGENT_LEVELS = new Set(["high", "critical"]);
const CATEGORY_KEYS: ApprovalCategoryKey[] = [
  "deadlines",
  "client_input",
  "requests",
  "agent_actions",
  "analyses",
  "case_scans",
  "time",
];

/** A frontmatter flag that a list reads as truthy (`if (x.confirmed)`). */
function truthy(v: string): boolean {
  return v !== "" && v !== "false" && v !== "0";
}

/** Pure assembly — exported for tests. */
export function buildApprovalCounts(r: ApprovalCountResults, userEmail: string): ApprovalCounts {
  const incomplete = new Set<ApprovalCategoryKey>();
  const byKey = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<
    ApprovalCategoryKey,
    number
  >;
  let urgent = false;
  const groupsOf = (res: Result, keys: ApprovalCategoryKey[]): PageStatusCount[] => {
    if (!res || !res.complete) for (const k of keys) incomplete.add(k);
    return res?.counts ?? [];
  };
  const me = userEmail.toLowerCase();

  for (const c of groupsOf(r.pages, [
    "agent_actions",
    "analyses",
    "time",
    "client_input",
    "case_scans",
    "requests",
  ])) {
    const f = c.fields;
    switch (c.type) {
      case "agent_action":
        if (c.status === "" || c.status === "pending") byKey.agent_actions += c.count;
        break;
      case "pipeline_state":
        if (c.status === "awaiting_review" || c.status === "needs_human_review") {
          byKey.analyses += c.count;
          if (c.status === "needs_human_review" && c.count > 0) urgent = true;
        }
        break;
      case "time_suggestion":
        if ((c.status === "" || c.status === "suggested") && f.user_email === me) {
          byKey.time += c.count;
        }
        break;
      case "client_submission":
        // Every unreviewed client submission is urgent (priority high).
        if (f.review_status !== "reviewed") {
          byKey.client_input += c.count;
          if (c.count > 0) urgent = true;
        }
        break;
      case "agent_run":
        if (
          f.review_origin === "case_scan" &&
          f.review_status !== "reviewed" &&
          f.review_status !== "rejected"
        ) {
          byKey.case_scans += c.count;
        }
        break;
      case "document_request":
        // Drafts count even without open items; other open requests via their items.
        if (c.status === "draft") byKey.requests += c.count;
        break;
    }
  }

  for (const c of groupsOf(r.requestItems, ["requests"])) {
    if (c.present.received_document_slug) continue;
    if (c.status === "fulfilled" || c.status === "expired" || c.status === "draft") continue;
    byKey.requests += c.page_count;
  }

  for (const c of groupsOf(r.deadlines, ["deadlines"])) {
    if (c.status === "approved" || c.status === "rejected") continue;
    const f = c.fields;
    if (f.status === "done" || f.status === "completed") continue;
    byKey.deadlines += c.count;
    const level = f.urgency || f.ai_confidence;
    if (c.count > 0 && (URGENT_LEVELS.has(level ?? "") || c.before_count > 0)) urgent = true;
  }

  for (const c of groupsOf(r.caseDeadlines, ["deadlines"])) {
    const f = c.fields;
    if (truthy(f.confirmed ?? "")) continue;
    if (f.review_status === "approved" || f.review_status === "rejected") continue;
    byKey.deadlines += c.count;
    if (c.count > 0 && (URGENT_LEVELS.has(f.urgency ?? "") || c.before_count > 0)) urgent = true;
  }

  for (const c of groupsOf(r.caseParties, ["client_input"])) {
    const f = c.fields;
    if (truthy(f.confirmed ?? "")) continue;
    if (f.review_status === "approved" || f.review_status === "rejected") continue;
    byKey.client_input += c.count;
  }

  const SETTLED_FACTS = new Set(["approved", "party_assertion", "corrected", "rejected"]);
  for (const c of groupsOf(r.caseFacts, ["client_input"])) {
    if (SETTLED_FACTS.has(c.fields.review_status || "pending")) continue;
    byKey.client_input += c.count;
  }

  return {
    total: CATEGORY_KEYS.reduce((n, k) => n + byKey[k], 0),
    urgent,
    byKey,
    incomplete: CATEGORY_KEYS.filter((k) => incomplete.has(k)),
  };
}

/** Approval counts of the caller (engine-side, one count per query shape). */
export async function loadApprovalCounts(
  headers: Record<string, string>,
  userEmail: string
): Promise<ApprovalCounts> {
  const queries = approvalCountQueries(firmToday());
  const keys = Object.keys(queries) as Array<keyof ApprovalCountResults>;
  const results = await Promise.all(
    keys.map((k) => fetchPageStatusCounts(headers, queries[k]).catch(() => null))
  );
  return buildApprovalCounts(
    Object.fromEntries(keys.map((k, i) => [k, results[i]])) as unknown as ApprovalCountResults,
    userEmail
  );
}
