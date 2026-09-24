import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getSharedPgPool } from "@/lib/auth/store";
import { readLatestQuality, type QualitySnapshot } from "@/lib/corpus-quality";
import { logger } from "@/lib/logger";

const log = logger("api/admin/chunk-quality");

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface QualityData extends QualitySnapshot {
  /** When the numbers were counted (the 10-minute cron), null before the first run. */
  snapshotAt: string | null;
  /** False when no snapshot could be read — the tab shows an empty state, not zeros. */
  dbAvailable: boolean;
  /** Kept for older clients; equals snapshotAt when available. */
  generatedAt: string;
}

const EMPTY: QualitySnapshot = {
  totalChunks: 0,
  embeddedChunks: 0,
  embeddingCoveragePct: 0,
  avgLength: 0,
  roleDistribution: [],
  lengthHistogram: [],
  perSource: [],
  sampledChunks: 0,
};

/**
 * GET /api/admin/chunk-quality
 *
 * Chunk-quality statistics for the quality tab on /ops/corpus, read from the
 * 10-minute snapshot (corpus_quality_snapshot, one row) — never aggregated
 * live: the previous version ran three full-corpus queries per request and
 * was refetched every 5 s while embedding ran.
 */
export const GET = createHandler(
  {
    action: "platform.operator",
    cacheMaxAge: 30,
  },
  async () => {
    const pool = getSharedPgPool();
    if (!pool) {
      return apiError("service_unavailable", "Datenbank nicht verfügbar", 503);
    }
    try {
      const latest = await readLatestQuality(pool);
      if (!latest) {
        return apiSuccess<QualityData>({
          ...EMPTY,
          snapshotAt: null,
          dbAvailable: false,
          generatedAt: new Date().toISOString(),
        });
      }
      return apiSuccess<QualityData>({
        ...EMPTY,
        ...latest.snapshot,
        snapshotAt: latest.measured_at,
        dbAvailable: true,
        generatedAt: latest.measured_at,
      });
    } catch (err) {
      log.error("[chunk-quality] snapshot read failed:", (err as Error).message);
      return apiSuccess<QualityData>({
        ...EMPTY,
        snapshotAt: null,
        dbAvailable: false,
        generatedAt: new Date().toISOString(),
      });
    }
  }
);
