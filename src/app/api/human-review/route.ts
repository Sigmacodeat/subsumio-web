
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { z } from "zod";
import {
  submitFeedback,
  loadFeedback,
  summarizeFeedback,
  type ReviewVerdict,
} from "@/lib/human-review";
import type { EvalCategory } from "@/lib/rag-eval";

const reviewSchema = z.object({
  source_endpoint: z.string().min(1),
  query: z.string().min(1).max(2_000),
  answer_excerpt: z.string().max(2000),
  verdict: z.enum(["correct", "incorrect", "incomplete"]) as z.ZodType<ReviewVerdict>,
  comment: z.string().max(2000).optional(),
  flagged_citations: z.array(z.string()).optional(),
  suggested_correction: z.string().max(5000).optional(),
  category: z.enum([
    "statute",
    "case_law",
    "procedure",
    "general",
    "contract_clause",
    "memo",
    "bulk_review",
  ]) as z.ZodType<EvalCategory>,
  jurisdiction: z.enum(["DE", "AT", "CH"]).optional(),
});

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
    body: reviewSchema,
  },
  async (ctx, body, _query, _req) => {
    try {
      const entry = await submitFeedback(ENGINE_URL, ctx.headers, {
        source_endpoint: body.source_endpoint,
        query: body.query,
        answer_excerpt: body.answer_excerpt,
        verdict: body.verdict,
        comment: body.comment,
        flagged_citations: body.flagged_citations,
        suggested_correction: body.suggested_correction,
        category: body.category,
        jurisdiction: body.jurisdiction,
        reviewer_id: ctx.user.id,
      });

      return apiSuccess(entry, undefined, 201);
    } catch (err) {
      return apiError(
        "review_submit_failed",
        err instanceof Error ? err.message : "review_submit_failed",
        500,
      );
    }
  },
);

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const feedback = await loadFeedback(ENGINE_URL, ctx.headers);
      const summary = summarizeFeedback(feedback);

      return apiSuccess(summary);
    } catch (err) {
      return apiError(
        "review_load_failed",
        err instanceof Error ? err.message : "review_load_failed",
        500,
      );
    }
  },
);
