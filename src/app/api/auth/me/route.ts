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
    return Response.json({ user: toPublic(ctx.user), referrals });
  },
);

export const PATCH = createHandler(
  {
    action: "settings.write",
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
  },
);
