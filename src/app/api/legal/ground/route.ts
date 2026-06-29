import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { groundAnswerCitations } from "@/lib/citation-gate";

export const maxDuration = 10;

const bodySchema = z.object({
  text: z.string().min(10).max(50000),
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
  async (_ctx, body) => {
    const grounding = await groundAnswerCitations(body.text);
    return Response.json(grounding);
  }
);
