import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { feedbackSummary, saveAnswerFeedback } from "@/lib/answer-feedback";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  message_id: z.string().min(1).max(120),
  rating: z.enum(["up", "down"]),
  reason: z.enum(["wrong", "missing_source", "incomplete", "other"]).optional(),
  comment: z.string().max(1_000).optional(),
  question: z.string().max(2_000).default(""),
  answer: z.string().max(20_000),
  citations: z.array(z.string().max(300)).max(50).default([]),
  case_slug: z.string().max(300).optional(),
  model: z.string().max(100).optional(),
});

const querySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/** Rate a Copilot answer (lib/answer-feedback.ts); a new rating replaces the old one. */
export const POST = createHandler(
  { action: "copilot.tool", rateTier: "standard", body: postSchema },
  async (ctx, body) => {
    await saveAnswerFeedback({
      brainId: ctx.brainId,
      userId: ctx.user.id,
      messageId: body.message_id,
      rating: body.rating,
      reason: body.rating === "down" ? body.reason : undefined,
      comment: body.rating === "down" ? body.comment : undefined,
      question: body.question,
      answerExcerpt: body.answer.slice(0, 4_000),
      citations: body.citations,
      caseSlug: body.case_slug,
      model: body.model,
      createdAt: new Date().toISOString(),
    });
    return apiSuccess({ ok: true });
  }
);

/** How the firm rated Copilot answers — admins only. */
export const GET = createHandler(
  { action: "settings.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    if (ctx.user.role !== "admin") return apiError("forbidden", "Nur für Administratoren", 403);
    return apiSuccess(await feedbackSummary(ctx.brainId, query?.days ?? 30));
  }
);
