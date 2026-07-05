import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { syncMail, isMsGraphConfigured } from "@/lib/msgraph";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const mailQuerySchema = z.object({
  deltaLink: z.string().optional(),
  maxResults: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = createHandler(
  {
    action: "connector.read",
    rateTier: "standard",
    query: mailQuerySchema,
  },
  async (_ctx, _body, query) => {
    if (!isMsGraphConfigured()) {
      return apiError("msgraph_not_configured", "Microsoft 365 ist nicht konfiguriert.", 400);
    }

    const deltaLink = query?.deltaLink;
    const maxResults = query?.maxResults;

    try {
      const result = await syncMail({ deltaLink, maxResults });
      return apiSuccess(result);
    } catch (e) {
      return apiError(
        "mail_sync_failed",
        e instanceof Error ? e.message : "Mail-Sync fehlgeschlagen",
        502
      );
    }
  }
);
