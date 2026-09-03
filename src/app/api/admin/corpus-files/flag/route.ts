import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { setFlagsBulk, setFlag, type QualityFlag } from "@/lib/corpus-steward";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const bodySchema = z.object({
  path: z.string().optional(),
  paths: z.array(z.string()).optional(),
  flag: z.enum(["verified", "needs_review", "defective", "unreviewed", "archived"]),
  note: z.string().optional(),
});

/**
 * POST /api/admin/corpus-files/flag
 *
 * Setzt einen Quality-Flag für eine oder mehrere Dateien.
 * - path: einzelne Datei
 * - paths: Bulk (mehrere Dateien)
 */
export const POST = createHandler(
  {
    action: "admin.*",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "corpus_files.flag" as const,
      entityType: "corpus_file",
      details: {
        flag: body.flag,
        path: body.path ?? null,
        pathsCount: body.paths?.length ?? null,
        user: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    const flag = body.flag as QualityFlag;

    // Bulk
    if (body.paths && body.paths.length > 0) {
      if (body.paths.length > 500) {
        return apiError("validation_failed", "Max 500 files per bulk flag", 400);
      }
      const count = setFlagsBulk(body.paths, flag, ctx.user.email);
      return apiSuccess({ flagged: count, flag });
    }

    // Single
    if (body.path) {
      const entry = setFlag(body.path, flag, body.note, ctx.user.email);
      return apiSuccess({
        path: body.path,
        flag: entry.flag,
        flaggedBy: entry.flaggedBy,
        flaggedAt: entry.flaggedAt,
      });
    }

    return apiError("validation_failed", "Either 'path' or 'paths' is required", 400);
  }
);
