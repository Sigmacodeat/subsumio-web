import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { decideSuggestedParty } from "@/lib/legal/case-suggestion-decision";
import { withKeyedLock } from "@/lib/keyed-lock";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  case_slug: z.string().min(1).max(300),
  index: z.number().int().min(0).max(10_000),
  action: z.enum(["approve", "reject"]),
  role: z
    .enum(["mandant", "gegner", "gegnervertreter", "vertreter", "gericht", "behoerde", "sonstige"])
    .optional(),
  contact_slug: z.string().min(1).max(300).optional(),
  conflict_waiver_reason: z.string().max(2000).optional(),
});

/**
 * Accept or discard an AI party suggestion of a matter. Accepting links or
 * creates the contact, runs the conflict check (Mandant/Gegner) and places
 * the party into the matter — see src/lib/legal/case-suggestion-decision.ts.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "suggested_party",
      entityId: `${body.case_slug}#${body.index}`,
      details: {
        action: body.action,
        role: body.role ?? null,
        waiver: Boolean(body.conflict_waiver_reason?.trim()),
      },
    }),
  },
  async (ctx, body) => {
    // One decision per matter at a time: the suggestion list and the
    // party fields are rewritten as a whole.
    const result = await withKeyedLock(`case-suggestion:${ctx.brainId}:${body.case_slug}`, () =>
      decideSuggestedParty(ctx.headers, {
        caseSlug: body.case_slug,
        index: body.index,
        action: body.action,
        role: body.role,
        contactSlug: body.contact_slug,
        conflictWaiverReason: body.conflict_waiver_reason,
        reviewer: ctx.user.email,
        reviewerId: ctx.user.id,
        reviewerRole: ctx.user.role,
      })
    );
    if (!result.ok) {
      return apiError(
        result.code,
        result.message,
        result.status,
        result.conflictWarning ? { conflictWarning: result.conflictWarning } : undefined
      );
    }
    return apiSuccess({
      contact_slug: result.contactSlug ?? null,
      applied: result.applied,
      already_decided: result.alreadyDecided,
    });
  }
);
