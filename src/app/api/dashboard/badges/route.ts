import { createHandler, apiSuccess } from "@/lib/api-handler";
import { loadApprovalSummary, type ApprovalCategoryKey } from "@/lib/approval-summary";
import { listEnginePagesDetailed } from "@/lib/engine-pages";
import { createTtlCache, headersCacheKey } from "@/lib/server-ttl-cache";

/** Safety stop for the full deadline read — far beyond any real firm. */
const DEADLINE_BADGE_READ_CAP = 100_000;

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

function dateFrom(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/** Safety stop for the other badge lists (open items of one kind). */
const BADGE_LIST_CAP = 10_000;
/** Vault badge: new uploads sit at the top of the newest-first list. */
const VAULT_WINDOW = 2_000;

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
  user: { email: string };
  demo?: { ingested?: boolean } | null;
}): Promise<BadgeResult> {
  const degraded = new Set<string>();
  const approvalsPromise = loadApprovalSummary(ctx.headers, ctx.user.email).catch(() => null);
  const [deadlinesR, intakeR, signaturesR, docsR, legalDocsR, invoicesR] = await Promise.all([
    // Every deadline, not the 100 most recently edited: the listing is
    // sorted by last update, so a fixed cap hid exactly the long-standing
    // deadlines that are now falling due.
    listForBadge(ctx.headers, "legal_deadline", DEADLINE_BADGE_READ_CAP),
    listForBadge(ctx.headers, "intake_request", BADGE_LIST_CAP),
    listForBadge(ctx.headers, "signature_request", BADGE_LIST_CAP),
    listForBadge(ctx.headers, "document", VAULT_WINDOW),
    listForBadge(ctx.headers, "legal_document", VAULT_WINDOW),
    listForBadge(ctx.headers, "invoice", BADGE_LIST_CAP),
  ]);
  if (deadlinesR.incomplete) degraded.add("/dashboard/deadlines");
  if (intakeR.incomplete) degraded.add("/dashboard/intake");
  if (signaturesR.incomplete) degraded.add("/dashboard/signature");
  if (docsR.incomplete || legalDocsR.incomplete) degraded.add("/dashboard/vault");
  if (invoicesR.incomplete) degraded.add("/dashboard/invoicing");
  const deadlines = deadlinesR.pages;
  const intake = intakeR.pages;
  const signatures = signaturesR.pages;
  const docs = docsR.pages;
  const legalDocs = legalDocsR.pages;
  const invoices = invoicesR.pages;
  const approvals = await approvalsPromise;

  const badges: BadgeCounts = {};

  // Deadlines — critical (≤3 days) = danger, overdue = danger
  const deadlineItems = deadlines
    .map((p) => {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const due = dateFrom(fm.due_date ?? fm.date ?? p.created_at);
      if (!due) return null;
      const delta = daysUntil(due);
      const open = isOpenStatus(fm.status);
      return { delta, overdue: delta < 0 && open, critical: delta >= 0 && delta <= 3 && open };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const criticalCount = deadlineItems.filter((d) => d.overdue || d.critical).length;
  if (criticalCount > 0) {
    badges["/dashboard/deadlines"] = { count: criticalCount, variant: "danger" };
  }

  // Intake — new items. bea_draft/bea_message are deliberately NOT counted:
  // the badge must not promise items its page does not show, and the intake
  // list only renders intake_request records (the beA dashboard is retired;
  // imported bea_message rows live under /dashboard/communications).
  // Only requests still waiting for the firm (deleted ones are already
  // filtered by the listing).
  const inboxCount = intake.filter((p) =>
    OPEN_INTAKE_STATUSES.has(
      String(((p.frontmatter ?? {}) as Record<string, unknown>).status ?? "").toLowerCase()
    )
  ).length;
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
  const sigCount = signatures.filter((p) =>
    isOpenStatus(((p.frontmatter ?? {}) as Record<string, unknown>).status)
  ).length;
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

  // Invoices — open
  const invoiceCount = invoices.filter((p) =>
    isOpenStatus(((p.frontmatter ?? {}) as Record<string, unknown>).status)
  ).length;
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

