import { z } from "zod";
import { revokePortalToken } from "@/lib/portal-token";
import { createHandler } from "@/lib/api-handler";

const revokeSchema = z.object({
  token: z.string().min(1, "token_required"),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: revokeSchema,
    audit: (_ctx, _body) => ({
      action: "case.update" as const,
      entityType: "portal_token",
      details: { action: "revoke" },
    }),
  },
  async (_ctx, body, _query, _req) => {
    await revokePortalToken(body.token);
    return Response.json({ revoked: true });
  }
);
