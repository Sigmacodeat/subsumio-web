import { z } from "zod";
import { getStore, getOrgStore, buildNewOrg, toPublic, withInviteRevoked } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";
import { detachFromFirm } from "@/lib/auth/firm-brain";
import { visibleOrgMembers } from "@/lib/team-visibility";
import { mayManageTeam } from "@/lib/invite-roles";
import { defaultModelPolicyForNewOrg, euRouteAvailable } from "@/lib/eu-routing";

const orgPostSchema = z.object({
  name: z.string().trim().min(2, "invalid_name").max(80, "invalid_name"),
});

const orgPatchSchema = z.object({
  modelPolicy: z.enum(["any", "eu_only"]),
});

export const GET = createHandler(
  {
    // Own firm and (for staff) colleagues — client accounts see only themselves.
    action: "account.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, _req) => {
    if (!ctx.user.orgId) return Response.json({ org: null });

    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org) return Response.json({ org: null });

    const orgUsers = await getStore().listByOrg(org.id);
    const members = visibleOrgMembers(ctx.user, orgUsers).map((u) => ({
      ...toPublic(u),
      isOwner: u.id === org.ownerId,
    }));
    return Response.json({
      org: {
        id: org.id,
        name: org.name,
        ownerId: org.ownerId,
        createdAt: org.createdAt,
        modelPolicy: org.modelPolicy ?? "any",
        // Whether the operator set up an EU model route — without it the EU
        // data mode would refuse every AI request (see src/lib/eu-routing.ts).
        euRouteAvailable: euRouteAvailable(),
      },
      members,
      isOwner: ctx.user.id === org.ownerId,
      // Owner and administrators invite and remove members.
      canManageTeam: mayManageTeam(org, ctx.user, ctx.supportSession),
    });
  }
);

/** Owner-only: set the org-wide model policy (e.g. "eu_only" — see model-config.ts). */
export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: orgPatchSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "org",
      entityId: ctx.user.orgId ?? undefined,
      details: { modelPolicy: body.modelPolicy },
    }),
  },
  async (ctx, body, _query, _req) => {
    if (!ctx.user.orgId) return apiError("not_in_org", "Keine Organisation", 400);

    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org) return apiError("org_not_found", "Organisation nicht gefunden", 404);
    if (ctx.user.id !== org.ownerId) {
      return apiError("owner_only", "Nur der Owner kann die Model-Policy ändern", 403);
    }

    const updated = await getOrgStore().update(org.id, { modelPolicy: body.modelPolicy });
    return Response.json({ org: { id: updated!.id, modelPolicy: updated!.modelPolicy ?? "any" } });
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: orgPostSchema,
    audit: (_ctx, body) => ({
      action: "org.create" as const,
      entityType: "org",
      details: { name: body.name },
    }),
  },
  async (ctx, body, _query, _req) => {
    if (ctx.user.orgId) return apiError("already_in_org", "Bereits in einer Organisation", 409);

    // The firm adopts the founder's brain, so matters, deadlines and documents
    // created before the team existed stay where they are.
    // DACH firms start in the EU data mode when an EU model route exists.
    const modelPolicy = defaultModelPolicyForNewOrg(ctx.user.jurisdiction);
    const org = await getOrgStore().create({
      ...buildNewOrg({ name: body.name, ownerId: ctx.user.id, brainId: ctx.user.brainId }),
      ...(modelPolicy === "eu_only" ? { modelPolicy } : {}),
    });
    // The founder administers the new firm (team, roles, settings, billing).
    // Without this only the very first account of an installation was admin.
    await getStore().update(ctx.user.id, { orgId: org.id, role: "admin" });
    return Response.json({ org }, { status: 201 });
  }
);

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    audit: (ctx) => ({
      action: "team.remove" as const,
      entityType: "org",
      entityId: ctx.user.orgId ?? undefined,
    }),
  },
  async (ctx, _body, _query, _req) => {
    if (!ctx.user.orgId) return apiError("not_in_org", "Keine Organisation", 400);

    const orgs = getOrgStore();
    const org = await orgs.getById(ctx.user.orgId);
    if (!org) {
      await getStore().update(ctx.user.id, { orgId: null });
      return Response.json({ ok: true });
    }

    if (ctx.user.id === org.ownerId) {
      const memberCount = (await getStore().listByOrg(org.id)).length;
      if (memberCount > 1) {
        return apiError("owner_must_remove_members_first", "Zuerst Mitglieder entfernen", 409);
      }
      await getStore().update(ctx.user.id, { orgId: null });
      await orgs.delete(org.id);
      return Response.json({ ok: true });
    }

    // Leaving revokes this member's outstanding invite links (stateless,
    // 7-day TTL — same cutoff as owner-initiated removal). Cutoff first: a
    // failed leave then leaves a dead invite (recoverable), not a live one.
    const inviteRevokedAt = withInviteRevoked(org.inviteRevokedAt, ctx.user.email);
    await orgs.update(org.id, { inviteRevokedAt });
    // A founder who hands over the firm and leaves does not take its brain.
    await detachFromFirm(ctx.user, org);
    return Response.json({ ok: true });
  }
);
