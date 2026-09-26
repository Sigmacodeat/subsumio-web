import { createHandler, apiSuccess } from "@/lib/api-handler";
import { loadApprovalSummary, type ApprovalCategoryKey } from "@/lib/approval-summary";
import { listEnginePagesDetailed } from "@/lib/engine-pages";
import { fetchPageStatusCounts, sumCounts, type PageStatusCounts } from "@/lib/engine-page-counts";
import { addDaysToIsoDate, firmToday } from "@/lib/datetime";
import { createTtlCache, headersCacheKey } from "@/lib/server-ttl-cache";
import { countOpenTasksFor } from "@/lib/task-assignment";

/** Deadlines due within this many days (or overdue) raise the badge. */
const DEADLINE_CRITICAL_DAYS = 3;
/** Types whose badge is a status count (engine-side, one query). */
const COUNTED_TYPES = ["legal_deadline", "intake_request", "signature_request", "invoice"];
const COUNTED_HREFS = [
  "/dashboard/deadlines",
  "/dashboard/intake",
  "/dashboard/signature",
  "/dashboard/invoicing",
];

interface BadgeCounts {
  [href: string]: {
    count: number;
    variant: "danger" | "warning" | "info";
    /** The count rests on an incomplete read (lower bound). */
    degraded?: boolean;
    label?: string;
  };
}

const CLOSED_STATUSES = new Set([
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
  "tombstoned",
]);

function isOpenStatus(status: unknown): boolean {
  return !CLOSED_STATUSES.has(String(status ?? "").toLowerCase());
}

/** Vault badge: new uploads sit at the top of the newest-first list. */
const VAULT_WINDOW = 2_000;
/** Matters read for "Meine Aufgaben" (tasks live in the matter). */
const TASK_CASES_MAX = 10_000;

/** Intake statuses that still wait for the firm. */
const OPEN_INTAKE_STATUSES = new Set(["", "new", "needs_info", "conflict_check"]);

const DEGRADED_LABEL = "Zahl unvollständig — nicht alle Einträge konnten gelesen werden";

interface BadgeResult {
  badges: BadgeCounts;
  /** Badge hrefs whose count rests on an incomplete read. */
  degraded: string[];
}

/**
 * Per caller (brain + access), badge counts are computed at most once per
 * 30 s; concurrent requests (several tabs, sidebar + overview) share one run.
 */
const badgeCache = createTtlCache<BadgeResult>(30_000);

type Listed = { pages: Record<string, unknown>[]; incomplete: boolean };

async function listForBadge(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<Listed> {
  try {
    const r = await listEnginePagesDetailed(headers, type, limit, { timeoutMs: 8_000 });
    return {
      pages: r.pages as unknown as Record<string, unknown>[],
      incomplete: r.failed || r.truncated,
    };
  } catch {
    return { pages: [], incomplete: true };
  }
}

async function computeBadges(ctx: {
  headers: Record<string, string>;
  user: { email: string; id?: string };
  demo?: { ingested?: boolean } | null;
}): Promise<BadgeResult> {
  const degraded = new Set<string>();
  const approvalsPromise = loadApprovalSummary(ctx.headers, ctx.user.email).catch(() => null);
  // Deadlines, intake, signatures and invoices are counted by the engine in
  // one query per status (no page listing); a failed or partial count marks
  // the badges degraded instead of showing a too-low number.
  const countsPromise: Promise<PageStatusCounts | null> = fetchPageStatusCounts(ctx.headers, {
    types: COUNTED_TYPES,
    dateFields: ["due_date", "date"],
    dateBefore: addDaysToIsoDate(firmToday(), DEADLINE_CRITICAL_DAYS),
  }).catch(() => null);
  const userId = ctx.user.id ?? "";
  const [counted, docsR, legalDocsR, casesR] = await Promise.all([
    countsPromise,
    listForBadge(ctx.headers, "document", VAULT_WINDOW),
    listForBadge(ctx.headers, "legal_document", VAULT_WINDOW),
    userId
      ? listForBadge(ctx.headers, "legal_case", TASK_CASES_MAX)
      : Promise.resolve<Listed>({ pages: [], incomplete: false }),
  ]);
  if (casesR.incomplete) degraded.add("/dashboard/tasks");
  if (!counted || !counted.complete) for (const href of COUNTED_HREFS) degraded.add(href);
  if (docsR.incomplete || legalDocsR.incomplete) degraded.add("/dashboard/vault");
  const counts = counted?.counts ?? [];
  const openOf = (type: string, field: "count" | "before_count" = "count") =>
    sumCounts(counts, (c) => c.type === type && isOpenStatus(c.status), field);
  const docs = docsR.pages;
  const legalDocs = legalDocsR.pages;
  const approvals = await approvalsPromise;

  const badges: BadgeCounts = {};

  // Deadlines — open and due within DEADLINE_CRITICAL_DAYS or overdue = danger
  const criticalCount = openOf("legal_deadline", "before_count");
  if (criticalCount > 0) {
    badges["/dashboard/deadlines"] = { count: criticalCount, variant: "danger" };
  }

  // Intake — new items. bea_draft/bea_message are deliberately NOT counted:
  // the badge must not promise items its page does not show, and the intake
  // list only renders intake_request records (the beA dashboard is retired;
  // imported bea_message rows live under /dashboard/communications).
  // Only requests still waiting for the firm (deleted ones are never
  // counted by the engine).
  const inboxCount = sumCounts(
    counts,
    (c) => c.type === "intake_request" && OPEN_INTAKE_STATUSES.has(c.status)
  );
  if (inboxCount > 0) {
    badges["/dashboard/intake"] = { count: inboxCount, variant: "info" };
  }
  // Live demo: the staged Klagebeantwortung is a real pending inbox item
  // until the visitor files it (demo tour chapter 2).
  if (ctx.demo && !ctx.demo.ingested && !badges["/dashboard/intake"]) {
    badges["/dashboard/intake"] = { count: 1, variant: "info" };
  }

  // Approvals — one number for everything waiting for a decision, plus the
  // per-list counts. All come from the same summary the lists use, so a
  // badge never promises items its page does not show.
  if (!approvals) {
    for (const href of [
      "/dashboard/freigaben",
      "/dashboard/communications",
      "/dashboard/approvals",
      "/dashboard/review-queue",
      "/dashboard/time-suggestions",
    ]) {
      degraded.add(href);
    }
  }
  if (approvals) {
    const byKey = new Map(approvals.categories.map((c) => [c.key, c]));
    const count = (...keys: ApprovalCategoryKey[]) =>
      keys.reduce((n, k) => n + (byKey.get(k)?.count ?? 0), 0);
    if (approvals.total > 0) {
      badges["/dashboard/freigaben"] = {
        count: approvals.total,
        variant: approvals.urgent > 0 ? "danger" : "warning",
      };
    }
    const inbox = count("deadlines", "client_input", "requests", "case_scans");
    if (inbox > 0) badges["/dashboard/communications"] = { count: inbox, variant: "warning" };
    const actions = count("agent_actions");
    if (actions > 0) badges["/dashboard/approvals"] = { count: actions, variant: "warning" };
    const analyses = count("analyses");
    if (analyses > 0) badges["/dashboard/review-queue"] = { count: analyses, variant: "warning" };
    const time = count("time");
    if (time > 0) badges["/dashboard/time-suggestions"] = { count: time, variant: "info" };
  }

  // Signatures — pending
  const sigCount = openOf("signature_request");
  if (sigCount > 0) {
    badges["/dashboard/signature"] = { count: sigCount, variant: "warning" };
  }

  // Vault — unassigned docs + review gaps
  const allDocs = [...docs, ...legalDocs];
  const unassignedCount = allDocs.filter((d) => {
    const fm = (d.frontmatter ?? {}) as Record<string, unknown>;
    return !fm.case_slug && fm.assignment_status !== "assigned";
  }).length;
  const reviewGapCount = allDocs.filter((d) => {
    const fm = (d.frontmatter ?? {}) as Record<string, unknown>;
    const es = fm.extraction_status;
    const as = fm.analysis_status;
    return (
      es === "ocr_needed" ||
      es === "ocr_failed" ||
      es === "uploaded" ||
      es === "processing" ||
      es === "ocr_processing" ||
      fm.extraction_unverified === true ||
      as === "failed" ||
      as === "pending"
    );
  }).length;
  const vaultCount = unassignedCount + reviewGapCount;
  if (vaultCount > 0) {
    badges["/dashboard/vault"] = { count: vaultCount, variant: "danger" };
  }

  // Tasks assigned to the caller (open ones, in active matters)
  const myTasks = countOpenTasksFor(
    casesR.pages as Array<{ frontmatter?: Record<string, unknown> }>,
    userId
  );
  if (myTasks > 0) {
    badges["/dashboard/tasks"] = { count: myTasks, variant: "info" };
  }

  // Invoices — open
  const invoiceCount = openOf("invoice");
  if (invoiceCount > 0) {
    badges["/dashboard/invoicing"] = { count: invoiceCount, variant: "warning" };
  }

  // An incomplete read is shown, never passed off as the real number: the
  // badge carries `degraded` (the sidebar marks the count as a lower bound).
  for (const href of degraded) {
    badges[href] = {
      ...(badges[href] ?? { count: 0, variant: "warning" as const }),
      degraded: true,
      label: DEGRADED_LABEL,
    };
  }
  return { badges, degraded: [...degraded] };
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    const key = [
      headersCacheKey(ctx.headers),
      ctx.user.email,
      ctx.demo ? `demo:${ctx.demo.ingested ? 1 : 0}` : "",
    ].join("\u0000");
    const { badges } = await badgeCache.get(key, () => computeBadges(ctx));
    return apiSuccess(badges);
  }
);
