import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getCorpusIndex } from "@/lib/corpus-index";
import { getFlagsBulk } from "@/lib/corpus-steward";
import { basename } from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  corpus: z.string().min(1).max(100),
  n: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * GET /api/admin/corpus-files/sample?corpus=at-judikatur-vwgh&n=10
 *
 * Zufallsstichprobe aus Memory-Index (kein glob+stat).
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const { corpus, n } = query;

    if (
      !corpus.startsWith("at-") &&
      !corpus.startsWith("de") &&
      !corpus.startsWith("ch") &&
      !corpus.startsWith("eu") &&
      corpus !== "at"
    ) {
      return apiError("validation_failed", "Invalid corpus name", 400);
    }

    const entries = getCorpusIndex(corpus);
    if (entries.length === 0) {
      return apiSuccess({ corpus, sample: [], total: 0 });
    }

    // Fisher-Yates shuffle (n swaps only, not full shuffle)
    const indices = Array.from({ length: entries.length }, (_, i) => i);
    for (let i = 0; i < n && i < entries.length; i++) {
      const j = i + Math.floor(Math.random() * (entries.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const picked = indices.slice(0, Math.min(n, entries.length));

    const relPaths = picked.map((i) => entries[i].path);
    const flags = getFlagsBulk(relPaths);

    const sample = picked.map((i) => {
      const e = entries[i];
      const flag = flags[e.path];
      return {
        path: e.path,
        name: basename(e.path),
        size: e.size,
        modified: new Date(e.mtime * 1000).toISOString(),
        flag: flag?.flag ?? null,
      };
    });

    return apiSuccess({
      corpus,
      total: entries.length,
      sample,
    });
  }
);
