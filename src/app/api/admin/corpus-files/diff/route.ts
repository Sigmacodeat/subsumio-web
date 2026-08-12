import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { diffVersions, diffWithCurrent } from "@/lib/corpus-steward";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  path: z.string().min(3).max(500),
  v1: z.coerce.number().int().optional(),
  v2: z.coerce.number().int().optional(),
});

/**
 * GET /api/admin/corpus-files/diff?path=...&v1=1&v2=2
 *
 * Diff zwischen zwei Versionen.
 * Ohne v2: Diff zwischen v1 und aktueller Datei.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const { path, v1, v2 } = query;

    if (v1 === undefined) {
      return apiError("validation_failed", "v1 is required", 400);
    }

    let diff;
    if (v2 !== undefined) {
      diff = diffVersions(path, v1, v2);
    } else {
      // Diff with current
      diff = diffWithCurrent(path, v1);
    }

    return apiSuccess({
      path,
      v1,
      v2: v2 ?? "current",
      diff,
      stats: {
        added: diff.filter((d) => d.type === "added").length,
        removed: diff.filter((d) => d.type === "removed").length,
        unchanged: diff.filter((d) => d.type === "unchanged").length,
      },
    });
  },
);
