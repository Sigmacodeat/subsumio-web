
import { getStore } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "settings.read",
    rateTier: "standard",
    cacheMaxAge: 15,
  },
  async (ctx, _body, _query, _req) => {
    try {
      const allUsers = await getStore().list();
      const members = allUsers
        .filter((u) =>
          ctx.user.orgId ? u.orgId === ctx.user.orgId : u.id === ctx.user.id,
        )
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
        }));

      return Response.json({ members });
    } catch (err) {
      console.error("[team] failed to list users:", err instanceof Error ? err.message : String(err));
      return apiError("internal_error", "Team konnte nicht geladen werden", 500);
    }
  },
);
