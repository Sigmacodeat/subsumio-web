
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { getConnectorByEngineService } from "@/lib/connector-coverage";

export const dynamic = "force-dynamic";

export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "heavy",
    audit: (ctx) => ({
      action: "connector.sync" as const,
      entityType: "connector",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { service } = await ((req as unknown as { params: Promise<{ service: string }> }).params);
    if (!getConnectorByEngineService(service)) {
      return apiError("invalid_service", "Unbekannter Connector-Service", 400);
    }
    try {
      const res = await fetch(`${ENGINE_URL}/api/connectors/${encodeURIComponent(service)}/sync`, {
        method: "POST",
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[connector/sync] engine error:", res.status, text);
        return apiError("service_unavailable", "Sync fehlgeschlagen", 503);
      }
      const result = await res.json();
      return Response.json(result);
    } catch (err) {
      console.error("[connector/sync] failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Sync fehlgeschlagen", 503);
    }
  },
);
