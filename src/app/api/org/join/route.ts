import { z } from "zod";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { effectivePlan } from "@/lib/billing/trial";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { limitsFor } from "@/lib/plans";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  DEFAULT_INVITE_ROLE,
  INVITE_ROLES,
  inviteBinding,
  type InviteRole,
} from "@/lib/invite-roles";

const joinSchema = z.object({
  token: z.string().min(1, "token_required"),
  org: z.string().min(1, "org_required"),
  email: z.string().email("invalid_email"),
  /** The role the invite was issued for — checked against the signed binding. */
  role: z.enum(INVITE_ROLES).optional(),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: joinSchema,
    audit: (ctx, body) => ({
      action: "org.join" as const,
      entityType: "org",
      entityId: body.org,
      details: { user: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    const orgId = body.org.trim();
    const email = body.email.trim().toLowerCase();
    if (ctx.user.email !== email) {
      return apiError("wrong_account", "Invite was for a different email", 403);
    }

    const payload = await verifyActionToken(body.token, "invite");
    // The role comes only from the signed invite. Links from before roles were
    // bound carry none and join with the least privileged role.
    const role: InviteRole = body.role ?? DEFAULT_INVITE_ROLE;
    const expectedBind = inviteBinding(orgId, email, body.role ?? null);
    if (!payload || payload.bind !== (await bindFragment(expectedBind))) {
      return apiError("invalid_or_expired_invite", "Invite ungültig oder abgelaufen", 400);
    }

    const org = await getOrgStore().getById(orgId);
    if (!org) return apiError("invalid_or_expired_invite", "Invite ungültig oder abgelaufen", 400);

    // Already a member? The invite link is irrelevant — answer ok regardless
    // of whether it has been revoked since (stale-link click after re-join).
    if (ctx.user.orgId === org.id) {
      return Response.json({ ok: true, org: { name: org.name } });
    }

    // Removing a member revokes their outstanding invites: a stateless 7-day
    // link would otherwise let a removed person straight back in. The cutoff
    // is per email — a fresh invite minted after the removal still works.
    const revokedAt = org.inviteRevokedAt?.[email];
    if (revokedAt) {
      const cutoff = Date.parse(revokedAt);
      // Tokens minted before `iat` existed count as ancient when a cutoff
      // is set — fail closed, the owner can simply re-invite.
      const issuedAt = typeof payload.iat === "number" ? payload.iat * 1000 : 0;
      if (!Number.isFinite(cutoff) || issuedAt <= cutoff) {
        return apiError(
          "invite_revoked",
          "Diese Einladung wurde zurückgezogen. Bitte fragen Sie die Kanzlei um eine neue.",
          403
        );
      }
    }

    if (ctx.user.orgId) {
      return apiError(
        "leave_current_org_first",
        "Bitte verlassen Sie zuerst die aktuelle Kanzlei",
        409
      );
    }

    const store = getStore();
    const owner = await store.getById(org.ownerId);
    const seats = limitsFor(owner ? effectivePlan(owner) : "free").seats;
    const members = await store.listByOrg(org.id);
    if (members.length >= seats) {
      return apiError("no_seats_left", "Keine freien Plätze", 409);
    }

    // A joining member is NOT an administrator of the firm they join. Their own
    // signup made them admin of their (now unused) personal workspace; inside
    // the firm they get the role the owner chose in the invite.
    await store.update(ctx.user.id, {
      orgId: org.id,
      ...(org.ownerId === ctx.user.id ? {} : { role }),
    });
    return Response.json({ ok: true, org: { name: org.name } });
  }
);
