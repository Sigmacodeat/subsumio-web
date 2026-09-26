import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { decideSuggestedCaseField } from "@/lib/legal/case-suggestion-decision";
import { withKeyedLock } from "@/lib/keyed-lock";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  case_slug: z.string().min(1).max(300),
  index: z.number().int().min(0).max(10_000),
  action: z.enum(["approve", "reject"]),
  value: z.union([z.string().max(200), z.number()]).optional(),
});

/**
 * Accept or discard an AI suggestion for court, Geschäftszahl or Streitwert.
 * Only an accepted suggestion changes the matter's field.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "suggested_case_field",
      entityId: `${body.case_slug}#${body.index}`,
      details: { action: body.action },
    }),
  },
  async (ctx, body) => {
    const result = await withKeyedLock(`case-suggestion:${ctx.brainId}:${body.case_slug}`, () =>
      decideSuggestedCaseField(ctx.headers, {
        caseSlug: body.case_slug,
        index: body.index,
        action: body.action,
        value: body.value,
        reviewer: ctx.user.email,
      })
    );
    if (!result.ok) return apiError(result.code, result.message, result.status);
    return apiSuccess({ applied: result.applied, already_decided: result.alreadyDecided });
  }
);
