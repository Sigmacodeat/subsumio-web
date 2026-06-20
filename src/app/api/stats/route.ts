import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 60,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/stats`, { headers: ctx.headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json(data);
    } catch (err) {
      console.error("[stats] engine unreachable:", err instanceof Error ? err.message : String(err));
      return Response.json(
        { total_pages: 0, total_entities: 0, total_queries: 0, total_edges: 0 },
        { status: 200 },
      );
    }
  },
);
