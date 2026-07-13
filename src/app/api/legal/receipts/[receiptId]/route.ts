import { createHandler, apiError } from "@/lib/api-handler";
import { getReceipt } from "@/lib/work-product-receipt-store";
import { receiptStatusSummary } from "@/lib/work-product-receipts";

export const GET = createHandler(
  {
    action: "legal.receipt",
    rateTier: "standard",
  },
  async (ctx, _body, query) => {
    const receiptId = query.receiptId as string | undefined;
    if (!receiptId) {
      return apiError("bad_request", "receiptId required", 400);
    }

    const receipt = await getReceipt(receiptId, ctx.brainId);
    if (!receipt) {
      return apiError("not_found", "Receipt not found", 404);
    }

    return Response.json({
      receipt,
      summary: receiptStatusSummary(receipt),
    });
  }
);
