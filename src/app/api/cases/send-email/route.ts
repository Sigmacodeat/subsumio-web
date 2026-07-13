import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { sendMail } from "@/lib/mail";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { generateTrackingId, logTrackingEvent } from "@/lib/email/tracking";
import {
  assertOutputActionAllowed,
  VerificationPolicyError,
  buildPolicyOutput,
  type AttorneyOverride,
} from "@/lib/verification-policy";

const sendEmailSchema = z.object({
  to: z.string().email(),
  cc: z.string().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50_000),
  caseSlug: z.string().optional(),
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

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: sendEmailSchema,
    audit: (ctx, body) => ({
      action: "email.send" as const,
      entityType: "email",
      details: { to: body.to, subject: body.subject, caseSlug: body.caseSlug },
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

    const settings = await loadKanzleiSettings();
    const _fromName = settings.kanzleiName || settings.anwaltName || "Subsumio";
    const fromEmail = settings.emailFrom || process.env.MAIL_FROM || "noreply@subsumio.local";

    const trackingId = generateTrackingId();
    const html = `<p style="font-family: sans-serif; white-space: pre-wrap;">${body.body.replace(/\n/g, "<br>")}</p>`;

    const result = await sendMail({
      to: body.to,
      cc: body.cc,
      subject: body.subject,
      html,
      replyTo: fromEmail,
      trackingId,
    });

    if (result.sent) {
      void logTrackingEvent({
        trackingId,
        eventType: "delivered",
        raw: { source: "case_email", route: "send", recipient: body.to, caseSlug: body.caseSlug },
      });
    }

    return Response.json({
      ok: result.sent,
      sent: result.sent,
      error: result.error,
      trackingId: result.trackingId,
    });
  }
);
