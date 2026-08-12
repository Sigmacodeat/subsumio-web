import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { offeneEintraege } from "@/lib/corpus-import-queue";

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
    const [
      deadlines,
      intake,
      bea,
      beaMessages,
      reviews,
      agentActions,
      signatures,
      docs,
      legalDocs,
      invoices,
      submissions,
      casePages,
    ] = await Promise.all([
      fetchPagesByType(ctx.headers, "legal_deadline", 100),
      fetchPagesByType(ctx.headers, "intake_request", 50),
      fetchPagesByType(ctx.headers, "bea_draft", 50),
      fetchPagesByType(ctx.headers, "bea_message", 50),
      fetchPagesByType(ctx.headers, "review_item", 50),
      fetchPagesByType(ctx.headers, "agent_action", 50),
      fetchPagesByType(ctx.headers, "signature_request", 50),
      fetchPagesByType(ctx.headers, "document", 100),
      fetchPagesByType(ctx.headers, "legal_document", 100),
      fetchPagesByType(ctx.headers, "invoice", 50),
      fetchPagesByType(ctx.headers, "client_submission", 50),
      fetchPagesByType(ctx.headers, "legal_case", 100),
    ]);

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

    // Reviews — pending
    const reviewCount = [...reviews, ...agentActions].filter((p) =>
      isOpenStatus(((p.frontmatter ?? {}) as Record<string, unknown>).status)
    ).length;
    if (reviewCount > 0) {
      badges["/dashboard/review-queue"] = { count: reviewCount, variant: "warning" };
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

    // Review Inbox — unreviewed items from client submissions + case frontmatter
    let reviewInboxCount = 0;
    for (const p of submissions) {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const rs = String(fm.review_status ?? "");
      if (rs !== "reviewed" && rs !== "imported") reviewInboxCount++;
    }
    for (const p of casePages) {
      const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
      const sds = Array.isArray(fm.suggested_deadlines)
        ? (fm.suggested_deadlines as Array<Record<string, unknown>>)
        : [];
      for (const sd of sds) {
        if (!sd.confirmed && sd.review_status !== "approved" && sd.review_status !== "rejected")
          reviewInboxCount++;
      }
      const parties = Array.isArray(fm.suggested_parties)
        ? (fm.suggested_parties as Array<Record<string, unknown>>)
        : [];
      for (const party of parties) {
        if (
          !party.confirmed &&
          party.review_status !== "approved" &&
          party.review_status !== "rejected"
        )
          reviewInboxCount++;
      }
      const facts = Array.isArray(fm.facts) ? (fm.facts as Array<Record<string, unknown>>) : [];
      for (const fact of facts) {
        const rs = String(fact.review_status ?? "pending");
        if (rs === "pending") reviewInboxCount++;
      }
    }
    if (reviewInboxCount > 0) {
      badges["/dashboard/communications"] = { count: reviewInboxCount, variant: "warning" };
    }

    // Import-Queue — offene Einträge die noch nicht in die Such-DB importiert wurden.
    // warning weil es keine kritische Aktion ist, aber der Admin dran denken muss.
    const importQueueCount = offeneEintraege().length;
    if (importQueueCount > 0) {
      badges["/dashboard/admin/corpus"] = { count: importQueueCount, variant: "warning" };
    }

    return apiSuccess(badges);
  }
);
