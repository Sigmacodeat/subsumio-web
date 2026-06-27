import { z } from "zod";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { verifyActionToken, bindFragment } from "@/lib/auth/tokens";
import { limitsFor } from "@/lib/plans";
import { createHandler, apiError } from "@/lib/api-handler";

const joinSchema = z.object({
  token: z.string().min(1, "token_required"),
  org: z.string().min(1, "org_required"),
  email: z.string().email("invalid_email"),
});

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: joinSchema,
  },
  async (ctx, body, _query, _req) => {
    const orgId = body.org.trim();
    const email = body.email.trim().toLowerCase();
    if (ctx.user.email !== email) {
      return apiError("wrong_account", "Invite was for a different email", 403);
    }

    const payload = await verifyActionToken(body.token, "invite");
    if (!payload || payload.bind !== (await bindFragment(`${orgId}:${email}`))) {
      return apiError("invalid_or_expired_invite", "Invite ungültig oder abgelaufen", 400);
    }

    const org = await getOrgStore().getById(orgId);
    if (!org) return apiError("invalid_or_expired_invite", "Invite ungültig oder abgelaufen", 400);

    if (ctx.user.orgId === org.id) {
      return Response.json({ ok: true, org: { name: org.name } });
    }
    if (ctx.user.orgId) {
      return apiError(
        "leave_current_org_first",
        "Bitte verlasse zuerst die aktuelle Organisation",
        409
      );
    }

    const store = getStore();
    const owner = await store.getById(org.ownerId);
    const seats = limitsFor(owner?.plan ?? "free").seats;
    const members = await store.listByOrg(org.id);
    if (members.length >= seats) {
      return apiError("no_seats_left", "Keine freien Plätze", 409);
    }

    await store.update(ctx.user.id, { orgId: org.id });
    return Response.json({ ok: true, org: { name: org.name } });
  }
);
