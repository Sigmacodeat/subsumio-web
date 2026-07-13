import { createHandler, apiError } from "@/lib/api-handler";
import { getLatestReceipt, listReceiptsForProduct } from "@/lib/work-product-receipt-store";
import { receiptStatusSummary } from "@/lib/work-product-receipts";
import type { WorkProductType } from "@/lib/work-product-receipts";
import { z } from "zod";

const querySchema = z.object({
  product_type: z.enum([
    "draft",
    "memo",
    "fristenreport",
    "vertragsreview",
    "redline",
    "schriftsatz",
  ]),
  product_ref: z.string().min(1),
  brain_id: z.string().min(1),
  full: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "legal.receipt",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const { product_type, product_ref, brain_id, full } = query;

    if (brain_id !== ctx.brainId) {
      return apiError("forbidden", "brain_id does not match authenticated context", 403);
    }

    if (full === "1") {
      const receipts = await listReceiptsForProduct(
        product_type as WorkProductType,
        product_ref,
        brain_id
      );
      return Response.json({
        receipts,
        summaries: receipts.map(receiptStatusSummary),
      });
    }

    const receipt = await getLatestReceipt(product_type as WorkProductType, product_ref, brain_id);

    if (!receipt) {
      return apiError("not_found", "No receipt found for this work product", 404);
    }

    return Response.json({
      receipt,
      summary: receiptStatusSummary(receipt),
    });
  }
);
