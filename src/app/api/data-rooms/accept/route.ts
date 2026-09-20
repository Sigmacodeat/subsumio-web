import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { getOrgStore } from "@/lib/auth/store";
import { logAudit } from "@/lib/audit";
import { getDataRoomStore, invitationOpen, normalizeEmail } from "@/lib/data-rooms";
import { tenantIdForUser } from "@/lib/tenants";

export const dynamic = "force-dynamic";

const acceptSchema = z.object({ token: z.string().min(20).max(200) });

/**
 * Accept a data-room invitation. The signed-in account must have exactly the
 * invited e-mail address and belong to another firm; the invitation must be
 * open (not used, revoked or expired). The link works once.
 */
export const POST = createHandler(
  { action: "brain.read", rateTier: "standard", body: acceptSchema },
  async (ctx, body) => {
    const store = getDataRoomStore();
    const member = await store.memberByToken(body.token);
    if (!member || !invitationOpen(member)) {
      return apiError(
        "invitation_invalid",
        "Diese Einladung ist nicht mehr gültig. Bitten Sie die Kanzlei um eine neue.",
        410
      );
    }
    if (normalizeEmail(ctx.user.email) !== member.email) {
      return apiError(
        "wrong_account",
        `Die Einladung gilt für ${member.email}. Bitte melden Sie sich mit dieser Adresse an.`,
        403
      );
    }
    const tenant = tenantIdForUser(ctx.user);
    const room = await store.getRoom(member.roomId);
    if (!tenant || !room) return apiError("forbidden", "Kein Kanzleikonto", 403);
    if (tenant === room.hostTenantId) {
      return apiError(
        "same_firm",
        "Sie gehören zur Kanzlei dieser Akte und sehen sie ohnehin, soweit Ihre Rechte reichen.",
        409
      );
    }
    const org = ctx.user.orgId ? await getOrgStore().getById(ctx.user.orgId) : null;
    const firmName = org?.name ?? (ctx.user.name ? `Kanzlei ${ctx.user.name}` : ctx.user.email);
    await store.activate(member.id, { tenantId: tenant, userId: ctx.user.id, firmName });

    const details = { email: member.email, guest_firm: firmName, host_firm: room.hostFirmName };
    // Both firms keep a record: the host's log and the guest's.
    void logAudit("data_room.accept", "data_room", {
      entityId: room.id,
      brainId: room.hostBrainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details,
    });
    void logAudit("data_room.accept", "data_room", {
      entityId: room.id,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details,
    });
    return apiSuccess({ room_id: room.id });
  }
);
