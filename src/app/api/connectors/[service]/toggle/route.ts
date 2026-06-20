
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "standard",
    audit: (_ctx, _body, _query) => ({
      action: "connector.add" as const,
      entityType: "connector",
    }),
  },
  async (ctx, _body, _query, req) => {
    const { service } = await ((req as unknown as { params: Promise<{ service: string }> }).params);
    try {
      const res = await fetch(`${ENGINE_URL}/api/connectors/${encodeURIComponent(service)}/toggle`, {
        method: "POST",
        headers: ctx.headers,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[connector/toggle] engine error:", res.status, text);
        return apiError("service_unavailable", "Toggle fehlgeschlagen", 503);
      }
      const result = await res.json();
      return Response.json(result);
    } catch (err) {
      console.error("[connector/toggle] failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Toggle fehlgeschlagen", 503);
    }
  },
);
