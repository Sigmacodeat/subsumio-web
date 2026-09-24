import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { sendFirmMail } from "@/lib/firm-mail";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { signPortalToken, verifyPortalToken } from "@/lib/portal-token";
import { registerPortalLink } from "@/lib/portal-links";

export const dynamic = "force-dynamic";

const sendLinkSchema = z.object({
  case_slug: z.string().min(1).max(500),
  document_slug: z.string().min(1).max(500),
  document_title: z.string().min(1).max(300),
  document_type: z.enum(["signature_request", "power_of_attorney", "legal_document"]),
  channel: z.enum(["whatsapp", "email", "copy"]),
  recipient_name: z.string().min(1).max(300).optional(),
  recipient_email: z.string().email().optional(),
  recipient_phone: z.string().min(6).max(20).optional(),
  /** Optional: save phone to case contact for future use */
  save_phone_to_contact: z.boolean().optional(),
  contact_slug: z.string().max(300).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: sendLinkSchema,
    audit: (ctx, body) => ({
      action: "email.send" as const,
      entityType: body.document_type,
      entityId: body.document_slug,
      details: {
        channel: body.channel,
        case: body.case_slug,
        document: body.document_slug,
      },
    }),
  },
  async (ctx, body) => {
    // The link opens the client portal for this matter. Refuse before sending
    // anything if the matter is not released for the portal — otherwise the
    // client receives a link that only shows "not enabled".
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.case_slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!caseRes?.ok) {
      return apiError("case_not_found", "Akte nicht gefunden", 404);
    }
    const casePage = (await caseRes.json().catch(() => null)) as {
      frontmatter?: Record<string, unknown>;
    } | null;
    const caseFm = (casePage?.frontmatter ?? {}) as Record<string, unknown>;
    if (caseFm.status === "archived") {
      return apiError("case_archived", "Die Akte ist archiviert.", 409);
    }
    if (!caseFm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Das Mandantenportal ist für diese Akte nicht freigegeben. Bitte zuerst in der Akte aktivieren.",
        409
      );
    }
    const locale: "de" | "en" = caseFm.locale === "en" || caseFm.language === "en" ? "en" : "de";

    // Generate portal token + deep link
    const token = await signPortalToken(body.case_slug, undefined, ctx.brainId);

    // Registry entry (hash only) — the firm can list and revoke this link
    // later even after the URL has left the screen.
    const issued = await verifyPortalToken(token);
    await registerPortalLink(ctx.headers, body.case_slug, {
      token,
      created_at: new Date().toISOString(),
      created_by: ctx.user.email,
      expires_at: new Date((issued?.exp ?? 0) * 1000 || Date.now()).toISOString(),
      purpose: `sign:${body.document_slug}`,
    });
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.subsum.io";
    const portalUrl = `${baseUrl}/portal/${token}?sign=${encodeURIComponent(body.document_slug)}&type=${body.document_type}`;

    // Mark the document as sent and stamp the matter — the portal only offers
    // documents whose case_slug matches the token's matter.
    const docUpdate = await enginePatchPage(
      ctx.headers,
      {
        slug: body.document_slug,
        frontmatter: {
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_via: body.channel,
          portal_url: portalUrl,
          case_slug: body.case_slug,
        },
      },
      { timeoutMs: 10_000 }
    );
    if (!docUpdate.ok) {
      return apiError("document_not_updated", "Dokument konnte nicht aktualisiert werden", 502);
    }

    if (body.save_phone_to_contact && body.contact_slug && body.recipient_phone) {
      await enginePatchPage(
        ctx.headers,
        { slug: body.contact_slug, frontmatter: { phone: body.recipient_phone } },
        { timeoutMs: 10_000 }
      ).catch(() => null);
    }

    const recipientName = body.recipient_name || (locale === "en" ? "Client" : "Mandant");
    const htmlName = escapeHtml(recipientName);
    const htmlTitle = escapeHtml(body.document_title);
    const messageText =
      locale === "en"
        ? `Hello ${recipientName},\n\nYou have a document to sign:\n${body.document_title}\n\nPlease open the following link and sign directly:\n${portalUrl}\n\nBest regards`
        : `Hallo ${recipientName},\n\nSie haben ein Dokument zur Unterschrift:\n${body.document_title}\n\nBitte öffnen Sie folgenden Link und unterschreiben Sie direkt:\n${portalUrl}\n\nMit freundlichen Grüßen`;

    if (body.channel === "copy") {
      return apiSuccess({ url: portalUrl, channel: "copy" });
    }

    if (body.channel === "email") {
      if (!body.recipient_email) {
        return apiError("validation_error", "recipient_email required for email channel", 400);
      }
      const subject =
        locale === "en"
          ? `Document to sign: ${body.document_title}`
          : `Dokument zur Unterschrift: ${body.document_title}`;
      const html =
        locale === "en"
          ? `<p>Hello ${htmlName},</p><p>You have a document to sign:</p><p><strong>${htmlTitle}</strong></p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:hsl(230, 60%, 52%);color:#fff;text-decoration:none;border-radius:8px;">Sign document</a></p><p>Best regards</p>`
          : `<p>Hallo ${htmlName},</p><p>Sie haben ein Dokument zur Unterschrift:</p><p><strong>${htmlTitle}</strong></p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:hsl(230, 60%, 52%);color:#fff;text-decoration:none;border-radius:8px;">Dokument unterschreiben</a></p><p>Mit freundlichen Grüßen</p>`;
      // Same transport as invoices and matter mail: the firm's own SMTP
      // first, platform fallback second — a signature request must arrive
      // from the firm the client knows, not a generic platform address.
      const settings = await loadKanzleiSettingsForBrain(ctx.brainId);
      const result = await sendFirmMail(settings, {
        to: body.recipient_email,
        subject,
        text: messageText,
        html,
      });
      if (!result.sent) {
        return apiError("mail_send_failed", result.error ?? "Mail send failed", 502);
      }
      return apiSuccess({ url: portalUrl, channel: "email", via: result.via });
    }

    if (body.channel === "whatsapp") {
      if (!body.recipient_phone) {
        return apiError("validation_error", "recipient_phone required for whatsapp channel", 400);
      }
      // Use proactive send (respects consent + 24h window + quiet hours)
      const result = await sendProactiveMessage({
        to: body.recipient_phone,
        freeform: messageText,
        scope: "client_reminder",
        brainId: ctx.brainId,
      });
      if (!result.sent) {
        return apiError(
          "whatsapp_send_failed",
          result.decision.reason ?? "WhatsApp send failed",
          502
        );
      }
      return apiSuccess({ url: portalUrl, channel: "whatsapp", messageId: result.messageId });
    }

    return apiError("validation_error", "invalid channel", 400);
  }
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
