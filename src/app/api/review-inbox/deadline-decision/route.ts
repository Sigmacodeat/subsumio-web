import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { decideSuggestedDeadline } from "@/lib/legal/deadline-decision";
import { withKeyedLock } from "@/lib/keyed-lock";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  case_slug: z.string().min(1).max(300),
  index: z.number().int().min(0).max(10_000),
  action: z.enum(["approve", "reject"]),
  due_date: z.string().max(10).optional(),
  title: z.string().max(300).optional(),
});

/**
 * Approve or discard an AI-suggested deadline. The single server-side path
 * from a suggestion to the Fristenbuch — see src/lib/legal/deadline-decision.ts.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action:
        body.action === "approve" ? ("deadline.create" as const) : ("deadline.update" as const),
      entityType: "suggested_deadline",
      entityId: `${body.case_slug}#${body.index}`,
      details: { action: body.action, due_date: body.due_date ?? null },
    }),
  },
  async (ctx, body) => {
    // Serialise decisions per case: the suggestion list is rewritten as a
    // whole, so two concurrent approvals must not overwrite each other.
    const result = await withKeyedLock(`deadline-decision:${ctx.brainId}:${body.case_slug}`, () =>
      decideSuggestedDeadline(ctx.headers, {
        caseSlug: body.case_slug,
        index: body.index,
        action: body.action,
        dueDate: body.due_date,
        title: body.title,
        reviewer: ctx.user.email,
      })
    );
    if (!result.ok) return apiError(result.code, result.message, result.status);
    return apiSuccess({
      deadline_slug: result.deadlineSlug,
      already_decided: result.alreadyDecided,
    });
  }
);
