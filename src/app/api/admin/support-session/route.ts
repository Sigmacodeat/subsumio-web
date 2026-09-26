import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getTenant } from "@/lib/tenants";
import { logAudit } from "@/lib/audit";
import {
  endSupportSession,
  getActiveSupportGrant,
  getActiveSupportSession,
  startSupportSession,
  type SupportGrant,
  type SupportSession,
} from "@/lib/support-session";
import { writeFirmVisibleSupportAuditEntry } from "@/lib/support-session-audit";
import { supportGrantAllows } from "@/lib/support-session-policy";

export const dynamic = "force-dynamic";

const startSchema = z
  .object({
    orgId: z.string().min(1),
    reason: z
      .string()
      .trim()
      .min(10, "Bitte einen aussagekräftigen Grund angeben (min. 10 Zeichen).")
      .max(500),
    // Read-only unless write access is asked for explicitly, with its own reason.
    mode: z.enum(["read", "write"]).default("read"),
    writeReason: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.mode !== "write" || (b.writeReason?.length ?? 0) >= 10, {
    message: "Schreibzugriff braucht eine eigene Begründung (min. 10 Zeichen).",
    path: ["writeReason"],
  });

function publicSession(s: SupportSession) {
  return {
    mode: s.mode,
    orgId: s.orgId,
    orgName: s.orgName,
    reason: s.reason,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
  };
}

function publicGrant(g: SupportGrant) {
  return { mode: g.mode, expiresAt: g.expiresAt, grantedBy: g.grantedByEmail };
}

const getQuerySchema = z.object({ orgId: z.string().min(1).max(200).optional() });

/**
 * The operator's own active session; with `?orgId=` also whether that firm
 * currently approves support access (and in which scope).
 */
export const GET = createHandler(
  {
    action: "platform.operator",
    rateTier: "standard",
    query: getQuerySchema,
  },
  async (ctx, _body, query) => {
    const active = await getActiveSupportSession(ctx.user.id);
    const grant = query?.orgId ? await getActiveSupportGrant(query.orgId) : null;
    return apiSuccess({
      session: active ? publicSession(active) : null,
      ...(query?.orgId ? { grant: grant ? publicGrant(grant) : null } : {}),
    });
  }
);

/**
 * Starts a support session — see src/lib/support-session.ts. Only reachable
 * from the ops console (platform.operator is ops-host-locked in production);
 * ending a session is a separate, less-locked route
 * (POST /api/admin/support-session/end) so the operator can leave from
 * inside the firm dashboard they were browsing.
 */
export const POST = createHandler(
  {
    action: "platform.operator",
    rateTier: "standard",
    body: startSchema,
  },
  async (ctx, body) => {
    // `orgId` carries a tenant id: a firm, or `solo-<userId>` for a lawyer
    // who works alone (see src/lib/tenants.ts).
    const tenant = await getTenant(body.orgId);
    if (!tenant) return apiError("org_not_found", "Kanzlei nicht gefunden", 404);

    // Only with the firm's approval, and only within its scope (fail-closed:
    // no readable approval means no session).
    const grant = await getActiveSupportGrant(tenant.id);
    if (!grant) {
      return apiError(
        "support_grant_required",
        "Die Kanzlei hat derzeit keine Support-Freigabe erteilt. Ein Zugriff ist erst möglich, wenn eine Kanzlei-Administratorin oder ein Kanzlei-Administrator ihn unter Einstellungen → Sicherheit freigibt.",
        403
      );
    }
    if (!supportGrantAllows(grant, body.mode)) {
      return apiError(
        "support_grant_read_only",
        "Die Support-Freigabe der Kanzlei erlaubt nur lesenden Zugriff.",
        403
      );
    }

    const reason =
      body.mode === "write" ? `${body.reason} — Schreibzugriff: ${body.writeReason}` : body.reason;
    const session = await startSupportSession({
      operatorId: ctx.user.id,
      operatorEmail: ctx.user.email,
      orgId: tenant.id,
      orgName: tenant.name,
      reason,
      mode: body.mode,
      grant,
    });

    // Fail closed: without the entry in the firm's own audit trail the
    // session does not stay open.
    const recorded = await writeFirmVisibleSupportAuditEntry(
      tenant.brainId,
      "support.session_start",
      session
    );
    if (!recorded) {
      await endSupportSession(ctx.user.id);
      return apiError(
        "support_audit_unavailable",
        "Support-Zugriff nicht gestartet: Der Protokolleintrag für die Kanzlei konnte nicht gespeichert werden.",
        503
      );
    }

    void logAudit("support.session_start", "org", {
      entityId: tenant.id,
      brainId: tenant.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: {
        reason: session.reason,
        mode: session.mode,
        orgName: tenant.name,
        expiresAt: session.expiresAt,
        grantExpiresAt: grant.expiresAt,
        grantedBy: grant.grantedByEmail,
      },
    });

    return apiSuccess({ session: publicSession(session) }, undefined, 201);
  }
);
