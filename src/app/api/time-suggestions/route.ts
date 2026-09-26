import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { createServerBrainClient } from "@/lib/server-brain";
import { listAllPagesOfType } from "@/lib/time-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/time-suggestions");

export const dynamic = "force-dynamic";

/**
 * GET /api/time-suggestions
 *
 * Lists `time_suggestion` pages for the signed-in user only. The dashboard
 * used to pull the firm-wide list via /api/pages and filter client-side —
 * which shipped every colleague's activity descriptions in the payload.
 * Suggestions are personal, so the filter belongs on the server.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      const myEmail = ctx.user.email.toLowerCase();
      // Cursor-paginated: listPages stops silently at the 100-row engine cap.
      // A failed read answers 500 — never an empty "keine Vorschläge" list.
      const pages = await listAllPagesOfType(brain, "time_suggestion", 10_000);
      const suggestions = (Array.isArray(pages) ? pages : [])
        .map((p) => (p as { frontmatter?: Record<string, unknown> }).frontmatter)
        .filter(
          (fm): fm is Record<string, unknown> =>
            fm !== null &&
            fm !== undefined &&
            typeof fm === "object" &&
            String(fm.user_email ?? "").toLowerCase() === myEmail &&
            fm.status !== "tombstoned"
        );
      return apiSuccess({ suggestions });
    } catch (err) {
      log.error(
        "[time-suggestions] list failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Zeitvorschläge konnten nicht geladen werden", 500);
    }
  }
);
