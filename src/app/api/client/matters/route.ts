import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { listClientMatters, readClientMatter } from "@/lib/client-view";
import { buildPortalCaseView } from "@/lib/portal-view";

export const dynamic = "force-dynamic";

const querySchema = z.object({ slug: z.string().min(1).max(300).optional() });

/**
 * The client account's matters — the same whitelisted view as the token
 * portal (released summary, released documents, reviewed deadlines, client
 * alerts). Never the raw matter page.
 */
export const GET = createHandler(
  { action: "client.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    const viewer = { brainId: ctx.brainId, user: ctx.user };
    try {
      if (query?.slug) {
        const found = await readClientMatter(viewer, query.slug);
        if (!found) return apiError("not_found", "Akte nicht gefunden", 404);
        return apiSuccess({ matter: buildPortalCaseView(found.page) });
      }
      const pages = await listClientMatters(viewer);
      return apiSuccess({ matters: pages.map(buildPortalCaseView) });
    } catch {
      return apiError("engine_error", "Akten konnten nicht geladen werden", 502);
    }
  }
);
