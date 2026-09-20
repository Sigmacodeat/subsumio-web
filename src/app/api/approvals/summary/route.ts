import { createHandler, apiSuccess } from "@/lib/api-handler";
import { loadApprovalSummary } from "@/lib/approval-summary";

export const dynamic = "force-dynamic";

/** GET /api/approvals/summary — everything waiting for the lawyer's decision, by category. */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx) => apiSuccess(await loadApprovalSummary(ctx.headers, ctx.user.email))
);
