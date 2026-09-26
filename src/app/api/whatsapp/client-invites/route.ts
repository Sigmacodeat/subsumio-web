import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  createWhatsAppClientInvite,
  WhatsAppInviteConflictError,
} from "@/lib/whatsapp/client-verification";
import { caseAccessAllowed, caseAccessForUser } from "@/lib/email/case-link";
import { readCurrentPage } from "@/lib/page-write-guards";
import { ENGINE_URL } from "@/lib/engine";
import { getOrgStore } from "@/lib/auth/store";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { phoneCountryFor } from "@/lib/whatsapp/types";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";

import { logger } from "@/lib/logger";
const log = logger("api/whatsapp/client-invites");

export const dynamic = "force-dynamic";

const inviteSchema = z.object({
  phone: z.string().min(6, "phone_required").max(40),
  caseSlug: z.string().min(1, "case_slug_required").max(500),
  clientName: z.string().max(160).optional(),
});

/** Roles that may see an invitation code on screen to hand it over themselves. */
const CODE_VIEWER_ROLES = new Set(["admin", "lawyer"]);

/** Approved Business-API template that carries the code: body {{1}} = firm, {{2}} = code. */
function inviteTemplateName(): string | null {
  const name = process.env.WHATSAPP_CLIENT_INVITE_TEMPLATE?.trim();
  if (!name || !process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return null;
  }
  return name;
}

async function firmNameFor(brainId: string, orgId: string | null | undefined): Promise<string> {
  const settings = await loadKanzleiSettingsForBrain(brainId, { timeoutMs: 5_000 }).catch(
    () => null
  );
  if (settings?.kanzleiName?.trim()) return settings.kanzleiName.trim();
  const org = orgId
    ? await getOrgStore()
        .getById(orgId)
        .catch(() => null)
    : null;
  return org?.name?.trim() || "Ihre Kanzlei";
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: inviteSchema,
    audit: (ctx, body) => ({
      action: "whatsapp.client_invite",
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

    // The inviting person must be able to work on this matter (walls, matter
    // team — read with their own identity), and the matter must be open.
    const access = await caseAccessForUser(ctx.headers, body.caseSlug, ctx.user.id);
    if (!caseAccessAllowed(access)) {
      return apiError("case_not_found", "Akte nicht gefunden.", 404);
    }
    const read = await readCurrentPage(ENGINE_URL, ctx.headers, body.caseSlug);
    if (read.kind !== "found") {
      return apiError("case_not_found", "Akte nicht gefunden.", 404);
    }
    if (read.page.frontmatter?.status === "archived") {
      return apiError("case_archived", "Die Akte ist archiviert.", 409);
    }

    // The code reaches the client directly over the business number when a
    // template is set up; otherwise only a lawyer/admin may see it to hand it
    // over (never other staff).
    const templateName = inviteTemplateName();
    const mayViewCode = CODE_VIEWER_ROLES.has(ctx.user.role);
    if (!templateName && !mayViewCode) {
      return apiError(
        "invite_code_delivery_unavailable",
        "Einladungen mit Bestätigungscode können nur Anwält:innen oder die Administration erstellen, solange kein WhatsApp-Einladungstemplate eingerichtet ist.",
        403
      );
    }

    try {
      const firmName = await firmNameFor(ctx.brainId, ctx.user.orgId);
      const invite = await createWhatsAppClientInvite({
        brainId: ctx.brainId,
        orgId: ctx.user.orgId || ctx.brainId,
        phone: body.phone,
        caseSlug: body.caseSlug,
        clientName: body.clientName,
        firmName,
        defaultCountry: phoneCountryFor(ctx.user.jurisdiction),
        invitedByUserId: ctx.user.id,
        invitedByName: ctx.user.name || ctx.user.email,
      });

      let delivered: "whatsapp_template" | null = null;
      if (templateName) {
        try {
          await sendWhatsAppTemplate(invite.identity.phone, {
            name: templateName,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "de" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: firmName },
                  { type: "text", text: invite.code },
                ],
              },
            ],
          });
          delivered = "whatsapp_template";
        } catch (err) {
          log.error(
            "[whatsapp/client-invites] template delivery failed:",
            err instanceof Error ? err.message : String(err)
          );
        }
      }
      if (!delivered && !mayViewCode) {
        return apiError(
          "invite_delivery_failed",
          "Der Bestätigungscode konnte nicht per WhatsApp zugestellt werden. Bitte später erneut versuchen oder Anwalt/Administration einbinden.",
          502
        );
      }

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
        delivered,
        // The code only leaves the server when it was not delivered directly
        // and the person asking may hand it over.
        ...(delivered ? {} : { message: invite.message }),
      });
    } catch (err) {
      if (err instanceof WhatsAppInviteConflictError) {
        return apiError(err.code, err.message, 409);
      }
      log.error(
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
