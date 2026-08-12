import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getVersions, getVersion } from "@/lib/corpus-steward";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const querySchema = z.object({
  path: z.string().min(3).max(500),
  version: z.coerce.number().int().optional(),
});

/**
 * GET /api/admin/corpus-files/versions?path=...&version=N
 *
 * Ohne version: listet alle Versionen.
 * Mit version: gibt den Inhalt einer spezifischen Version zurück.
 */
export const GET = createHandler(
  {
    action: "admin.*",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const { path, version } = query;

    if (version !== undefined) {
      // Get specific version
      const detail = getVersion(path, version);
      if (!detail) return apiError("not_found", "Version not found", 404);
      return apiSuccess(detail);
    }

    // List all versions
    const versions = getVersions(path);
    return apiSuccess({ path, versions });
  },
);
