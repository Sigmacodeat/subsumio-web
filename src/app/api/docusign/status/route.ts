import { getStore } from "@/lib/auth/store";
import { docusignConfigProblem, docusignEnvironment } from "@/lib/docusign";
import { createHandler } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, _req) => {
    const problem = docusignConfigProblem();
    if (problem) {
      return Response.json({ configured: false, connected: false, reason: problem });
    }

    const user = await getStore().getById(ctx.user.id);
    const connected = Boolean(user?.docusignAccessToken && user?.docusignTokenExpiresAt);
    const expired =
      connected && user?.docusignTokenExpiresAt
        ? new Date(user.docusignTokenExpiresAt) < new Date()
        : false;

    return Response.json({
      configured: true,
      environment: docusignEnvironment(),
      connected,
      expired,
      expiresAt: user?.docusignTokenExpiresAt ?? null,
      // A refresh token renews an expired access token on the next send.
      renewable: Boolean(user?.docusignRefreshToken),
      email: connected ? (user?.docusignUserEmail ?? null) : null,
      name: connected ? (user?.docusignUserName ?? null) : null,
    });
  }
);
