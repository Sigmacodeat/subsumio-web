import { disconnectUser } from "@/lib/docusign";
import { createHandler } from "@/lib/api-handler";

export const POST = createHandler(
  {
    // Each user disconnects their own connection (connect is open to every
    // role via /api/docusign/auth) — self-referential like profile.update.
    action: "profile.update",
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
