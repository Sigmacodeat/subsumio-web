import { z } from "zod";
import { createHandler, apiError, apiSuccess, type HandlerContext } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { tenantIdForUser, getTenant } from "@/lib/tenants";
import {
  createSupportGrant,
  getActiveSupportGrant,
  listActiveSupportSessionsForOrg,
  revokeSupportGrants,
  type SupportGrant,
  type SupportSession,
} from "@/lib/support-session";
import { SUPPORT_GRANT_MAX_HOURS } from "@/lib/support-session-policy";

export const dynamic = "force-dynamic";

/**
 * The firm's approval for Subsumio support access (see
 * src/lib/support-session.ts). Only a firm admin grants or revokes it; the
 * platform operator can start a support session only while it is valid and
 * only within its scope. Inside a support session these controls are closed:
 * the operator can never approve their own access.
 */

const grantSchema = z.object({
  hours: z.number().int().min(1).max(SUPPORT_GRANT_MAX_HOURS),
  mode: z.enum(["read", "write"]).default("read"),
});

function publicGrant(g: SupportGrant) {
  return {
    mode: g.mode,
    createdAt: g.createdAt,
    expiresAt: g.expiresAt,
    grantedBy: g.grantedByEmail,
  };
}

function publicSession(s: SupportSession) {
  return {
    mode: s.mode,
    reason: s.reason,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
    by: s.operatorEmail,
  };
}

/** The caller's firm, or an error response: admins only, never inside a support session. */
function firmOf(ctx: HandlerContext): string | Response {
  if (ctx.supportSession) {
    return apiError(
      "support_session_forbidden",
      "Support-Freigaben kann nur die Kanzlei selbst erteilen oder widerrufen.",
      403
    );
  }
  if (ctx.user.role !== "admin") {
    return apiError("forbidden", "Nur Kanzlei-Administratoren verwalten Support-Freigaben.", 403);
  }
  const tenantId = tenantIdForUser(ctx.user);
  if (!tenantId) return apiError("forbidden", "Keine Kanzlei zugeordnet.", 403);
  return tenantId;
}

async function auditEndedSessions(
  ctx: HandlerContext,
  ended: SupportSession[],
  cause: "revoked" | "replaced"
): Promise<void> {
  for (const s of ended) {
    await logAudit("support.session_end", "org", {
      entityId: s.orgId,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { reason: s.reason, mode: s.mode, by: s.operatorEmail, endedBy: cause },
    });
  }
}

export const GET = createHandler({ action: "settings.read", rateTier: "standard" }, async (ctx) => {
  const tenantId = firmOf(ctx);
  if (tenantId instanceof Response) return tenantId;
  const [grant, sessions] = await Promise.all([
    getActiveSupportGrant(tenantId),
    listActiveSupportSessionsForOrg(tenantId),
  ]);
  return apiSuccess({
    grant: grant ? publicGrant(grant) : null,
    activeSessions: sessions.map(publicSession),
    maxHours: SUPPORT_GRANT_MAX_HOURS,
  });
});

/** Grants (or replaces) the firm's approval for the chosen time and scope. */
export const POST = createHandler(
  { action: "settings.write", rateTier: "standard", body: grantSchema },
  async (ctx, body) => {
    const tenantId = firmOf(ctx);
    if (tenantId instanceof Response) return tenantId;
    if (!(await getTenant(tenantId)))
      return apiError("forbidden", "Keine Kanzlei zugeordnet.", 403);

    const { grant, replaced, endedSessions } = await createSupportGrant({
      orgId: tenantId,
      mode: body.mode,
      hours: body.hours,
      grantedById: ctx.user.id,
      grantedByEmail: ctx.user.email,
    });
    for (const old of replaced) {
      await logAudit("support.grant_revoked", "org", {
        entityId: tenantId,
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { mode: old.mode, expiresAt: old.expiresAt, cause: "replaced" },
      });
    }
    await auditEndedSessions(ctx, endedSessions, "replaced");
    await logAudit("support.grant_created", "org", {
      entityId: tenantId,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { mode: grant.mode, hours: body.hours, expiresAt: grant.expiresAt },
    });
    return apiSuccess({ grant: publicGrant(grant) }, undefined, 201);
  }
);

/** Revokes the approval; running support sessions end immediately. */
export const DELETE = createHandler(
  { action: "settings.write", rateTier: "standard" },
  async (ctx) => {
    const tenantId = firmOf(ctx);
    if (tenantId instanceof Response) return tenantId;
    const { grants, endedSessions } = await revokeSupportGrants(tenantId, ctx.user.email);
    for (const g of grants) {
      await logAudit("support.grant_revoked", "org", {
        entityId: tenantId,
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { mode: g.mode, expiresAt: g.expiresAt, cause: "revoked" },
      });
    }
    await auditEndedSessions(ctx, endedSessions, "revoked");
    return apiSuccess({ grant: null, endedSessions: endedSessions.length });
  }
);
