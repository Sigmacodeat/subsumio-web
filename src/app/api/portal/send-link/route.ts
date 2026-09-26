import { mayIssuePortalLink, PORTAL_LINK_FORBIDDEN } from "@/lib/portal-link-issue";
import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { sendFirmMail } from "@/lib/firm-mail";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { signPortalToken, verifyPortalToken } from "@/lib/portal-token";
import { registerPortalLink } from "@/lib/portal-links";

export const dynamic = "force-dynamic";

/** Documents in these states are no longer open for a signature. */
const CLOSED_STATUSES = new Set(["signed", "declined", "expired", "revoked"]);

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
    // Channel requirements first: nothing is issued, stored or marked for a
    // request that cannot be delivered.
    if (body.channel === "email" && !body.recipient_email) {
      return apiError("validation_error", "Bitte eine E-Mail-Adresse angeben.", 400);
    }
    if (body.channel === "whatsapp" && !body.recipient_phone) {
      return apiError("validation_error", "Bitte eine Telefonnummer angeben.", 400);
    }

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
    if (!mayIssuePortalLink(ctx.user, caseFm)) {
      return apiError(PORTAL_LINK_FORBIDDEN.error, PORTAL_LINK_FORBIDDEN.message, 403);
    }
    if (!caseFm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Das Mandantenportal ist für diese Akte nicht freigegeben. Bitte zuerst in der Akte aktivieren.",
        409
      );
    }
    const locale: "de" | "en" = caseFm.locale === "en" || caseFm.language === "en" ? "en" : "de";

    // The document must exist, be open, and belong to this matter (or to
    // none yet) — a document of another matter is never re-assigned here.
    const docRes = await fetch(
      `${ENGINE_URL}/api/pages/${encodeURIComponent(body.document_slug)}`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    ).catch(() => null);
    if (!docRes?.ok) {
      return apiError("document_not_found", "Dokument nicht gefunden", 404);
    }
    const docPage = (await docRes.json().catch(() => null)) as {
      frontmatter?: Record<string, unknown>;
    } | null;
    const docFm = (docPage?.frontmatter ?? {}) as Record<string, unknown>;
    const docCase = typeof docFm.case_slug === "string" ? docFm.case_slug : "";
    if (docCase && docCase !== body.case_slug) {
      return apiError("document_case_mismatch", "Das Dokument gehört zu einer anderen Akte.", 409);
    }
    if (CLOSED_STATUSES.has(String(docFm.status ?? ""))) {
      return apiError(
        "document_closed",
        "Dieses Dokument ist nicht mehr zur Unterschrift offen.",
        409
      );
    }

    // Generate portal token + deep link. The token is only ever handed to the
    // recipient — it is not stored anywhere readable (the registry keeps its
    // hash).
    const token = await signPortalToken(body.case_slug, undefined, ctx.brainId);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.subsum.io";
    const portalUrl = `${baseUrl}/portal/${token}?sign=${encodeURIComponent(body.document_slug)}&type=${body.document_type}`;

    const recipientName = body.recipient_name || (locale === "en" ? "Client" : "Mandant");
    const htmlName = escapeHtml(recipientName);
    const htmlTitle = escapeHtml(body.document_title);
    const messageText =
      locale === "en"
        ? `Hello ${recipientName},\n\nYou have a document to sign:\n${body.document_title}\n\nPlease open the following link and sign directly:\n${portalUrl}\n\nBest regards`
        : `Hallo ${recipientName},\n\nSie haben ein Dokument zur Unterschrift:\n${body.document_title}\n\nBitte öffnen Sie folgenden Link und unterschreiben Sie direkt:\n${portalUrl}\n\nMit freundlichen Grüßen`;

    // Deliver first; only a delivered (or copied) link is registered and marks
    // the document as sent.
    let delivery: Record<string, unknown>;
    if (body.channel === "copy") {
      delivery = { channel: "copy" };
    } else if (body.channel === "email") {
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
        to: body.recipient_email as string,
        subject,
        text: messageText,
        html,
      });
      if (!result.sent) {
        return apiError(
          "mail_send_failed",
          result.error ?? "Die E-Mail konnte nicht versendet werden.",
          502
        );
      }
      delivery = { channel: "email", via: result.via };
    } else {
      // Use proactive send (respects consent + 24h window + quiet hours)
      const result = await sendProactiveMessage({
        to: body.recipient_phone as string,
        freeform: messageText,
        scope: "client_reminder",
        brainId: ctx.brainId,
      });
      if (!result.sent) {
        return apiError(
          "whatsapp_send_failed",
          result.decision.reason ?? "Die WhatsApp-Nachricht konnte nicht versendet werden.",
          502
        );
      }
      delivery = { channel: "whatsapp", messageId: result.messageId };
    }

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

    // Mark the document as sent and stamp the matter — the portal only offers
    // documents whose case_slug matches the token's matter. No link or token
    // is stored on the document (an older stored link is cleared).
    const docUpdate = await enginePatchPage(
      ctx.headers,
      {
        slug: body.document_slug,
        frontmatter: {
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_via: body.channel,
          portal_url: null,
          case_slug: body.case_slug,
        },
      },
      { timeoutMs: 10_000 }
    ).catch(() => null);

    if (body.save_phone_to_contact && body.contact_slug && body.recipient_phone) {
      await enginePatchPage(
        ctx.headers,
        { slug: body.contact_slug, frontmatter: { phone: body.recipient_phone } },
        { timeoutMs: 10_000 }
      ).catch(() => null);
    }

    return apiSuccess({
      url: portalUrl,
      ...delivery,
      // The link went out; only the status could not be recorded.
      document_updated: docUpdate?.ok === true,
    });
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
