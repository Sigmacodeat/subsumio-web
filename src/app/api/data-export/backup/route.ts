
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "admin.*",
    rateTier: "heavy",
  },
  async (ctx, _body, _query, _req) => {
    try {
      const allPages: Array<Record<string, unknown>> = [];
      let page = 0;
      const perPage = 100;
      let hasMore = true;

      while (hasMore && page < 50) {
        const res = await fetch(`${ENGINE_URL}/api/pages?limit=${perPage}&offset=${page * perPage}`, {
          headers: ctx.headers,
        });
        if (!res.ok) break;
        const pages = (await res.json()) as Array<Record<string, unknown>>;
        if (pages.length === 0) {
          hasMore = false;
        } else {
          allPages.push(...pages);
          page++;
        }
      }

      const exportData = {
        export_metadata: {
          type: "full_backup",
          generated_at: new Date().toISOString(),
          user_id: ctx.user.id,
          user_email: ctx.user.email,
          total_pages: allPages.length,
          format: "JSON",
          description: "Complete backup of all Brain-Pages for migration or compliance archiving",
        },
        data: allPages,
      };

      return Response.json(exportData);
    } catch (err) {
      return apiError("backup_failed", err instanceof Error ? err.message : "backup_failed", 500);
    }
  },
);
