import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getKnowledgeSources } from "@/lib/legal/knowledge-sources";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 300,
  },
  async () => {
    const ks = getKnowledgeSources();
    return Response.json({ sources: ks.getAvailableSources() });
  }
);

const postSchema = z.object({
  action: z.enum(["search_laws", "search_cases", "get_paragraph"]),
  query: z.string().optional(),
  paragraph: z.string().optional(),
  law: z.string().optional(),
  court: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: postSchema,
  },
  async (_ctx, body) => {
    const ks = getKnowledgeSources();

    if (body.action === "search_laws") {
      if (!body.query) return Response.json({ error: "query is required" }, { status: 400 });
      const results = await ks.searchLaws(body.query, body.paragraph);
      return Response.json({ results, count: results.length });
    }

    if (body.action === "search_cases") {
      if (!body.query) return Response.json({ error: "query is required" }, { status: 400 });
      const results = await ks.searchCases(body.query, body.court);
      return Response.json({ results, count: results.length });
    }

    if (body.action === "get_paragraph") {
      if (!body.law || !body.paragraph) {
        return Response.json({ error: "law and paragraph are required" }, { status: 400 });
      }
      const result = await ks.getParagraph(body.law, body.paragraph);
      return Response.json({ result });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  }
);
