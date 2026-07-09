import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { createWhatsAppClientInvite } from "@/lib/whatsapp/client-verification";

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  phone: z.string().min(6, "phone_required").max(40),
  caseSlug: z.string().min(1, "case_slug_required").max(500),
  clientName: z.string().max(160).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: inviteSchema,
    audit: (ctx, body) => ({
      action: "case.update",
      entityType: "whatsapp_client_invite",
      entityId: body.caseSlug,
      details: {
        phoneLast4: body.phone.slice(-4),
        clientName: body.clientName,
        invitedBy: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    if (!body.caseSlug.startsWith("legal/cases/")) {
      return apiError(
        "invalid_case_slug",
        "WhatsApp-Mandantenfreigabe muss auf eine Akte zeigen.",
        400
      );
    }

    try {
      const invite = await createWhatsAppClientInvite({
        brainId: ctx.brainId,
        orgId: ctx.user.orgId || ctx.brainId,
        phone: body.phone,
        caseSlug: body.caseSlug,
        clientName: body.clientName,
        invitedByUserId: ctx.user.id,
        invitedByName: ctx.user.name || ctx.user.email,
      });

      return Response.json({
        ok: true,
        inviteSlug: invite.inviteSlug,
        identity: {
          id: invite.identity.id,
          role: invite.identity.role,
          matterScope: invite.identity.matterScope,
          status: invite.identity.status,
          verifiedAt: invite.identity.verifiedAt,
          phoneHash: invite.identity.phoneHash,
        },
        expiresAt: invite.expiresAt,
        message: invite.message,
      });
    } catch (err) {
      console.error(
        "[whatsapp/client-invites] create failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "invite_failed",
        "WhatsApp-Mandantenfreigabe konnte nicht erstellt werden",
        500
      );
    }
  }
);
