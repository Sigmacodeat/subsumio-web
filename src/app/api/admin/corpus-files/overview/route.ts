import { createHandler, apiSuccess } from "@/lib/api-handler";
import { listCorpusNames, getCorpusIndex } from "@/lib/corpus-index";
import { getFlagsBulk } from "@/lib/corpus-steward";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

interface CorpusSummary {
  name: string;
  fileCount: number;
  totalSizeMB: number;
  flaggedVerified: number;
  flaggedNeedsReview: number;
  flaggedDefective: number;
  flaggedArchived: number;
  unreviewed: number;
  oldestFile: string | null;
  newestFile: string | null;
}

/**
 * GET /api/admin/corpus-files/overview
 *
 * Listet alle Korpora mit Dateizahl, Größe und Flag-Verteilung.
 * Nutzt Memory-Cache aus corpus-index.ts (kein glob+stat).
 */
export const GET = createHandler(
  {
    action: "admin.*",
  },
  async () => {
    const corpora = listCorpusNames();
    const summaries: CorpusSummary[] = [];

    for (const name of corpora) {
      const entries = getCorpusIndex(name);
      if (entries.length === 0) continue;

      const relPaths = entries.map((e) => e.path);
      const flags = getFlagsBulk(relPaths);

      let totalSize = 0;
      let flaggedVerified = 0;
      let flaggedNeedsReview = 0;
      let flaggedDefective = 0;
      let flaggedArchived = 0;
      let unreviewed = 0;
      let oldest: number | null = null;
      let newest: number | null = null;

      for (const e of entries) {
        totalSize += e.size;
        if (oldest === null || e.mtime < oldest) oldest = e.mtime;
        if (newest === null || e.mtime > newest) newest = e.mtime;
      }

      for (const p of relPaths) {
        const flag = flags[p]?.flag ?? "unreviewed";
        if (flag === "verified") flaggedVerified++;
        else if (flag === "needs_review") flaggedNeedsReview++;
        else if (flag === "defective") flaggedDefective++;
        else if (flag === "archived") flaggedArchived++;
        else unreviewed++;
      }

      summaries.push({
        name,
        fileCount: entries.length,
        totalSizeMB: Math.round((totalSize / 1024 / 1024) * 10) / 10,
        flaggedVerified,
        flaggedNeedsReview,
        flaggedDefective,
        flaggedArchived,
        unreviewed,
        oldestFile: oldest ? new Date(oldest * 1000).toISOString() : null,
        newestFile: newest ? new Date(newest * 1000).toISOString() : null,
      });
    }

    const totalFiles = summaries.reduce((s, c) => s + c.fileCount, 0);
    const totalSizeMB = summaries.reduce((s, c) => s + c.totalSizeMB, 0);
    const totalVerified = summaries.reduce((s, c) => s + c.flaggedVerified, 0);
    const totalNeedsReview = summaries.reduce((s, c) => s + c.flaggedNeedsReview, 0);
    const totalDefective = summaries.reduce((s, c) => s + c.flaggedDefective, 0);
    const totalArchived = summaries.reduce((s, c) => s + c.flaggedArchived, 0);
    const totalUnreviewed = summaries.reduce((s, c) => s + c.unreviewed, 0);

    return apiSuccess({
      corpora: summaries,
      totals: {
        corporaCount: summaries.length,
        totalFiles,
        totalSizeMB,
        totalVerified,
        totalNeedsReview,
        totalDefective,
        totalArchived,
        totalUnreviewed,
      },
    });
  },
);
