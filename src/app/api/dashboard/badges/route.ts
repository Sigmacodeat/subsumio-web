import { createHandler, apiSuccess } from "@/lib/api-handler";
import type { ApprovalCategoryKey } from "@/lib/approval-summary";
import { loadApprovalCounts } from "@/lib/approval-counts";
import { fetchPageStatusCounts, sumCounts, type PageStatusCounts } from "@/lib/engine-page-counts";
import { addDaysToIsoDate, firmToday } from "@/lib/datetime";
import { createTtlCache, headersCacheKey } from "@/lib/server-ttl-cache";

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

/** Vault badge: documents without a matter, or whose processing needs a look. */
const VAULT_COUNT_QUERY = {
  types: ["document", "legal_document"],
  groupFields: [
    "assignment_status",
    "extraction_status",
    "analysis_status",
    "extraction_unverified",
  ],
  presentFields: ["case_slug"],
};
const VAULT_GAP_EXTRACTION = new Set([
  "ocr_needed",
  "ocr_failed",
  "uploaded",
  "processing",
  "ocr_processing",
]);
const VAULT_GAP_ANALYSIS = new Set(["failed", "pending"]);

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

/** Approval badge hrefs and the approval categories each one shows. */
const APPROVAL_BADGES: Array<[string, ApprovalCategoryKey[] | "all"]> = [
  ["/dashboard/freigaben", "all"],
  ["/dashboard/communications", ["deadlines", "client_input", "requests", "case_scans"]],
  ["/dashboard/approvals", ["agent_actions"]],
  ["/dashboard/review-queue", ["analyses"]],
  ["/dashboard/time-suggestions", ["time"]],
];

async function computeBadges(ctx: {
  headers: Record<string, string>;
  user: { email: string };
  demo?: { ingested?: boolean } | null;
}): Promise<BadgeResult> {
  const degraded = new Set<string>();
  // Approvals and the vault are counted by the engine, too (grouped fields;
  // the filters of the lists apply to the groups).
  const approvalsPromise = loadApprovalCounts(ctx.headers, ctx.user.email).catch(() => null);
  // Deadlines, intake, signatures and invoices are counted by the engine in
  // one query per status (no page listing); a failed or partial count marks
  // the badges degraded instead of showing a too-low number.
  const countsPromise: Promise<PageStatusCounts | null> = fetchPageStatusCounts(ctx.headers, {
    types: COUNTED_TYPES,
    dateFields: ["due_date", "date"],
    dateBefore: addDaysToIsoDate(firmToday(), DEADLINE_CRITICAL_DAYS),
  }).catch(() => null);
  const vaultPromise: Promise<PageStatusCounts | null> = fetchPageStatusCounts(
    ctx.headers,
    VAULT_COUNT_QUERY
  ).catch(() => null);
  const [counted, vault] = await Promise.all([countsPromise, vaultPromise]);
  if (!counted || !counted.complete) for (const href of COUNTED_HREFS) degraded.add(href);
  if (!vault || !vault.complete) degraded.add("/dashboard/vault");
  const counts = counted?.counts ?? [];
  const openOf = (type: string, field: "count" | "before_count" = "count") =>
    sumCounts(counts, (c) => c.type === type && isOpenStatus(c.status), field);
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
  // per-list counts. Each category applies its list's filter (see
  // approval-counts.ts), so a badge never promises items its page does not
  // show; a failed or partial count marks the affected badges degraded.
  if (!approvals) {
    for (const [href] of APPROVAL_BADGES) degraded.add(href);
  } else {
    for (const [href, keys] of APPROVAL_BADGES) {
      const partial =
        keys === "all"
          ? approvals.incomplete.length > 0
          : keys.some((k) => approvals.incomplete.includes(k));
      if (partial) degraded.add(href);
    }
    const count = (...keys: ApprovalCategoryKey[]) =>
      keys.reduce((n, k) => n + approvals.byKey[k], 0);
    if (approvals.total > 0) {
      badges["/dashboard/freigaben"] = {
        count: approvals.total,
        variant: approvals.urgent ? "danger" : "warning",
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

  // Vault — unassigned docs + review gaps (a document can be both)
  let vaultCount = 0;
  for (const c of vault?.counts ?? []) {
    const f = c.fields;
    const unassigned = !c.present.case_slug && f.assignment_status !== "assigned";
    const reviewGap =
      VAULT_GAP_EXTRACTION.has(f.extraction_status ?? "") ||
      f.extraction_unverified === "true" ||
      VAULT_GAP_ANALYSIS.has(f.analysis_status ?? "");
    vaultCount += c.count * (Number(unassigned) + Number(reviewGap));
  }
  if (vaultCount > 0) {
    badges["/dashboard/vault"] = { count: vaultCount, variant: "danger" };
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
