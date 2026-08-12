import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const actionSchema = z.object({
  action: z.enum(["reembed", "flag_defective", "flag_needs_review", "flag_verified", "clear_flag"]),
  chunkIds: z.array(z.string().min(1).max(100)).min(1).max(500),
});

/**
 * POST /api/admin/chunk-inspector/action
 *
 * Bulk-Aktionen auf Chunks:
 * - reembed: Setzt embedding auf NULL (Pipeline re-embeddet automatisch)
 * - flag_defective / flag_needs_review / flag_verified: Markiert Chunk-Qualität
 * - clear_flag: Entfernt Qualitäts-Markierung
 */
export const POST = createHandler(
  {
    action: "admin.*",
    body: actionSchema,
    rateTier: "heavy",
    audit: (_ctx, body) => ({
      action: "admin.corpus_pipeline" as const,
      entityType: "content_chunk",
      details: { chunkAction: body.action, chunkIds: body.chunkIds, count: body.chunkIds.length },
    }),
  },
  async (_ctx, body) => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Datenbank nicht verfügbar", 503);
    }

    const { action, chunkIds } = body;
    const placeholders = chunkIds.map((_, i) => `$${i + 1}`).join(",");
    const params = chunkIds;

    try {
      let affected = 0;

      if (action === "reembed") {
        const result = await pool.query(
          `UPDATE content_chunks SET embedding = NULL, embedded_at = NULL, updated_at = NOW()
           WHERE id IN (${placeholders})`,
          params
        );
        affected = result.rowCount ?? 0;
      } else if (action === "flag_defective" || action === "flag_needs_review" || action === "flag_verified") {
        const flagValue = action.replace("flag_", "");
        // quality_flag als JSONB-Spalte (falls vorhanden), sonst im frontmatter
        try {
          const result = await pool.query(
            `UPDATE content_chunks SET quality_flag = $${chunkIds.length + 1}, updated_at = NOW()
             WHERE id IN (${placeholders})`,
            [...params, flagValue]
          );
          affected = result.rowCount ?? 0;
        } catch {
          // quality_flag-Spalte existiert nicht → versuche metadata
          const result = await pool.query(
            `UPDATE content_chunks SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('quality_flag', $${chunkIds.length + 1}::text), updated_at = NOW()
             WHERE id IN (${placeholders})`,
            [...params, flagValue]
          );
          affected = result.rowCount ?? 0;
        }
      } else if (action === "clear_flag") {
        try {
          const result = await pool.query(
            `UPDATE content_chunks SET quality_flag = NULL, updated_at = NOW()
             WHERE id IN (${placeholders})`,
            params
          );
          affected = result.rowCount ?? 0;
        } catch {
          const result = await pool.query(
            `UPDATE content_chunks SET metadata = COALESCE(metadata, '{}'::jsonb) - 'quality_flag', updated_at = NOW()
             WHERE id IN (${placeholders})`,
            params
          );
          affected = result.rowCount ?? 0;
        }
      }

      return apiSuccess({ action, affected, requested: chunkIds.length });
    } catch (err) {
      console.error("[chunk-inspector/action] failed:", (err as Error).message);
      return apiError("internal_error", "Aktion fehlgeschlagen", 500);
    }
  }
);
