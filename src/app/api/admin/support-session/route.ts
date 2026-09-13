import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getOrgStore } from "@/lib/auth/store";
import { logAudit } from "@/lib/audit";
import {
  getActiveSupportSession,
  startSupportSession,
  type SupportSession,
} from "@/lib/support-session";
import { writeFirmVisibleSupportAuditEntry } from "@/lib/support-session-audit";

export const dynamic = "force-dynamic";

const startSchema = z.object({
  orgId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(10, "Bitte einen aussagekräftigen Grund angeben (min. 10 Zeichen).")
    .max(500),
});

function publicSession(s: SupportSession) {
  return {
    orgId: s.orgId,
    orgName: s.orgName,
    reason: s.reason,
    startedAt: s.startedAt,
    expiresAt: s.expiresAt,
  };
}

export const GET = createHandler(
  {
    action: "platform.operator",
    rateTier: "standard",
  },
  async (ctx) => {
    const active = await getActiveSupportSession(ctx.user.id);
    return apiSuccess({ session: active ? publicSession(active) : null });
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
    const org = await getOrgStore().getById(body.orgId);
    if (!org) return apiError("org_not_found", "Kanzlei nicht gefunden", 404);

    const session = await startSupportSession({
      operatorId: ctx.user.id,
      operatorEmail: ctx.user.email,
      orgId: org.id,
      orgName: org.name,
      reason: body.reason,
    });

    void logAudit("support.session_start", "org", {
      entityId: org.id,
      brainId: org.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { reason: session.reason, orgName: org.name, expiresAt: session.expiresAt },
    });
    void writeFirmVisibleSupportAuditEntry(org.brainId, "support.session_start", session);

    return apiSuccess({ session: publicSession(session) }, undefined, 201);
  }
);
