import { z } from "zod";
import { getOrgStore } from "@/lib/auth/store";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { applyScimGroupRoles } from "@/lib/scim";
import {
  groupMemberIds,
  groupRoleKey,
  listGroupsForOrg,
  SCIM_MAPPABLE_ROLES,
  type ScimMappedRole,
} from "@/lib/scim-groups";

export const dynamic = "force-dynamic";

/**
 * The firm's mapping from directory groups to Subsumio roles (SCIM settings).
 * Admin only (scim.read / scim.write). "admin" is never a valid target: a
 * directory group cannot make anyone a firm admin.
 */

const putSchema = z.object({
  mapping: z
    .record(
      z.string().trim().min(1).max(500),
      z.enum(SCIM_MAPPABLE_ROLES as unknown as [ScimMappedRole, ...ScimMappedRole[]]).nullable()
    )
    .refine((m) => Object.keys(m).length <= 200, "too_many_groups"),
});

const adminOnly = () =>
  apiError("forbidden", "Nur Kanzlei-Administratoren ordnen Gruppen Rollen zu.", 403);

export const GET = createHandler({ action: "scim.read", rateTier: "standard" }, async (ctx) => {
  if (ctx.user.role !== "admin") return adminOnly();
  if (!ctx.user.orgId) return apiError("no_org", "Keine Kanzlei zugeordnet.", 400);
  const org = await getOrgStore().getById(ctx.user.orgId);
  if (!org) return apiError("no_org", "Keine Kanzlei zugeordnet.", 400);
  const groups = await listGroupsForOrg(org.id);
  return apiSuccess({
    groups: groups.map((g) => ({
      id: g.id,
      displayName: g.displayName,
      memberCount: groupMemberIds(g).size,
      role: org.scimGroupRoles?.[groupRoleKey(g.displayName ?? "")] ?? null,
    })),
    mapping: org.scimGroupRoles ?? {},
    roles: SCIM_MAPPABLE_ROLES,
  });
});

/**
 * Replaces the mapping and applies it at once to the members of every group
 * whose mapping changed (added, changed or removed).
 */
export const PUT = createHandler(
  {
    action: "scim.write",
    rateTier: "standard",
    body: putSchema,
    audit: (_ctx, body) => ({
      action: "settings.update" as const,
      entityType: "scim_group_roles",
      details: { mapping: body.mapping },
    }),
  },
  async (ctx, body) => {
    if (ctx.user.role !== "admin") return adminOnly();
    if (ctx.supportSession) {
      return apiError(
        "support_session_forbidden",
        "Rollenzuordnungen ändert nur die Kanzlei selbst.",
        403
      );
    }
    if (!ctx.user.orgId) return apiError("no_org", "Keine Kanzlei zugeordnet.", 400);
    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org) return apiError("no_org", "Keine Kanzlei zugeordnet.", 400);

    const next: Record<string, ScimMappedRole> = {};
    for (const [name, role] of Object.entries(body.mapping)) {
      if (role) next[groupRoleKey(name)] = role;
    }
    const before = org.scimGroupRoles ?? {};
    const changedKeys = new Set(
      [...Object.keys(before), ...Object.keys(next)].filter((k) => before[k] !== next[k])
    );
    await getOrgStore().update(org.id, { scimGroupRoles: next });

    const affected = new Set<string>();
    for (const g of await listGroupsForOrg(org.id)) {
      if (!changedKeys.has(groupRoleKey(g.displayName ?? ""))) continue;
      for (const id of groupMemberIds(g)) affected.add(id);
    }
    const rolesChanged = affected.size ? await applyScimGroupRoles(org.id, affected) : 0;
    return apiSuccess({ mapping: next, rolesChanged });
  }
);
