import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { logger } from "@/lib/logger";
import { SOURCE_LABELS, type CorpusOverview, type CorpusSourceStats } from "@/lib/corpus-labels";
import { readLatestInventory, type InventoryRow } from "@/lib/corpus-inventory";

const log = logger("api/admin/corpus-overview");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/corpus-overview
 *
 * The inventory of the Austrian law corpus as it stands in the database (the
 * single source of truth): per source pages, statutes, Rechtssätze vs.
 * decision texts, repealed provisions, chunks and embedding coverage — from
 * the latest hourly snapshot (/api/cron/corpus-inventory) — plus the latest
 * RIS reconciliation and the last 30 days of ingest activity.
 */
export const GET = createHandler({ action: "platform.operator" }, async () => {
  const pool = getSharedPgPool();
  if (!pool) return apiError("service_unavailable", "Datenbank nicht erreichbar", 503);
  try {
    const [inventory, recon, byDay, quality] = await Promise.all([
      readLatestInventory(pool).catch(() => [] as InventoryRow[]),
      pool
        .query(
          `
        SELECT DISTINCT ON (source_id) source_id, measured_at, method, ris_total, db_total, missing, extra, note
        FROM corpus_reconciliation
        ORDER BY source_id, measured_at DESC`
        )
        .catch(() => ({ rows: [] })),
      pool
        .query(
          `
        SELECT to_char(occurred_at AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD') AS day,
               count(*) FILTER (WHERE action = 'added')::int AS added,
               count(*) FILTER (WHERE action = 'updated')::int AS updated
        FROM corpus_ingest_log
        WHERE occurred_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`
        )
        .catch(() => ({ rows: [] })),
      // Written by the pipeline's plausibility audit; absent before its first run.
      pool
        .query(
          `
        SELECT source_id, plausible_pages, implausible_pages, issue_breakdown, unembedded_ok_pages,
               raw_files, normalized_files, last_plausibility_check
        FROM corpus_status`
        )
        .catch(() => ({ rows: [] })),
    ]);

    const reconBySource = new Map(recon.rows.map((r) => [r.source_id, r]));
    const qualityBySource = new Map(quality.rows.map((r) => [r.source_id, r]));
    const sources: CorpusSourceStats[] = inventory
      .map((r) => {
        const rc = reconBySource.get(r.source_id);
        const q = qualityBySource.get(r.source_id);
        return {
          sourceId: r.source_id,
          label: SOURCE_LABELS[r.source_id] ?? r.source_id,
          kind: r.kind,
          pages: r.pages,
          statutes: r.statutes,
          rechtssaetze: r.rechtssaetze,
          entscheidungstexte: r.texte,
          repealed: r.repealed,
          chunks: r.chunks,
          embedded: r.embedded,
          lastUpdated: r.last_updated,
          quality:
            q && q.plausible_pages !== null
              ? {
                  checkedAt: q.last_plausibility_check
                    ? new Date(q.last_plausibility_check).toISOString()
                    : null,
                  plausible: q.plausible_pages,
                  implausible: q.implausible_pages ?? 0,
                  issues: (q.issue_breakdown ?? {}) as Record<string, number>,
                  rawFiles: q.raw_files,
                  normalizedFiles: q.normalized_files,
                  unembeddedOk: q.unembedded_ok_pages ?? 0,
                }
              : null,
          reconciliation: rc
            ? {
                measuredAt: new Date(rc.measured_at).toISOString(),
                method: rc.method,
                risTotal: rc.ris_total,
                dbTotal: rc.db_total,
                missing: rc.missing,
                extra: rc.extra,
                note: rc.note,
              }
            : null,
        } satisfies CorpusSourceStats;
      })
      .sort((a, b) => b.pages - a.pages);

    const sum = (
      f: (s: CorpusSourceStats) => number,
      pred: (s: CorpusSourceStats) => boolean = () => true
    ) => sources.filter(pred).reduce((n, s) => n + f(s), 0);
    const overview: CorpusOverview = {
      sources,
      totals: {
        statutes: sum(
          (s) => s.statutes,
          (s) => s.kind === "statute"
        ),
        norms: sum(
          (s) => s.pages,
          (s) => s.kind === "statute"
        ),
        decisions: sum(
          (s) => s.pages,
          (s) => s.kind === "decision"
        ),
        rechtssaetze: sum((s) => s.rechtssaetze),
        entscheidungstexte: sum((s) => s.entscheidungstexte),
        pages: sum((s) => s.pages),
        chunks: sum((s) => s.chunks),
        embedded: sum((s) => s.embedded),
      },
      ingestByDay: byDay.rows,
      // Time of the inventory snapshot the numbers come from (hourly cron).
      // `inventory` is DISTINCT ON (source_id) ordered by source_id, so
      // inventory[0] was always the alphabetically-first source's snapshot
      // time, not the freshest one — a source that failed its last cron run
      // while others succeeded showed a falsely-recent generatedAt (or vice
      // versa). Take the actual newest snapshot across all sources.
      generatedAt:
        inventory.length > 0
          ? inventory.reduce(
              (latest, r) =>
                !latest || (r.measured_at ?? "") > latest ? (r.measured_at ?? latest) : latest,
              null as string | null
            )
          : null,
    };
    return apiSuccess(overview);
  } catch (err) {
    log.error("[corpus-overview] query failed:", (err as Error).message);
    return apiError("corpus_overview_failed", "Bestand konnte nicht geladen werden", 500);
  }
});
