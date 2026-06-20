
import { z } from "zod";
import { verifyPortalToken } from "@/lib/portal-token";
import { createPublicHandler, apiError } from "@/lib/api-handler";

const verifySchema = z.object({
  token: z.string().min(1, "token_required"),
});

export const GET = createPublicHandler(
  {
    query: verifySchema,
    cors: true,
  },
  async (req, _body, query) => {
    const payload = await verifyPortalToken(query.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }

    return Response.json({
      valid: true,
      caseSlug: payload.case_slug,
      expiresAt: payload.exp,
    });
  },
);
