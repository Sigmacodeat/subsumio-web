
import { z } from "zod";
import { listEnvelopes } from "@/lib/docusign";
import { isAppError } from "@/lib/errors";
import { createHandler, apiError } from "@/lib/api-handler";

const envelopesQuerySchema = z.object({
  fromDate: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    query: envelopesQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    try {
      const envelopes = await listEnvelopes(ctx.user.id, {
        fromDate: query.fromDate,
        status: query.status,
        limit: query.limit,
      });
      return Response.json({ envelopes });
    } catch (err) {
      if (isAppError(err)) {
        return apiError(err.code, err.message, err.statusCode);
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[docusign envelopes] error:", msg);
      return apiError("list_failed", msg, 500);
    }
  },
);
