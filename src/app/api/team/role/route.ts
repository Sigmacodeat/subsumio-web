import { z } from "zod";
import { getStore, getOrgStore, type KanzleiRole } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";
import { getTenant } from "@/lib/tenants";
import { TenantAdminFailure, setMemberRole, tenantAdminMessage } from "@/lib/tenant-admin";

const VALID_ROLES: KanzleiRole[] = ["admin", "lawyer", "assistant", "client_viewer"];

const roleChangeSchema = z.object({
  userId: z.string().min(1, "userId_and_role_required"),
  role: z.enum(VALID_ROLES as [KanzleiRole, ...KanzleiRole[]], { message: "invalid_role" }),
});

/** The role before the change, for the audit entry (set by the handler). */
const previousRole = new WeakMap<object, string>();

const handler = createHandler(
  {
    action: "team.role_change",
    rateTier: "standard",
    body: roleChangeSchema,
    audit: (_ctx, body) => ({
      action: "team.role_change" as const,
      entityType: "user",
      entityId: body.userId,
      details: { oldRole: previousRole.get(body) ?? null, newRole: body.role },
    }),
  },
  async (ctx, body, _query, _req) => {
    const store = getStore();
    const targetUser = await store.getById(body.userId);
    if (!targetUser) {
      return apiError("user_not_found", "Benutzer nicht gefunden", 404);
    }

    // Roles are firm-scoped: only the firm owner changes roles, and only for
    // members of the same firm. Without a firm there is nobody to manage.
    if (!ctx.user.orgId) {
      return apiError(
        "not_in_org",
        "Rollen können nur innerhalb einer Kanzlei vergeben werden",
        403
      );
    }
    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org || org.ownerId !== ctx.user.id) {
      return apiError("owner_only", "Nur der Eigentümer kann Rollen ändern", 403);
    }
    if (targetUser.orgId !== ctx.user.orgId) {
      return apiError("not_in_your_org", "Diese Person gehört nicht zu Ihrer Kanzlei", 403);
    }

    // Same rules as the operator path (src/lib/tenant-admin.ts): the owner
    // stays admin and the firm keeps at least one ACTIVE admin. The member's
    // sessions are renewed so the new role applies at once.
    previousRole.set(body, targetUser.role);
    const tenant = await getTenant(org.id);
    if (!tenant) return apiError("org_not_found", "Kanzlei nicht gefunden", 404);
    try {
      await setMemberRole(tenant, targetUser.id, body.role);
    } catch (err) {
      if (err instanceof TenantAdminFailure) {
        return apiError(err.code, tenantAdminMessage(err.code), 409);
      }
      throw err;
    }
    return Response.json({ ok: true, userId: body.userId, role: body.role });
  }
);

export const POST = handler;
export const PATCH = handler;
