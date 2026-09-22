import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  getConnectorByEngineService,
  WEB_SELF_SERVICE_CONNECTOR_IDS,
} from "@/lib/connector-coverage";

import { logger } from "@/lib/logger";
const log = logger("api/connectors/[service]/configure");

export const dynamic = "force-dynamic";

const folderConfigSchema = z.object({
  watch_dir: z.string().min(1).max(1_024),
  poll_interval_ms: z.number().int().min(30_000).max(3_600_000).optional(),
  default_case_slug: z.string().min(1).max(240).optional(),
});

export const POST = createHandler(
  {
    action: "connector.write",
    rateTier: "standard",
    body: folderConfigSchema,
    audit: (ctx, body, _query, req) => {
      const service = req ? new URL(req.url).pathname.split("/")[3] : undefined;
      return {
        action: "connector.configure" as const,
        entityType: "connector",
        entityId: service,
        details: {
          service,
          watch_dir: body.watch_dir,
          poll_interval_ms: body.poll_interval_ms,
          by: ctx.user.email,
          default_case_slug: body.default_case_slug,
        },
      };
    },
  },
  async (ctx, body, _query, req) => {
    const { service } = await (req as unknown as { params: Promise<{ service: string }> }).params;
    if (!(WEB_SELF_SERVICE_CONNECTOR_IDS as readonly string[]).includes(service)) {
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
          body: JSON.stringify({
            ...body,
            // The browser cannot select an organisation or user id. The
            // authenticated dashboard context supplies both server-side.
            responsible_user_id: ctx.user.id,
            owner_id: ctx.billing.ownerId,
            owner_type: ctx.billing.ownerType,
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        return Response.json(result, { status: upstream.status });
      }
      return Response.json(result);
    } catch (error) {
      log.error(
        "[connector/configure] failed:",
        error instanceof Error ? error.message : String(error)
      );
      return apiError("service_unavailable", "Connector-Konfiguration fehlgeschlagen", 503);
    }
  }
);
