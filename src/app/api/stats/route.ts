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
      const res = await fetch(`${ENGINE_URL}/api/stats`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // engine_reachable: true marks this as a real reading, distinguishing
      // "brain is genuinely empty" from "brain is unreachable" below — both
      // shapes return total_pages: 0 otherwise, which the UI cannot tell apart.
      return Response.json({ ...data, engine_reachable: true });
    } catch (err) {
      console.error(
        "[stats] engine unreachable:",
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
