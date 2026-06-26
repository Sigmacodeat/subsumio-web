import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/stats`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json({ ...data, engine_reachable: true });
    } catch (err) {
      console.error(
        "[brain/stats] engine unreachable:",
        err instanceof Error ? err.message : String(err)
      );
      return Response.json(
        {
          total_pages: 0,
          total_entities: 0,
          total_queries: 0,
          total_edges: 0,
          engine_reachable: false,
        },
        { status: 200 }
      );
    }
  }
);
