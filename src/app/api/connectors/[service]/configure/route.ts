import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { getConnectorByEngineService } from "@/lib/connector-coverage";

export const dynamic = "force-dynamic";

const folderConfigSchema = z.object({
  watch_dir: z.string().min(1).max(1_024),
  poll_interval_ms: z.number().int().min(30_000).max(3_600_000).optional(),
});

export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "standard",
    body: folderConfigSchema,
    audit: (ctx) => ({
      action: "connector.add" as const,
      entityType: "connector",
      details: { by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, req) => {
    const { service } = await (req as unknown as { params: Promise<{ service: string }> }).params;
    if (!["advokat-import", "bea-import"].includes(service)) {
      return apiError("invalid_service", "Nur lokale Ordner-Connectoren sind hier erlaubt", 400);
    }
    if (!getConnectorByEngineService(service)) {
      return apiError("invalid_service", "Unbekannter Connector-Service", 400);
    }
    try {
      const upstream = await fetch(
        `${ENGINE_URL}/api/connectors/${encodeURIComponent(service)}/configure`,
        {
          method: "POST",
          headers: { ...ctx.headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        }
      );
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return Response.json(result, { status: upstream.status });
      }
      return Response.json(result);
    } catch (error) {
      console.error(
        "[connector/configure] failed:",
        error instanceof Error ? error.message : String(error)
      );
      return apiError("service_unavailable", "Connector-Konfiguration fehlgeschlagen", 503);
    }
  }
);
