import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { escapeHtml } from "@/lib/mail";
import { sendFirmMail } from "@/lib/firm-mail";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { ENGINE_URL } from "@/lib/engine";
import { generateTrackingId, logTrackingEvent } from "@/lib/email/tracking";
import {
  assertOutputActionAllowed,
  VerificationPolicyError,
  buildPolicyOutput,
  type AttorneyOverride,
} from "@/lib/verification-policy";
import type { MailAttachment } from "@/lib/mail";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const sendEmailSchema = z.object({
  to: z.string().email(),
  cc: z.string().email().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50_000),
  caseSlug: z.string().optional(),
  /** Slugs of legal_document pages whose files are attached (max 5). */
  attachment_slugs: z.array(z.string().min(1).max(300)).max(MAX_ATTACHMENTS).optional(),
  verification: z
    .object({
      state: z.enum([
        "VERIFIED",
        "VERIFIED_WITH_WARNINGS",
        "NEEDS_HUMAN_REVIEW",
        "BLOCKED",
        "VERIFIER_ERROR",
      ]),
      content_hash: z.string().length(64),
      receipt_hash: z.string().length(64).optional(),
      override: z
        .object({
          user_id: z.string().min(1),
          reason: z.string().min(10),
          timestamp: z.string().min(1),
          output_hash: z.string().length(64),
        })
        .optional(),
    })
    .optional(),
});

/** Original upload of a document page via the engine file store; falls back to
 *  the extracted text as .md for text-only documents. Returns null when the
 *  document does not exist — callers fail the send rather than silently
 *  dropping an attachment the lawyer selected. */
async function loadAttachment(
  headers: Record<string, string>,
  slug: string
): Promise<MailAttachment | null> {
  const path = slug.split("/").map(encodeURIComponent).join("/");
  const fileRes = await fetch(`${ENGINE_URL}/api/files/${path}`, {
    headers,
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);

  if (fileRes?.ok) {
    const buf = Buffer.from(await fileRes.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_ATTACHMENT_BYTES) return null;
    const filename =
      filenameFromDisposition(fileRes.headers.get("content-disposition")) ??
      `${slug.split("/").pop() ?? "dokument"}.bin`;
    return {
      filename,
      content: buf,
      contentType: fileRes.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  // No stored file → attach the page text so the document is never lost.
  const pageRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!pageRes?.ok) return null;
  const page = (await pageRes.json().catch(() => null)) as {
    title?: string;
    content?: string;
  } | null;
  if (!page || typeof page.content !== "string" || page.content.length === 0) return null;
  const content = Buffer.from(page.content, "utf8");
  if (content.byteLength > MAX_ATTACHMENT_BYTES) return null;
  return {
    filename: `${sanitizeFilename(page.title || slug.split("/").pop() || "dokument")}.md`,
    content,
    contentType: "text/markdown; charset=utf-8",
  };
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return sanitizeFilename(decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")));
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  if (plain) return sanitizeFilename(plain[1].trim());
  return null;
}

function sanitizeFilename(name: string): string {
  const clean = name.replace(/[^\w.\- äöüÄÖÜßéèê]/g, "_").slice(0, 120);
  return clean || "dokument";
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: sendEmailSchema,
    audit: (ctx, body) => ({
      action: "email.send" as const,
      entityType: "email",
      details: {
        to: body.to,
        subject: body.subject,
        caseSlug: body.caseSlug,
        attachments: body.attachment_slugs?.length ?? 0,
      },
    }),
  },
  async (ctx, body) => {
    // ── Verification policy check (send_client) ──
    if (body.verification) {
      const output = buildPolicyOutput(
        body.caseSlug || body.subject || "client-email",
        body.verification.state,
        body.verification.content_hash,
        { receipt_hash: body.verification.receipt_hash, title: body.subject }
      );
      try {
        await assertOutputActionAllowed(
          output,
          "send_client",
          { user_id: ctx.user.id, user_email: ctx.user.email, brain_id: ctx.brainId },
          body.verification.override as AttorneyOverride | undefined
        );
      } catch (err) {
        if (err instanceof VerificationPolicyError) {
          return Response.json(
            { error: "verification_denied", reason: err.decision.reason },
            { status: 403 }
          );
        }
        throw err;
      }
    }

    // Attachments are resolved server-side — the client only names slugs, so
    // no file content crosses the trust boundary.
    const attachments: MailAttachment[] = [];
    let totalBytes = 0;
    for (const slug of body.attachment_slugs ?? []) {
      const att = await loadAttachment(ctx.headers, slug);
      if (!att) {
        return apiError(
          "attachment_unavailable",
          `Anhang nicht verfügbar oder zu groß: ${slug}`,
          400
        );
      }
      totalBytes += att.content.byteLength;
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        return apiError(
          "attachments_too_large",
          "Anhänge überschreiten insgesamt 20 MB — bitte weniger oder kleinere Dateien wählen.",
          400
        );
      }
      attachments.push(att);
    }

    // Settings decide the channel: firm SMTP when configured, Resend as the
    // fallback. Unreadable settings → Resend (delivery over preference).
    const settings = await loadKanzleiSettingsForBrain(ctx.brainId).catch(() => null);
    const fromEmail = settings?.emailFrom || process.env.MAIL_FROM || "noreply@subsumio.local";

    const trackingId = generateTrackingId();
    const html = `<p style="font-family: sans-serif; white-space: pre-wrap;">${escapeHtml(body.body).replace(/\n/g, "<br>")}</p>`;

    const result = await sendFirmMail(settings, {
      to: body.to,
      cc: body.cc,
      subject: body.subject,
      html,
      replyTo: fromEmail,
      trackingId,
      attachments,
    });

    if (result.sent) {
      void logTrackingEvent({
        trackingId,
        eventType: "delivered",
        raw: {
          source: "case_email",
          route: "send",
          recipient: body.to,
          caseSlug: body.caseSlug,
          via: result.via,
          attachments: attachments.length,
        },
      });
    }

    return Response.json({
      ok: result.sent,
      sent: result.sent,
      via: result.via,
      error: result.error,
      trackingId: result.trackingId,
    });
  }
);
