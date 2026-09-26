import { createHash } from "node:crypto";
import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { getStore, toPublic } from "@/lib/auth/store";

const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    locale: z.enum(["en", "de"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "nothing_to_update",
  });

export const GET = createHandler(
  {
    action: "settings.read",
  },
  async (ctx) => {
    const referrals = await getStore().countReferrals(ctx.user.referralCode);
    // Only present for a platform operator inside an active support session —
    // drives the "Support-Zugriff aktiv" banner in the Kanzlei dashboard.
    // Trimmed to what the banner needs; the operator's own identity is never
    // sent here (the firm sees it separately, in its own audit trail).
    const supportSession = ctx.supportSession
      ? {
          mode: ctx.supportSession.mode,
          orgName: ctx.supportSession.orgName,
          reason: ctx.supportSession.reason,
          startedAt: ctx.supportSession.startedAt,
          expiresAt: ctx.supportSession.expiresAt,
        }
      : null;
    // Public live-demo marker — drives the DemoBanner/Tour/Gate UI and
    // skips onboarding redirects + PostHog identification in the layout.
    const demo = ctx.demo
      ? {
          sid: ctx.demo.sid,
          persona: ctx.demo.persona,
          jurisdiction: ctx.demo.jurisdiction ?? "at",
          questionsUsed: ctx.demo.questionsUsed,
          questionsCap: ctx.demo.questionsCap,
          ingested: ctx.demo.ingested,
        }
      : null;
    // Binds the device's offline data (IndexedDB) to this person in this
    // firm; the client wipes it when the scope changes. Opaque on purpose.
    const offlineScope = `${ctx.user.id}:${createHash("sha256")
      .update(`${ctx.brainId}\u0000${ctx.demo?.sid ?? ""}`)
      .digest("hex")
      .slice(0, 16)}`;
    return Response.json({
      user: toPublic(ctx.user),
      referrals,
      supportSession,
      demo,
      offlineScope,
    });
  }
);

export const PATCH = createHandler(
  {
    // Own profile only (ctx.user.id) — not the admin-only firm settings.
    action: "profile.update",
    body: updateProfileSchema,
    audit: (ctx, body) => ({
      action: "settings.update",
      entityType: "user",
      entityId: ctx.user.id,
      details: { fields: Object.keys(body) },
    }),
  },
  async (ctx, body) => {
    const patch: { name?: string; locale?: "en" | "de" } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.locale !== undefined) patch.locale = body.locale;

    const updated = await getStore().update(ctx.user.id, patch);
    if (!updated) return Response.json({ error: "user_not_found" }, { status: 404 });

    return Response.json({ user: toPublic(updated) });
  }
);
