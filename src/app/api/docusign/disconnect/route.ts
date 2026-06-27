import { disconnectUser } from "@/lib/docusign";
import { createHandler } from "@/lib/api-handler";

export const POST = createHandler(
  {
    action: "settings.write",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    await disconnectUser(ctx.user.id);
    return Response.json({ ok: true, disconnected: true });
  }
);
