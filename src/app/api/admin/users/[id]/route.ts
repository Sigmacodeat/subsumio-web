import { z } from "zod";
import { createHandler, apiError, clientIpOf } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { auditBrainForUser } from "@/lib/audit-user";
import { getStore, type Plan, type KanzleiRole, type User } from "@/lib/auth/store";
import { revokeUserAccess } from "@/lib/auth/revoke-access";
import { isValidIndustry } from "@/lib/industry-pack";
import { getTenant } from "@/lib/tenants";
import {
  TenantAdminFailure,
  assertMemberMayBeDeactivated,
  setMemberRole,
  tenantAdminMessage,
} from "@/lib/tenant-admin";

function pick(user: User, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (user as unknown as Record<string, unknown>)[k] ?? null;
  return out;
}

/**
 * An operator change to an account is recorded twice: in the operator's own
 * protocol and in the protocol of the firm the account belongs to — the firm
 * must be able to show who changed access to its data, and when.
 */
async function auditOperatorChange(
  ctx: { brainId: string; user: { id: string; email: string } },
  req: Request,
  action: "admin.user_update" | "admin.user_deactivate",
  target: User,
  details: { before: Record<string, unknown>; after: Record<string, unknown> }
): Promise<void> {
  const entry = {
    entityId: target.id,
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    ip: clientIpOf(req),
    details: { ...details, target: target.email, byOperator: true },
  };
  void logAudit(action, "user", { ...entry, brainId: ctx.brainId });
  const firmBrain = await auditBrainForUser(target);
  if (firmBrain && firmBrain !== ctx.brainId) {
    void logAudit(action, "user", { ...entry, brainId: firmBrain });
  }
}

/**
 * Same invariant as every tenant action: a firm keeps an active owner and an
 * active admin. Returns the 409 answer, or null when the deactivation may go on.
 */
async function refuseDeactivation(target: User): Promise<Response | null> {
  const tenant = target.orgId ? await getTenant(target.orgId) : null;
  if (tenant?.kind !== "org") return null;
  try {
    await assertMemberMayBeDeactivated(tenant, target.id);
    return null;
  } catch (err) {
    if (err instanceof TenantAdminFailure) {
      return apiError(err.code, tenantAdminMessage(err.code), 409);
    }
    throw err;
  }
}

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
    // Audited in the handler (needs the target id and the values before).
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
    if (body.deactivatedAt !== undefined) {
      if (body.deactivatedAt) {
        const refused = await refuseDeactivation(target);
        if (refused) return refused;
      }
      patch.deactivatedAt = body.deactivatedAt;
    }

    const updated = await store.update(id, patch);
    if (!updated) {
      return apiError("update_failed", "Aktualisierung fehlgeschlagen", 500);
    }

    if (body.deactivatedAt && typeof body.deactivatedAt === "string") {
      await revokeUserAccess(id);
    }

    await auditOperatorChange(ctx, req, "admin.user_update", target, {
      before: pick(target, Object.keys(body)),
      after: body,
    });

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
    // Audited in the handler (needs the target id).
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
    const refused = await refuseDeactivation(target);
    if (refused) return refused;

    const updated = await store.update(id, {
      deactivatedAt: new Date().toISOString(),
    });

    if (!updated) {
      return apiError("deactivate_failed", "Deaktivierung fehlgeschlagen", 500);
    }

    await revokeUserAccess(id);

    await auditOperatorChange(ctx, req, "admin.user_deactivate", target, {
      before: { deactivatedAt: target.deactivatedAt ?? null },
      after: { deactivatedAt: updated.deactivatedAt },
    });

    return Response.json({ ok: true, deactivatedAt: updated.deactivatedAt });
  }
);
