import { z } from "zod";
import { getConnectorForBrain } from "@/lib/dms";
import { createHandler, apiError } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
const log = logger("api/dms/search");

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const dmsSearchSchema = z.object({
  q: z.string().max(500).default(""),
  limit: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10) || 20, 100))
    .optional(),
  folderId: z.string().optional(),
});

export const GET = createHandler(
  {
    // Staff only: client_viewer accounts never reach the firm's DMS.
    action: "agent.read",
    rateTier: "standard",
    query: dmsSearchSchema,
  },
  async (ctx, _body, query, _req) => {
    const connector = await getConnectorForBrain(ctx.brainId);
    if (!connector || !connector.isConfigured()) {
      return apiError("dms_not_configured", "DMS nicht konfiguriert", 503);
    }

    const limit = typeof query.limit === "string" ? parseInt(query.limit, 10) : (query.limit ?? 20);
    try {
      const results = await connector.search(query.q, { limit, folderId: query.folderId });
      return Response.json(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("[dms search] error:", msg);
      return apiError("search_failed", "Suche fehlgeschlagen", 500);
    }
  }
);
