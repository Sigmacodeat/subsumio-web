import { z } from "zod";
import { getStore, getOrgStore, withInviteRevoked } from "@/lib/auth/store";
import { createHandler, apiError } from "@/lib/api-handler";
import { detachFromFirm } from "@/lib/auth/firm-brain";
import { mayManageTeam } from "@/lib/invite-roles";

const memberSchema = z.object({
  userId: z.string().min(1, "missing_user"),
});

export const DELETE = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: memberSchema,
    audit: (ctx, body) => ({
      action: "team.remove" as const,
      entityType: "org",
      entityId: body.userId,
      details: { removed_by: ctx.user.id },
    }),
  },
  async (ctx, body, _query, _req) => {
    if (!ctx.user.orgId) return apiError("not_in_org", "Nicht in einer Organisation", 400);

    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org || !mayManageTeam(org, ctx.user, ctx.supportSession)) {
      return apiError(
        "admin_only",
        "Nur Inhaber oder Administratoren können Mitglieder entfernen",
        403
      );
    }

    if (body.userId === ctx.user.id) {
      return apiError("owner_cannot_remove_self", "Sie können sich nicht selbst entfernen", 400);
    }
    // The owner holds the firm (billing, brain) and is never removed by an
    // administrator.
    if (body.userId === org.ownerId) {
      return apiError("owner_not_removable", "Der Inhaber kann nicht entfernt werden", 403);
    }

    const store = getStore();
    const target = await store.getById(body.userId);
    if (!target || target.orgId !== org.id) {
      return apiError("not_a_member", "Nutzer ist kein Mitglied", 404);
    }

    // Outstanding invite links for this email die with the removal — invite
    // tokens are stateless, so without this a removed member could rejoin
    // with the old link for up to 7 days. The cutoff is written FIRST: if the
    // member removal fails afterwards, the failure mode is a dead invite
    // (recoverable via re-invite), not a live invite for a non-member.
    const inviteRevokedAt = withInviteRevoked(org.inviteRevokedAt, target.email);
    await getOrgStore().update(org.id, { inviteRevokedAt });
    // A founder's own brain is the firm brain — they get a fresh one.
    await detachFromFirm(target, org);
    return Response.json({ ok: true });
  }
);
