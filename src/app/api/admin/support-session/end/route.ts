import { createHandler, apiSuccess } from "@/lib/api-handler";
import { getTenant } from "@/lib/tenants";
import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import { endSupportSession } from "@/lib/support-session";
import { writeFirmVisibleSupportAuditEntry } from "@/lib/support-session-audit";

export const dynamic = "force-dynamic";

/**
 * Ends the CALLER's own active support session — never another operator's
 * (there is no session id in the request; endSupportSession() only ever acts
 * on ctx.user.id). Reachable from both the ops console and the firm dashboard
 * the operator is browsing (see the platform.support_session host-lock
 * exemption in src/lib/api-handler.ts).
 */
export const POST = createHandler(
  {
    action: "platform.support_session",
    rateTier: "standard",
  },
  async (ctx) => {
    const ended = await endSupportSession(ctx.user.id);
    if (!ended) return apiSuccess({ session: null });

    const tenant = await getTenant(ended.orgId);
    void logAudit("support.session_end", "org", {
      entityId: ended.orgId,
      brainId: tenant?.brainId ?? SYSTEM_BRAIN,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { reason: ended.reason, orgName: ended.orgName, startedAt: ended.startedAt },
    });
    if (tenant) {
      void writeFirmVisibleSupportAuditEntry(tenant.brainId, "support.session_end", ended);
    }

    return apiSuccess({ session: null });
  }
);
