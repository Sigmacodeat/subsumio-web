import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getStore, type Plan, type KanzleiRole } from "@/lib/auth/store";
import { revokeUserAccess } from "@/lib/auth/revoke-access";
import { isValidIndustry } from "@/lib/industry-pack";
import { getTenant } from "@/lib/tenants";
import { TenantAdminFailure, setMemberRole, tenantAdminMessage } from "@/lib/tenant-admin";

const updateSchema = z.object({
  plan: z.enum(["free", "pro", "team", "enterprise"]).optional(),
  role: z.enum(["admin", "lawyer", "assistant", "client_viewer"]).optional(),
  industry: z.string().nullable().optional(),
  emailVerifiedAt: z.string().nullable().optional(),
  deactivatedAt: z.string().nullable().optional(),
});

export const PATCH = createHandler(
  {
    action: "platform.operator",
    rateTier: "standard",
    body: updateSchema,
    audit: (ctx, body) => ({
      action: "admin.user_update" as const,
      entityType: "user",
      details: body,
    }),
  },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const store = getStore();
    const target = await store.getById(id);
    if (!target) {
      return apiError("user_not_found", "Benutzer nicht gefunden", 404);
    }

    const patch: Record<string, unknown> = {};
    if (body.plan !== undefined) patch.plan = body.plan as Plan;
    if (body.role !== undefined && body.role !== target.role) {
      // Inside a team the same rules as on the firm page apply: the owner stays
      // admin and the firm keeps at least one active admin.
      const tenant = target.orgId ? await getTenant(target.orgId) : null;
      if (tenant?.kind === "org") {
        try {
          await setMemberRole(tenant, target.id, body.role as KanzleiRole);
        } catch (err) {
          if (err instanceof TenantAdminFailure) {
            return apiError(err.code, tenantAdminMessage(err.code), 409);
          }
          throw err;
        }
      } else {
        patch.role = body.role as KanzleiRole;
      }
    }
    if (body.industry !== undefined) {
      if (body.industry === null || isValidIndustry(body.industry)) {
        patch.industry = body.industry;
      } else if (body.industry !== target.industry) {
        return apiError(
          "invalid_industry",
          "Nur die aktive Branche Legal kann zugewiesen werden",
          400
        );
      }
    }
    if (body.emailVerifiedAt !== undefined) patch.emailVerifiedAt = body.emailVerifiedAt;
    if (body.deactivatedAt !== undefined) patch.deactivatedAt = body.deactivatedAt;

    const updated = await store.update(id, patch);
    if (!updated) {
      return apiError("update_failed", "Aktualisierung fehlgeschlagen", 500);
    }

    if (body.deactivatedAt && typeof body.deactivatedAt === "string") {
      await revokeUserAccess(id);
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
    action: "platform.operator",
    rateTier: "standard",
    audit: () => ({
      action: "admin.user_deactivate" as const,
      entityType: "user",
    }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const store = getStore();
    const target = await store.getById(id);
    if (!target) {
      return apiError("user_not_found", "Benutzer nicht gefunden", 404);
    }

    if (target.id === ctx.user.id) {
      return apiError("cannot_delete_self", "Das eigene Konto lässt sich nicht deaktivieren", 409);
    }

    const updated = await store.update(id, {
      deactivatedAt: new Date().toISOString(),
    });

    if (!updated) {
      return apiError("deactivate_failed", "Deaktivierung fehlgeschlagen", 500);
    }

    await revokeUserAccess(id);

    return Response.json({ ok: true, deactivatedAt: updated.deactivatedAt });
  }
);
