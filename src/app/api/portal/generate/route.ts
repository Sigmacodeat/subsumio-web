import { z } from "zod";
import { signPortalToken } from "@/lib/portal-token";
import { createHandler } from "@/lib/api-handler";

const generateSchema = z.object({
  caseSlug: z.string().min(1, "caseSlug_required"),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: generateSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "portal_token",
      entityId: body.caseSlug,
      details: { action: "generate" },
    }),
  },
  async (ctx, body, _query, _req) => {
    const token = await signPortalToken(body.caseSlug, undefined, ctx.brainId);
    return Response.json({ token, url: `/portal/${token}` });
  }
);
