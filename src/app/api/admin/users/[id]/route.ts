import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getStore, type Plan, type KanzleiRole } from "@/lib/auth/store";
import { revokeAllSessions } from "@/lib/auth/session";
import { isValidIndustry } from "@/lib/industry-pack";

const updateSchema = z.object({
  plan: z.enum(["free", "pro", "team", "enterprise"]).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client_viewer"]).optional(),
  industry: z.string().nullable().optional(),
  emailVerifiedAt: z.string().nullable().optional(),
  deactivatedAt: z.string().nullable().optional(),
});

export const PATCH = createHandler(
  {
    action: "admin.user_update",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx, body) => ({
      action: "admin.user_update" as const,
      entityType: "user",
      details: body,
    }),
  },
  async (ctx, body, _query, req) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const store = getStore();
    const target = await store.getById(id);
    if (!target) {
      return apiError("user_not_found", "Benutzer nicht gefunden", 404);
    }

    const patch: Record<string, unknown> = {};
    if (body.plan !== undefined) patch.plan = body.plan as Plan;
    if (body.role !== undefined) patch.role = body.role as KanzleiRole;
    if (body.industry !== undefined) {
      patch.industry = isValidIndustry(body.industry) ? body.industry : null;
    }
    if (body.emailVerifiedAt !== undefined) patch.emailVerifiedAt = body.emailVerifiedAt;
    if (body.deactivatedAt !== undefined) patch.deactivatedAt = body.deactivatedAt;

    const updated = await store.update(id, patch);
    if (!updated) {
      return apiError("update_failed", "Aktualisierung fehlgeschlagen", 500);
    }

    if (body.deactivatedAt && typeof body.deactivatedAt === "string") {
      await revokeAllSessions(id);
    }

    const {
      passwordHash,
      twoFactorSecret,
      pendingTwoFactorSecret,
      twoFactorBackupCodes,
      docusignAccessToken,
      docusignRefreshToken,
      openaiKey,
      anthropicKey,
      zeroEntropyKey,
      ...safe
    } = updated;
    return Response.json({ ok: true, user: safe });
  }
);

export const DELETE = createHandler(
  {
    action: "admin.user_deactivate",
    rateTier: "standard",
    audit: () => ({
      action: "admin.user_deactivate" as const,
      entityType: "user",
    }),
  },
  async (ctx, _body, _query, req) => {
    if (ctx.user.role !== "admin") {
      return apiError("forbidden", "Admin access required", 403);
    }

    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const store = getStore();
    const target = await store.getById(id);
    if (!target) {
      return apiError("user_not_found", "Benutzer nicht gefunden", 404);
    }

    if (target.id === ctx.user.id) {
      return apiError("cannot_delete_self", "Du kannst dich nicht selbst deaktivieren", 409);
    }

    const updated = await store.update(id, {
      deactivatedAt: new Date().toISOString(),
    });

    if (!updated) {
      return apiError("deactivate_failed", "Deaktivierung fehlgeschlagen", 500);
    }

    await revokeAllSessions(id);

    return Response.json({ ok: true, deactivatedAt: updated.deactivatedAt });
  }
);
