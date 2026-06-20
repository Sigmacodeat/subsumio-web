
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "connector.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const upstream = await fetch(`${ENGINE_URL}/api/connectors`, { headers: ctx.headers });
      if (!upstream.ok) {
        return Response.json({ error: `Engine returned ${upstream.status}`, connectors: [] }, { status: upstream.status });
      }
      return Response.json(await upstream.json());
    } catch (err) {
      console.error("[connectors] list failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }
  },
);
