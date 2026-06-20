import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  submitFeedback,
  getFeedbackStats,
  getFeedbackForOrg,
  getFeedbackBoosts,
  exportForEval,
  validateFeedback,
  type FeedbackType,
  type FeedbackSeverity,
} from "@/lib/retrieval-feedback";

const feedbackSchema = z.object({
  query: z.string().min(1, "query_required"),
  result_slug: z.string().min(1, "result_slug_required"),
  result_title: z.string().default(""),
  feedback_type: z.enum(["relevant", "irrelevant", "outdated", "wrong"]),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  comment: z.string().optional(),
  search_mode: z.string().optional(),
  rank_position: z.number().optional(),
  result_score: z.number().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: feedbackSchema,
    audit: (ctx, body) => ({
      action: "feedback.submit" as const,
      entityType: "retrieval_feedback",
      details: {
        feedback_type: body.feedback_type,
        result_slug: body.result_slug,
        severity: body.severity,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const feedbackInput = {
      query: body.query,
      result_slug: body.result_slug,
      result_title: body.result_title,
      feedback_type: body.feedback_type as FeedbackType,
      severity: body.severity as FeedbackSeverity,
      comment: body.comment,
      user_id: ctx.user.id,
      brain_id: ctx.brainId,
      org_id: ctx.user.orgId || "",
      search_mode: body.search_mode,
      rank_position: body.rank_position,
      result_score: body.result_score,
    };

    const validation = validateFeedback(feedbackInput);
    if (!validation.valid) {
      return apiError("validation_error", validation.errors.join("; "), 400);
    }

    const entry = submitFeedback(feedbackInput);
    return apiSuccess({ id: entry.id, created_at: entry.created_at });
  },
);

const feedbackQuerySchema = z.object({
  action: z.enum(["stats", "boosts", "export"]).default("stats"),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: feedbackQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    const orgFeedback = getFeedbackForOrg(ctx.user.orgId || "");

    switch (query.action) {
      case "stats": {
        const stats = getFeedbackStats(orgFeedback);
        return apiSuccess(stats);
      }

      case "boosts": {
        const boosts = getFeedbackBoosts(orgFeedback);
        return apiSuccess({ boosts, total: boosts.length });
      }

      case "export": {
        const exported = exportForEval(orgFeedback);
        return apiSuccess({ entries: exported, total: exported.length });
      }

      default:
        return apiError("validation_error", "Unknown action", 400);
    }
  },
);
