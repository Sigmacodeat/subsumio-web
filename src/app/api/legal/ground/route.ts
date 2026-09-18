import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { groundAnswerCitations } from "@/lib/citation-gate";
import { userJurisdiction } from "@/lib/citation-gate-client";

export const maxDuration = 10;

const bodySchema = z.object({
  text: z.string().min(10).max(50000),
  /** Jurisdiction of the answer; inferred from the text when omitted. */
  jurisdiction: z.enum(["at", "de", "ch"]).optional(),
});

export const POST = createHandler(
  {
    action: "legal.research",
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
