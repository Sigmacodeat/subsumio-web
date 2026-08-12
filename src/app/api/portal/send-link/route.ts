import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { sendMail } from "@/lib/mail";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { signPortalToken } from "@/lib/portal-token";

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
    // Generate portal token + deep link
    const token = await signPortalToken(body.case_slug, undefined, ctx.brainId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.subsum.io";
    const portalUrl = `${baseUrl}/portal/${token}?sign=${encodeURIComponent(body.document_slug)}&type=${body.document_type}`;

    // Update document status to "sent" + record send metadata
    await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.document_slug)}`, {
      method: "PATCH",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        frontmatter: {
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_via: body.channel,
          portal_url: portalUrl,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // If save_phone_to_contact, update the contact
    if (body.save_phone_to_contact && body.contact_slug && body.recipient_phone) {
      await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.contact_slug)}`, {
        method: "PATCH",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          frontmatter: { phone: body.recipient_phone },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }

    // Determine recipient locale from case frontmatter (default: de)
    let locale: "de" | "en" = "de";
    try {
      const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.case_slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(5_000),
      });
      if (caseRes.ok) {
        const caseData = await caseRes.json();
        const caseFm = (caseData.frontmatter ?? {}) as Record<string, unknown>;
        if (caseFm.locale === "en" || caseFm.language === "en") locale = "en";
      }
    } catch {
      // fallback to de
    }

    const recipientName = body.recipient_name || (locale === "en" ? "Client" : "Mandant");
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
          ? `<p>Hello ${recipientName},</p><p>You have a document to sign:</p><p><strong>${body.document_title}</strong></p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:hsl(230, 60%, 52%);color:#fff;text-decoration:none;border-radius:8px;">Sign document</a></p><p>Best regards</p>`
          : `<p>Hallo ${recipientName},</p><p>Sie haben ein Dokument zur Unterschrift:</p><p><strong>${body.document_title}</strong></p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:hsl(230, 60%, 52%);color:#fff;text-decoration:none;border-radius:8px;">Dokument unterschreiben</a></p><p>Mit freundlichen Grüßen</p>`;
      const result = await sendMail({
        to: body.recipient_email,
        subject,
        text: messageText,
        html,
      });
      if (!result.sent) {
        return apiError("mail_send_failed", result.error ?? "Mail send failed", 502);
      }
      return apiSuccess({ url: portalUrl, channel: "email", mailId: result.id });
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
