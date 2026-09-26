import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import { computeLawCoverage, type DbLawAgg, type DbLawDoc } from "@/lib/law-coverage";
import {
  LAW_SOURCE_CFG,
  loadFetchOutcomes,
  loadLawFetchState,
  loadRisIndex,
} from "@/lib/law-coverage-server";
import { fetchGiiTocCached } from "@/lib/de-statute-coverage";

const log = logger("api/admin/corpus-law-coverage");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/corpus-law-coverage?source=law-at-normen
 *
 * §-genauer Soll-Ist-Abgleich je Gesetz: der RIS-In-force-Index
 * (`law-corpus/_state/ris-inforce*.jsonl`, geschrieben von
 * ris-inforce-crawl*.ts) liefert das Soll — welche Norm-Dokumente
 * RIS derzeit als gültig listet —, die DB liefert das Ist. Pro Gesetz:
 * Soll, Ist, fehlende Paragraphen (Dokument-IDs + §-Label) und
 * Embedding-Coverage.
 *
 * Quellen ohne RIS-Index (law-de) liefern den reinen DB-Stand je Gesetz
 * mit status "db-only" — es wird kein Upstream-Soll erfunden.
 */

const RESPONSE_TTL_MS = 60_000;
const responseCache = new Map<string, { at: number; payload: Record<string, unknown> }>();

export const GET = createHandler(
  {
    action: "platform.operator",
    query: z.object({
      source: z.enum(["law-at-normen", "law-at-landesrecht", "law-de"]),
    }),
  },
  async (_ctx, _body, query) => {
    const source = query!.source;
    const pool = getSharedPgPool();
    if (!pool) return apiError("service_unavailable", "Datenbank nicht erreichbar", 503);

    // Der Nachlade-Stand ist billig und ändert sich minütlich — er läuft am
    // 60-s-Cache der schweren Abgleichs-Abfrage vorbei.
    const fetchState = () =>
      source === "law-at-normen" ? loadLawFetchState(pool) : Promise.resolve(null);

    const cached = responseCache.get(source);
    if (cached && Date.now() - cached.at < RESPONSE_TTL_MS) {
      return apiSuccess({ ...cached.payload, fetch: await fetchState() });
    }

    const cfg = LAW_SOURCE_CFG[source];
    try {
      const indexResult = cfg.indexFile ? await loadRisIndex(cfg.indexFile) : null;
      const indexAvailable = cfg.indexFile ? indexResult !== null : null;
      const outcomes = cfg.corpus ? await loadFetchOutcomes(cfg.corpus) : null;

      const [aggResult, docResult] = await Promise.all([
        pool.query(
          `SELECT ${cfg.keyExpr} AS key,
                  count(DISTINCT p.id)::int AS pages,
                  count(cc.id)::int AS chunks,
                  count(cc.id) FILTER (WHERE cc.embedding IS NOT NULL)::int AS embedded,
                  max(p.frontmatter->>'abbr') AS abbr,
                  max(p.frontmatter->>'short_title') AS title
             FROM pages p
             LEFT JOIN content_chunks cc ON cc.page_id = p.id
            WHERE p.source_id = $1 AND p.deleted_at IS NULL
            GROUP BY 1`,
          [source]
        ),
        pool.query(
          `SELECT ${cfg.keyExpr} AS key, ${cfg.docExpr} AS doc
             FROM pages p
            WHERE p.source_id = $1 AND p.deleted_at IS NULL AND ${cfg.docExpr} IS NOT NULL`,
          [source]
        ),
      ]);

      const aggs: DbLawAgg[] = aggResult.rows.map((r) => ({
        key: String(r.key),
        pages: Number(r.pages),
        chunks: Number(r.chunks),
        embedded: Number(r.embedded),
        abbr: (r.abbr as string | null) ?? null,
        title: (r.title as string | null) ?? null,
      }));
      const docs: DbLawDoc[] = docResult.rows.map((r) => ({
        key: String(r.key),
        doc: (r.doc as string | null) ?? null,
      }));

      const { rows, totals } = computeLawCoverage(indexResult?.entries ?? null, docs, aggs, outcomes);

      // DE: kurze Slugs ("bgb") als Key — amtliche Langtitel aus dem
      // gii-TOC nachreichen (24-h-Cache, fail-open).
      if (cfg.titleLookup === "gii") {
        try {
          const toc = await fetchGiiTocCached();
          const bySlug = new Map(toc.map((l) => [l.slug, l.title]));
          for (const r of rows) {
            const t = bySlug.get(r.key);
            if (t && !r.title) r.title = t;
          }
        } catch (err) {
          log.warn("[corpus-law-coverage] gii-toc unavailable:", (err as Error).message);
        }
      }

      const payload = {
        source,
        generated_at: new Date().toISOString(),
        index: {
          /** null = diese Quelle hat grundsätzlich kein Upstream-Soll. */
          available: indexAvailable,
          file: cfg.indexFile,
          measured_at: indexResult?.mtime ?? null,
          laws: indexResult ? indexResult.entries.size : null,
          docs: indexResult
            ? [...indexResult.entries.values()].reduce((a, e) => a + e.docs.size, 0)
            : null,
        },
        totals,
        laws: rows,
      };
      responseCache.set(source, { at: Date.now(), payload });
      return apiSuccess({ ...payload, fetch: await fetchState() });
    } catch (err) {
      log.error("[corpus-law-coverage] query failed:", (err as Error).message);
      return apiError("law_coverage_failed", "Gesetzes-Abgleich fehlgeschlagen", 500);
    }
  }
);
