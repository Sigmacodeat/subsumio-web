import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { loadApprovalSummary, type ApprovalCategoryKey } from "@/lib/approval-summary";

interface BadgeCounts {
  [href: string]: { count: number; variant: "danger" | "warning" | "info" };
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

async function fetchPagesByType(
  headers: Record<string, string>,
  type: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  try {
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("limit", String(limit));
    const res = await fetch(`${ENGINE_URL}/api/pages?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    const approvalsPromise = loadApprovalSummary(ctx.headers, ctx.user.email).catch(() => null);
    const [deadlines, intake, bea, beaMessages, signatures, docs, legalDocs, invoices] =
      await Promise.all([
        fetchPagesByType(ctx.headers, "legal_deadline", 100),
        fetchPagesByType(ctx.headers, "intake_request", 50),
        fetchPagesByType(ctx.headers, "bea_draft", 50),
        fetchPagesByType(ctx.headers, "bea_message", 50),
        fetchPagesByType(ctx.headers, "signature_request", 50),
        fetchPagesByType(ctx.headers, "document", 100),
        fetchPagesByType(ctx.headers, "legal_document", 100),
        fetchPagesByType(ctx.headers, "invoice", 50),
      ]);
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

    // Intake — new items
    const inboxCount = [...intake, ...bea, ...beaMessages].length;
    if (inboxCount > 0) {
      badges["/dashboard/intake"] = { count: inboxCount, variant: "info" };
    }

    // Approvals — one number for everything waiting for a decision, plus the
    // per-list counts. All come from the same summary the lists use, so a
    // badge never promises items its page does not show.
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
      const inbox = count("deadlines", "client_input", "requests");
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

    return apiSuccess(badges);
  }
);
