import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { safeCorpusPath, parseDoc, getFlag } from "@/lib/corpus-steward";
import { readFileSync } from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  path: z.string().min(1).max(500),
});

/**
 * GET /api/admin/corpus-files/read?path=at-judikatur-vwgh/2024-01-15-xxx.md
 *
 * Liest eine einzelne Datei (Frontmatter + Body).
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const absPath = safeCorpusPath(query.path);
    if (!absPath) {
      return apiError("validation_failed", "Invalid path", 400);
    }

    try {
      const raw = readFileSync(absPath, "utf-8");
      const parsed = parseDoc(raw);
      const flag = getFlag(query.path);

      return apiSuccess({
        path: query.path,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        raw,
        flag: flag?.flag ?? null,
        flagNote: flag?.note ?? null,
        size: raw.length,
      });
    } catch {
      return apiError("not_found", "File not found", 404);
    }
  },
);
