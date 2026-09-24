import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import { LEGAL_SOURCE_COVERAGE_MATRIX } from "@/lib/legal-source-coverage";
import { auditCoverage, type SourceDbStats } from "@/lib/corpus-completeness-audit";
import { latestSnapshotAt, readLatestInventory } from "@/lib/corpus-inventory";
import {
  auditDeStatutes,
  fetchGiiTocCached,
  pageSlugToGiiSlug,
  type DeStatuteCoverage,
} from "@/lib/de-statute-coverage";
import { DE_LAW_TARGETS } from "@/lib/de-law-targets";

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
      // From the 10-minute snapshot (3 ms), not a live pages×chunks join —
      // that join took 17 s here on every open of the Bestand tab
      // (measured 2026-09-24). Same numbers, same source as every other
      // panel on the page; `snapshotAt` says how old they are.
      const inventory = await readLatestInventory(pool);
      const snapshotAt = latestSnapshotAt(inventory);
      const dbStats = new Map<string, SourceDbStats>(
        inventory.map((r) => [
          r.source_id,
          {
            source_id: r.source_id,
            pages: r.pages,
            chunks: r.chunks,
            embedded: r.embedded,
            last_updated: r.last_updated,
          },
        ])
      );

      const audit = auditCoverage(
        LEGAL_SOURCE_COVERAGE_MATRIX,
        dbStats,
        query?.jurisdiction === "all" ? "all" : query?.jurisdiction
      );

      // WP-6.38: Soll-Ist je Gesetz — das amtliche gii-TOC (Soll) gegen die
      // in law-de importierten Gesetzes-Pages (Ist). Best-effort: ist
      // gesetze-im-internet.de nicht erreichbar, bleibt das Feld null und
      // die Quellen-Matrix-Antwort kommt trotzdem.
      let deStatutes: (DeStatuteCoverage & { unavailable?: boolean }) | null = null;
      if (query?.jurisdiction === "all" || query?.jurisdiction === "DE") {
        try {
          const [upstream, pages] = await Promise.all([
            fetchGiiTocCached(),
            pool.query(
              `SELECT slug, frontmatter->>'source_url' AS source_url
               FROM pages
               WHERE deleted_at IS NULL AND source_id = 'law-de'`
            ),
          ]);
          const present = new Set<string>();
          for (const p of pages.rows as Array<{ slug: string; source_url: string | null }>) {
            const slug = pageSlugToGiiSlug({
              slug: p.slug,
              frontmatter: { source_url: p.source_url },
            });
            if (slug) present.add(slug);
          }
          deStatutes = auditDeStatutes(
            upstream,
            present,
            DE_LAW_TARGETS.map((l) => l.slug)
          );
        } catch (err) {
          log.warn("[corpus-coverage-audit] gii-toc unavailable:", (err as Error).message);
          deStatutes = { unavailable: true } as DeStatuteCoverage & { unavailable: boolean };
        }
      }

      return apiSuccess({ ...audit, de_statutes: deStatutes, snapshot_at: snapshotAt });
    } catch (err) {
      log.error("[corpus-coverage-audit] query failed:", (err as Error).message);
      return apiError("coverage_audit_failed", "Audit konnte nicht durchgeführt werden", 500);
    }
  }
);
