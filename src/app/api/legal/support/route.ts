import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { groundAnswerCitations } from "@/lib/citation-gate";
import { userJurisdiction } from "@/lib/citation-gate-client";
import { checkSupport } from "@/lib/support-check";

export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().min(10).max(50000),
  jurisdiction: z.enum(["at", "de", "ch"]).optional(),
});

/**
 * Second grounding stage: does each verified source carry the statement it is
 * cited for? Only the answer text is accepted — citations and source texts are
 * re-derived here from our own corpus, never taken from the client.
 */
export const POST = createHandler(
  {
    action: "legal.research",
    rateTier: "heavy",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "query.submit",
      entityType: "citation_support_check",
      details: { textLength: body.text.length },
    }),
  },
  async (ctx, body) => {
    const grounding = await groundAnswerCitations(body.text, {
      jurisdiction: body.jurisdiction,
      fallbackJurisdiction: userJurisdiction(ctx.user.jurisdiction),
    });
    const results = await checkSupport(ctx.headers, body.text, grounding.grounded_citations);
    return Response.json({ results, checked_at: new Date().toISOString() });
  }
);
