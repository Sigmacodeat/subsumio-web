import { getStore } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";
import { visibleOrgMembers } from "@/lib/team-visibility";

import { logger } from "@/lib/logger";
const log = logger("api/team");

export const GET = createHandler(
  {
    action: "account.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, _req) => {
    try {
      // Only this firm's records — never load (and decrypt) the whole installation.
      const orgUsers = ctx.user.orgId ? await getStore().listByOrg(ctx.user.orgId) : [ctx.user];
      // Client accounts never see other accounts; only admins see client accounts.
      const members = visibleOrgMembers(ctx.user, orgUsers).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
      }));

      return Response.json({ members });
    } catch (err) {
      log.error("[team] failed to list users:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Team konnte nicht geladen werden", 500);
    }
  }
);
