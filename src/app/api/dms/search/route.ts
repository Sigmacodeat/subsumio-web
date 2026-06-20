
import { z } from "zod";
import { getConnector } from "@/lib/dms";
import { createHandler, apiError } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

const dmsSearchSchema = z.object({
  q: z.string().default(""),
  limit: z.string().optional(),
  folderId: z.string().optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: dmsSearchSchema,
  },
  async (_ctx, _body, query, _req) => {
    const connector = await getConnector();
    if (!connector || !connector.isConfigured()) {
      return apiError("dms_not_configured", "DMS nicht konfiguriert", 503);
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    try {
      const results = await connector.search(query.q, { limit, folderId: query.folderId });
      return Response.json(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[dms search] error:", msg);
      return apiError("search_failed", msg, 500);
    }
  },
);
