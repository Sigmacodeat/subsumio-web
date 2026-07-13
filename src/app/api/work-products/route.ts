/**
 * Work Product API — List & Create
 *
 * GET  /api/work-products?case_slug=...&status=...&product_type=...
 * POST /api/work-products
 */

import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { listWorkProducts, createAndStoreWorkProduct } from "@/lib/work-product-store";

export const GET = createHandler(
  {
    action: "legal.memo",
    rateTier: "standard",
  },
  async (ctx, _body, req) => {
    const url = new URL(req.url);
    const caseSlug = url.searchParams.get("case_slug") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const productType = url.searchParams.get("product_type") ?? undefined;
    const limit = url.searchParams.get("limit")
      ? parseInt(url.searchParams.get("limit")!, 10)
      : undefined;

    const products = await listWorkProducts(ctx.brainId, {
      caseSlug,
      status: status as never,
      productType,
      limit,
    });

    return apiSuccess(products);
  }
);

const createSchema = z.object({
  product_type: z.enum([
    "memo",
    "draft",
    "fristenreport",
    "vertragsreview",
    "redline",
    "schriftsatz",
  ]),
  case_slug: z.string().min(1),
  title: z.string().min(1),
  content: z.string().optional(),
  jurisdiction: z.string().optional(),
  claim_evidence_slug: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const POST = createHandler(
  {
    action: "legal.memo",
    rateTier: "heavy",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "legal.memo",
      entityType: "work_product",
      details: { type: body.product_type, case_slug: body.case_slug, title: body.title },
    }),
  },
  async (ctx, body, _req) => {
    const wp = await createAndStoreWorkProduct({
      product_type: body.product_type,
      case_slug: body.case_slug,
      title: body.title,
      content: body.content,
      brain_id: ctx.brainId,
      user_id: ctx.user.id,
      jurisdiction: body.jurisdiction,
      claim_evidence_slug: body.claim_evidence_slug,
      metadata: body.metadata,
    });

    return apiSuccess(wp, undefined, 201);
  }
);
