import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getAuditLog } from "@/lib/corpus-steward";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  path: z.string().optional(),
});

/**
 * GET /api/admin/corpus-files/audit?limit=50&path=...
 *
 * Gibt den Audit-Log zurück (wer hat was wann geändert).
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const entries = getAuditLog(query.limit, query.path);
    return apiSuccess({
      entries,
      count: entries.length,
    });
  },
);
