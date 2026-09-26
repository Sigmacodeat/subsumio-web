import { groundRequestSchema } from "@/lib/ground-request";
import { createHandler } from "@/lib/api-handler";
import { groundAnswerCitations } from "@/lib/citation-gate";
import { userJurisdiction } from "@/lib/citation-gate-client";

// Long drafts are checked too (see ground-request.ts); bounded by citations.
export const maxDuration = 30;

const bodySchema = groundRequestSchema;

export const POST = createHandler(
  {
    action: "legal.ground",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "query.submit",
      entityType: "citation_check",
      details: { textLength: body.text.length },
    }),
  },
  async (ctx, body) => {
    // Explicit > markers in the answer > the user's own jurisdiction > server default.
    const grounding = await groundAnswerCitations(body.text, {
      jurisdiction: body.jurisdiction,
      fallbackJurisdiction: userJurisdiction(ctx.user.jurisdiction),
    });
    return Response.json(grounding);
  }
);
