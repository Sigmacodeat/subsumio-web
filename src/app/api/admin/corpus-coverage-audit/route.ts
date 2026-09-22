import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import { LEGAL_SOURCE_COVERAGE_MATRIX } from "@/lib/legal-source-coverage";
import { auditCoverage, type SourceDbStats } from "@/lib/corpus-completeness-audit";

const log = logger("api/admin/corpus-coverage-audit");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/corpus-coverage-audit?jurisdiction=DE
 *
 * WP-6.38: Vollständigkeits-Audit — gleicht die deklarierte
 * Abdeckungsmatrix mit dem tatsächlichen DB-Bestand ab. Erkennt
 * leere „available"-Quellen, unerwartete Daten in „planned"/„gap"-
 * Quellen und unvollständige Embedding-Coverage.
 */
export const GET = createHandler(
  {
    action: "platform.operator",
    query: z.object({
      jurisdiction: z.enum(["DE", "AT", "CH", "EU", "all"]).default("all"),
    }),
  },
  async (_ctx, _body, query) => {
    const pool = getSharedPgPool();
    if (!pool) return apiError("service_unavailable", "Datenbank nicht erreichbar", 503);
    try {
      const result = await pool.query(`
        SELECT p.source_id,
               count(*)::int AS pages,
               count(cc.id)::int AS chunks,
               count(cc.id) FILTER (WHERE cc.embedding IS NOT NULL)::int AS embedded,
               max(p.updated_at) AS last_updated
        FROM pages p
        LEFT JOIN content_chunks cc ON cc.page_id = p.id
        WHERE p.deleted_at IS NULL AND p.source_id LIKE 'law-%'
        GROUP BY p.source_id
      `);
      const dbStats = new Map<string, SourceDbStats>(
        result.rows.map((r) => [
          r.source_id as string,
          {
            source_id: r.source_id as string,
            pages: r.pages as number,
            chunks: r.chunks as number,
            embedded: r.embedded as number,
            last_updated: r.last_updated ? new Date(r.last_updated as string).toISOString() : null,
          },
        ])
      );

      const audit = auditCoverage(
        LEGAL_SOURCE_COVERAGE_MATRIX,
        dbStats,
        query?.jurisdiction === "all" ? "all" : query?.jurisdiction
      );
      return apiSuccess(audit);
    } catch (err) {
      log.error("[corpus-coverage-audit] query failed:", (err as Error).message);
      return apiError("coverage_audit_failed", "Audit konnte nicht durchgeführt werden", 500);
    }
  }
);
