
import { getStore } from "@/lib/auth/store";
import { isConfigured } from "@/lib/docusign";
import { createHandler } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    const configured = isConfigured();
    if (!configured) {
      return Response.json({ configured: false, connected: false, reason: "not_configured" });
    }

    const user = await getStore().getById(ctx.user.id);
    const connected = Boolean(user?.docusignAccessToken && user?.docusignTokenExpiresAt);
    const expired = connected && user?.docusignTokenExpiresAt
      ? new Date(user.docusignTokenExpiresAt) < new Date()
      : false;

    return Response.json({
      configured: true,
      connected,
      expired,
      expiresAt: user?.docusignTokenExpiresAt ?? null,
    });
  },
);
