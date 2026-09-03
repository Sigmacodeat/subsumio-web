import { disconnectUser } from "@/lib/docusign";
import { createHandler } from "@/lib/api-handler";

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
    audit: (ctx, _body) => ({
      action: "docusign.disconnect" as const,
      entityType: "user",
      entityId: ctx.user.id,
      details: { user: ctx.user.email },
    }),
  },
  async (ctx, _body, _query, _req) => {
    await disconnectUser(ctx.user.id);
    return Response.json({ ok: true, disconnected: true });
  }
);
