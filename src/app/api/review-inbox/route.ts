import { createHandler, apiSuccess } from "@/lib/api-handler";
import { loadReviewInboxItems } from "@/lib/review-inbox-items";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx) => {
    const items = await loadReviewInboxItems(ctx.headers);
    return apiSuccess({ items, total: items.length });
  }
);
