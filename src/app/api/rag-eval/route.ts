
import { ENGINE_URL } from "@/lib/engine";
import { runEval } from "@/lib/rag-eval";
import { createHandler, apiError } from "@/lib/api-handler";

export const POST = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const summary = await runEval(async (query) => {
        try {
          const res = await fetch(`${ENGINE_URL}/api/search?q=${encodeURIComponent(query)}&limit=10`, {
            headers: ctx.headers,
          });
          if (!res.ok) return [];
          const data = (await res.json()) as { results?: Array<{ slug: string }> };
          return (data.results || []).map((r) => r.slug);
        } catch {
          return [];
        }
      });

      return Response.json(summary);
    } catch (err) {
      return apiError("eval_failed", err instanceof Error ? err.message : "eval_failed", 500);
    }
  },
);
