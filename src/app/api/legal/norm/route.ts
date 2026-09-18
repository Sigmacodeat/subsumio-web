import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { readNorm } from "@/lib/legal-grounding";
import { userJurisdiction } from "@/lib/citation-gate-client";

export const maxDuration = 10;

const querySchema = z.object({
  code: z.string().min(1).max(80),
  paragraph: z.string().min(1).max(40),
  jurisdiction: z.enum(["at", "de", "ch"]).optional(),
});

/** Full text of one cited norm for the reader panel next to an AI answer. */
export const GET = createHandler(
  {
    action: "legal.research",
    rateTier: "standard",
    query: querySchema,
    cacheMaxAge: 3600,
  },
  async (ctx, _body, query) => {
    const norm = await readNorm(
      query.code,
      query.paragraph,
      query.jurisdiction ?? userJurisdiction(ctx.user.jurisdiction)
    );
    if (!norm) {
      return Response.json({ error: "unknown_statute" }, { status: 404 });
    }
    return Response.json(norm);
  }
);
