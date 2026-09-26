import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { getTenant } from "@/lib/tenants";
import {
  TenantAdminFailure,
  reactivateTenant,
  setMemberRole,
  suspendTenant,
  tenantAdminMessage,
  transferOwnership,
} from "@/lib/tenant-admin";
import { cancelFirmDeletion, FirmDeletionRefused, scheduleFirmDeletion } from "@/lib/firm-deletion";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suspend"),
    reason: z
      .string()
      .trim()
      .min(10, "Bitte einen aussagekräftigen Grund angeben (mind. 10 Zeichen).")
      .max(500),
  }),
  z.object({ action: z.literal("reactivate") }),
  z.object({
    action: z.literal("set_role"),
    userId: z.string().min(1),
    role: z.enum(["admin", "lawyer", "assistant", "client_viewer"]),
  }),
  z.object({ action: z.literal("transfer_owner"), userId: z.string().min(1) }),
  z.object({
    action: z.literal("schedule_deletion"),
    reason: z
      .string()
      .trim()
      .min(10, "Bitte einen aussagekräftigen Grund angeben (mind. 10 Zeichen).")
      .max(500),
  }),
  z.object({ action: z.literal("cancel_deletion") }),
]);

const AUDIT_ACTION = {
  suspend: "admin.tenant_suspend",
  reactivate: "admin.tenant_reactivate",
  set_role: "admin.tenant_role_change",
  transfer_owner: "admin.tenant_owner_transfer",
  schedule_deletion: "admin.tenant_deletion_scheduled",
  cancel_deletion: "admin.tenant_deletion_cancelled",
} as const;

/**
 * Operator actions on one firm (a team or a solo practice, see
 * src/lib/tenants.ts). Ops host only, like every platform.operator route.
 */
export const PATCH = createHandler(
  {
    action: "platform.operator",
    rateTier: "standard",
    body: bodySchema,
  },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const tenant = await getTenant(decodeURIComponent(id));
    if (!tenant) return apiError("tenant_not_found", "Kanzlei nicht gefunden", 404);

    try {
      let result: Record<string, unknown> = {};
      if (body.action === "suspend") {
        result = await suspendTenant(tenant, {
          reason: body.reason,
          operatorEmail: ctx.user.email,
        });
      } else if (body.action === "reactivate") {
        result = await reactivateTenant(tenant);
      } else if (body.action === "set_role") {
        const user = await setMemberRole(tenant, body.userId, body.role);
        result = { userId: user.id, role: user.role };
      } else if (body.action === "transfer_owner") {
        await transferOwnership(tenant, body.userId);
        result = { ownerId: body.userId };
      } else if (body.action === "schedule_deletion") {
        // Contract ended: data deletion after the grace period (holds,
        // retention and open matters checked now and again at the purge).
        result = await scheduleFirmDeletion(tenant, {
          reason: body.reason,
          operatorEmail: ctx.user.email,
        });
      } else {
        result = await cancelFirmDeletion(tenant);
      }

      void logAudit(AUDIT_ACTION[body.action], "org", {
        entityId: tenant.id,
        brainId: tenant.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: { ...body, tenantName: tenant.name, ...result },
      });
      return apiSuccess({ ok: true, ...result });
    } catch (err) {
      if (err instanceof TenantAdminFailure) {
        return apiError(err.code, tenantAdminMessage(err.code), 409);
      }
      if (err instanceof FirmDeletionRefused) {
        return apiError(err.code, err.message, err.status);
      }
      throw err;
    }
  }
);
