import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  submitFeedback,
  getFeedbackStats,
  getFeedbackForOrg,
  validateFeedback,
  type FeedbackType,
  type FeedbackSeverity,
} from "@/lib/retrieval-feedback";

export const maxDuration = 10;

const submitSchema = z.object({
  query: z.string().min(1),
  result_slug: z.string().min(1),
  result_title: z.string().optional().default(""),
  feedback_type: z.enum(["relevant", "irrelevant", "outdated", "wrong"]),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  comment: z.string().optional(),
  search_mode: z.string().optional(),
  rank_position: z.number().optional(),
  result_score: z.number().optional(),
});

/**
 * POST /api/legal/retrieval-feedback
 * Submit feedback on a search/retrieval result.
 */
export const POST = createHandler(
  {
    action: "legal.retrieval_feedback",
    rateTier: "standard",
    body: submitSchema,
  },
  async (ctx, body) => {
    const user = ctx.user;
    if (!user) return apiError("unauthorized", "Authentication required", 401);

    const orgId = user.orgId;
    const brainId = user.brainId;

    const feedbackInput = {
      query: body.query,
      result_slug: body.result_slug,
      result_title: body.result_title ?? "",
      feedback_type: body.feedback_type as FeedbackType,
      severity: body.severity as FeedbackSeverity,
      comment: body.comment,
      user_id: user.id ?? "anonymous",
      brain_id: brainId ?? "default",
      org_id: orgId ?? "default",
      search_mode: body.search_mode,
      rank_position: body.rank_position,
      result_score: body.result_score,
    };

    const validation = validateFeedback(feedbackInput);
    if (!validation.valid) {
      return apiError("validation_error", validation.errors.join("; "), 400);
    }

    const entry = submitFeedback(feedbackInput);

    return Response.json({ id: entry.id, created_at: entry.created_at }, { status: 201 });
  }
);

/**
 * GET /api/legal/retrieval-feedback
 * Get feedback stats for the current user's org.
 */
export const GET = createHandler(
  {
    action: "legal.retrieval_feedback",
    rateTier: "standard",
  },
  async (ctx) => {
    const user = ctx.user;
    if (!user) return apiError("unauthorized", "Authentication required", 401);

    const orgId = user.orgId;
    const orgFeedback = getFeedbackForOrg(orgId ?? "default");
    const stats = getFeedbackStats(orgFeedback);

    return Response.json({
      stats,
      total: orgFeedback.length,
    });
  }
);
