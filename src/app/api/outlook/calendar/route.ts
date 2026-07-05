import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { syncCalendar, isMsGraphConfigured } from "@/lib/msgraph";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const calendarQuerySchema = z.object({
  since: z.string().optional(),
  maxResults: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = createHandler(
  {
    action: "connector.read",
    rateTier: "standard",
    query: calendarQuerySchema,
  },
  async (_ctx, _body, query) => {
    if (!isMsGraphConfigured()) {
      return apiError(
        "msgraph_not_configured",
        "Microsoft 365 ist nicht konfiguriert. Erforderlich: MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_TENANT_ID",
        400
      );
    }

    const since = query?.since;
    const maxResults = query?.maxResults;

    try {
      const result = await syncCalendar({ since, maxResults });
      return apiSuccess(result);
    } catch (e) {
      return apiError(
        "calendar_sync_failed",
        e instanceof Error ? e.message : "Kalender-Sync fehlgeschlagen",
        502
      );
    }
  }
);
