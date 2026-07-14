/**
 * Memo Generate API — Full product path:
 *   Generate → Create WorkProduct → Submit for Review
 *
 * POST /api/work-products/memo/generate
 */

import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createAndStoreWorkProduct,
  transitionWorkProductStatus,
  attachReceiptToWorkProduct,
} from "@/lib/work-product-store";
import { createAndStoreReceipt } from "@/lib/work-product-receipt-store";

const generateSchema = z.object({
  question: z.string().min(1).max(2_000),
  facts: z.string().min(1).max(10_000),
  jurisdiction: z.enum(["at", "de", "ch"]),
  case_slug: z.string().min(1),
  legal_area: z.string().max(100).optional(),
  language: z.enum(["de", "en"]).default("de"),
  depth: z.enum(["brief", "standard", "comprehensive"]).default("standard"),
  title: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "legal.memo",
    rateTier: "heavy",
    quota: "queries",
    body: generateSchema,
    audit: (_ctx, body) => ({
      action: "legal.memo",
      entityType: "work_product",
      details: {
        type: "memo",
        case_slug: body.case_slug,
        jurisdiction: body.jurisdiction,
        depth: body.depth,
      },
    }),
  },
  async (ctx, body) => {
    // 1. Generate memo content via engine
    const engineRes = await fetch(`${ENGINE_URL}/api/legal/memo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...ctx.headers,
      },
      body: JSON.stringify({
        question: body.question,
        facts: body.facts,
        jurisdiction: body.jurisdiction,
        legal_area: body.legal_area || undefined,
        case_slug: body.case_slug,
        language: body.language,
        depth: body.depth,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!engineRes.ok) {
      const errText = await engineRes.text().catch(() => "Engine error");
      return apiError("engine_error", `Memo generation failed: ${errText}`, 502);
    }

    const engineData = (await engineRes.json()) as {
      memo_markdown?: string;
      text?: string;
      content?: string;
      answer?: string;
      receipt?: Record<string, unknown>;
      _grounding?: unknown;
    };

    const memoContent =
      engineData.memo_markdown ?? engineData.text ?? engineData.content ?? engineData.answer ?? "";
    if (!memoContent) {
      return apiError("empty_output", "Memo generation returned empty content", 502);
    }

    // 2. Create WorkProduct
    const title = body.title ?? `Memo — ${body.case_slug}`;
    const wp = await createAndStoreWorkProduct({
      product_type: "memo",
      case_slug: body.case_slug,
      title,
      content: memoContent,
      brain_id: ctx.brainId,
      user_id: ctx.user.id,
      jurisdiction: body.jurisdiction,
      metadata: {
        depth: body.depth,
        legal_area: body.legal_area,
        language: body.language,
        engine_receipt: engineData.receipt ?? null,
        verification_status: "claim_evidence_required",
      },
    });

    // 3. Build and persist receipt if engine returned one. Do not attach the
    // case-level graph: it does not prove claims in this newly generated memo.
    if (engineData.receipt) {
      try {
        const receipt = await createAndStoreReceipt({
          product_type: "memo",
          product_ref: wp.id,
          output: memoContent,
          brain_id: ctx.brainId,
          user_id: ctx.user.id,
          jurisdiction: body.jurisdiction,
          checks: (engineData.receipt.checks as never[]) ?? [],
          flags: (engineData.receipt.flags as string[]) ?? [],
          models: (engineData.receipt.models as string[]) ?? [],
          source_snapshot_hashes: (engineData.receipt.source_snapshot_hashes as string[]) ?? [],
          metadata: { work_product_id: wp.id, case_slug: body.case_slug },
        });
        await attachReceiptToWorkProduct(wp.id, ctx.brainId, receipt.receipt_id);
      } catch (receiptErr) {
        // Receipt failure is non-fatal — the memo is still created
        console.warn(
          `[memo-generate] Receipt creation failed: ${receiptErr instanceof Error ? receiptErr.message : String(receiptErr)}`
        );
      }
    }

    // 4. Auto-submit for review. Approval remains blocked until a graph whose
    // output_id equals this work-product id and a matching receipt exist.
    const submitted = await transitionWorkProductStatus(wp.id, ctx.brainId, "in_review");

    return apiSuccess(submitted, undefined, 201);
  }
);
