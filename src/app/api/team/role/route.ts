
import { z } from "zod";
import { getStore, getOrgStore, type KanzleiRole } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";

const VALID_ROLES: KanzleiRole[] = ["admin", "lawyer", "assistant", "client_viewer"];

const roleChangeSchema = z.object({
  userId: z.string().min(1, "userId_and_role_required"),
  role: z.enum(VALID_ROLES as [KanzleiRole, ...KanzleiRole[]], { message: "invalid_role" }),
});

const handler = createHandler(
  {
    action: "team.role_change",
    rateTier: "standard",
    body: roleChangeSchema,
    audit: (_ctx, body) => ({
      action: "team.role_change" as const,
      entityType: "user",
      entityId: body.userId,
      details: { newRole: body.role },
    }),
  },
  async (ctx, body, _query, _req) => {
    const store = getStore();
    const targetUser = await store.getById(body.userId);
    if (!targetUser) {
      return apiError("user_not_found", "Benutzer nicht gefunden", 404);
    }

    if (ctx.user.orgId) {
      const org = await getOrgStore().getById(ctx.user.orgId);
      if (!org || org.ownerId !== ctx.user.id) {
        return apiError("owner_only", "Nur der Eigentümer kann Rollen ändern", 403);
      }
      if (targetUser.orgId !== ctx.user.orgId) {
        return apiError("not_in_your_org", "Benutzer nicht in deiner Organisation", 403);
      }
    }

    if (targetUser.id === ctx.user.id && targetUser.role === "admin" && body.role !== "admin") {
      const allUsers = await store.list();
      const adminCount = allUsers.filter(
        (u) => u.role === "admin" && (!ctx.user.orgId || u.orgId === ctx.user.orgId),
      ).length;
      if (adminCount <= 1) {
        return apiError("last_admin_cannot_change_role", "Letzter Admin kann nicht degradiert werden", 409);
      }
    }

    await store.update(body.userId, { role: body.role });
    return Response.json({ ok: true, userId: body.userId, role: body.role });
  },
);

export const POST = handler;
export const PATCH = handler;
