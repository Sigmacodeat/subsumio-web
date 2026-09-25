import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { createServerBrainClient } from "@/lib/server-brain";
import {
  submitFeedback,
  getFeedbackStats,
  getFeedbackForOrg,
  validateFeedback,
  FEEDBACK_LIST_MAX,
  type FeedbackType,
  type FeedbackSeverity,
} from "@/lib/retrieval-feedback";

import { logger } from "@/lib/logger";
const log = logger("api/legal/retrieval-feedback");

export const maxDuration = 10;

const submitSchema = z.object({
  query: z.string().min(1).max(500),
  result_slug: z.string().min(1).max(500),
  result_title: z.string().max(500).optional().default(""),
  feedback_type: z.enum(["relevant", "irrelevant", "outdated", "wrong"]),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  comment: z.string().max(2000).optional(),
  search_mode: z.string().max(100).optional(),
  rank_position: z.number().int().min(0).optional(),
  result_score: z.number().optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(FEEDBACK_LIST_MAX).optional(),
});

/**
 * POST /api/legal/retrieval-feedback
 * Submit feedback on a search/retrieval result. Persisted as a
 * `retrieval_feedback` engine page under the caller's own brain — the
 * identity-bearing ctx.headers keep it inside the firm's source.
 */
export const POST = createHandler(
  {
    action: "legal.retrieval_feedback",
    rateTier: "standard",
    body: submitSchema,
    audit: (_ctx, body) => ({
      action: "legal.retrieval_feedback" as const,
      entityType: "retrieval_feedback",
      details: {
        result_slug: body.result_slug,
        feedback_type: body.feedback_type,
        severity: body.severity,
        search_mode: body.search_mode,
        rank_position: body.rank_position,
        result_score: body.result_score,
        has_comment: Boolean(body.comment),
      },
    }),
  },
  async (ctx, body) => {
    const user = ctx.user;
    if (!user) return apiError("unauthorized", "Authentifizierung erforderlich", 401);

    const feedbackInput = {
      query: body.query,
      result_slug: body.result_slug,
      result_title: body.result_title ?? "",
      feedback_type: body.feedback_type as FeedbackType,
      severity: body.severity as FeedbackSeverity,
      comment: body.comment,
      user_id: user.id ?? "anonymous",
      // ctx.brainId is the EFFECTIVE brain (org brain for team members) and
      // the source ctx.headers scopes the write to — both must agree, or the
      // entry lands in one brain while claiming another's id.
      brain_id: ctx.brainId ?? user.brainId ?? "default",
      org_id: user.orgId ?? "default",
      search_mode: body.search_mode,
      rank_position: body.rank_position,
      result_score: body.result_score,
    };

    const validation = validateFeedback(feedbackInput);
    if (!validation.valid) {
      return apiError("validation_error", validation.errors.join("; "), 400);
    }

    const brain = createServerBrainClient(ctx.headers);
    try {
      const entry = await submitFeedback(brain, feedbackInput);
      return Response.json({ id: entry.id, created_at: entry.created_at }, { status: 201 });
    } catch (err) {
      log.error(
        "[retrieval-feedback] submit failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "feedback_save_failed",
        "Feedback konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        502
      );
    }
  }
);

/**
 * GET /api/legal/retrieval-feedback
 * Feedback stats for the current user's org. `?limit=` caps how many
 * feedback pages are read (default/all: up to FEEDBACK_LIST_MAX).
 */
export const GET = createHandler(
  {
    action: "legal.retrieval_feedback",
    rateTier: "standard",
    query: listQuerySchema,
  },
  async (ctx, _body, query) => {
    const user = ctx.user;
    if (!user) return apiError("unauthorized", "Authentifizierung erforderlich", 401);

    const brain = createServerBrainClient(ctx.headers);
    try {
      const orgFeedback = await getFeedbackForOrg(brain, user.orgId ?? "default", {
        limit: query.limit,
      });
      const stats = getFeedbackStats(orgFeedback);

      return Response.json({
        stats,
        total: orgFeedback.length,
      });
    } catch (err) {
      log.error(
        "[retrieval-feedback] stats failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "feedback_load_failed",
        "Feedback-Statistiken konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
        502
      );
    }
  }
);
