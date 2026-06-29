import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { sendMail } from "@/lib/mail";
import { loadKanzleiSettings } from "@/lib/kanzlei-settings";
import { generateTrackingId, logTrackingEvent } from "@/lib/email/tracking";

const sendEmailSchema = z.object({
  to: z.string().email(),
  cc: z.string().optional(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50_000),
  caseSlug: z.string().optional(),
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
