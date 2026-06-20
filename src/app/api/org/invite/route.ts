
import { z } from "zod";
import { getStore, getOrgStore } from "@/lib/auth/store";
import { signActionToken, bindFragment, INVITE_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { limitsFor } from "@/lib/plans";
import { sendMail, siteUrl } from "@/lib/mail";
import { createHandler, apiError } from "@/lib/api-handler";

const inviteSchema = z.object({
  email: z.string().email("invalid_email"),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: inviteSchema,
    audit: (ctx, body) => ({
      action: "team.invite" as const,
      entityType: "org",
      details: { email: body.email, invited_by: ctx.user.email },
    }),
  },
  async (ctx, body, _query, _req) => {
    if (!ctx.user.orgId) return apiError("not_in_org", "Nicht in einer Organisation", 400);

    const org = await getOrgStore().getById(ctx.user.orgId);
    if (!org || org.ownerId !== ctx.user.id) {
      return apiError("owner_only", "Nur der Eigent\u00fcmer kann einladen", 403);
    }

    const email = body.email.trim().toLowerCase();
    if (email === ctx.user.email) {
      return apiError("self_invite", "Sie k\u00f6nnen sich nicht selbst einladen", 400);
    }

    const store = getStore();
    const members = (await store.list()).filter((u) => u.orgId === org.id);
    const seats = limitsFor(ctx.user.plan).seats;
    if (members.length >= seats) {
      return apiError("no_seats_left", "Keine freien Pl\u00e4tze", 409, { seats });
    }

    const existing = await store.getByEmail(email);
    if (existing?.orgId === org.id) {
      return apiError("already_member", "Bereits Mitglied", 409);
    }

    const token = await signActionToken(
      { uid: ctx.user.id, purpose: "invite", bind: await bindFragment(`${org.id}:${email}`) },
      INVITE_TOKEN_TTL_SECONDS,
    );
    const joinUrl = `${siteUrl()}/join?token=${encodeURIComponent(token)}&org=${encodeURIComponent(org.id)}&email=${encodeURIComponent(email)}`;

    const de = ctx.user.locale === "de";
    const result = await sendMail({
      to: email,
      subject: de
        ? `${ctx.user.name} l\u00e4dt dich zu \u201e${org.name}\u201c auf Subsumio ein`
        : `${ctx.user.name} invited you to \u201c${org.name}\u201d on Subsumio`,
      text: de
        ? `Hallo,\n\n${ctx.user.name} (${ctx.user.email}) l\u00e4dt dich ein, dem Team \u201e${org.name}\u201c auf Subsumio beizutreten \u2014 ein gemeinsames Brain f\u00fcr euer Wissen.\n\nBeitreten (Link 7 Tage g\u00fcltig):\n${joinUrl}\n\nNoch kein Konto? Der Link f\u00fchrt dich zuerst durch die Registrierung.\n\n\u2014 Subsumio`
        : `Hi,\n\n${ctx.user.name} (${ctx.user.email}) invited you to join the team \u201c${org.name}\u201d on Subsumio \u2014 one shared brain for your knowledge.\n\nJoin (link valid for 7 days):\n${joinUrl}\n\nNo account yet? The link walks you through signup first.\n\n\u2014 Subsumio`,
    });

    if (!result.sent && process.env.NODE_ENV !== "production") {
      return Response.json({ ok: true, devJoinUrl: joinUrl });
    }
    return Response.json({ ok: true });
  },
);
