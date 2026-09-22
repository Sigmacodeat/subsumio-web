import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { isSmsConfigured, SMS_MAX_BODY } from "@/lib/sms/twilio";
import { sendGuardedSms } from "@/lib/sms/guarded-send";
import { normalizePhone } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import type { OutboundScope } from "@/lib/whatsapp/outbound-gate";

const scopeEnum = z.enum([
  "daily_briefing",
  "deadline_alert",
  "approval_request",
  "conflict_alert",
  "new_document",
  "client_reminder",
  "appointment_reminder",
]);

const sendSchema = z.object({
  to: z.string().min(5, "recipient_required").max(30),
  message: z.string().min(1, "message_required").max(SMS_MAX_BODY, "message_too_long"),
  scope: scopeEnum.default("client_reminder"),
  urgent: z.boolean().optional(),
});

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: sendSchema,
    audit: (ctx, body) => ({
      action: "sms.outbound_sent" as const,
      entityType: "sms_message",
      details: {
        toHash: phoneHash(normalizePhone(body.to)),
        scope: body.scope,
        sentBy: ctx.user.email,
      },
    }),
  },
  async (ctx, body) => {
    if (!isSmsConfigured()) {
      return apiError(
        "sms_not_configured",
        "SMS ist nicht konfiguriert (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER oder TWILIO_MESSAGING_SERVICE_SID fehlt)",
        503
      );
    }
    const normalized = normalizePhone(body.to);
    const result = await sendGuardedSms({
      to: normalized,
      brainId: ctx.brainId,
      scope: body.scope as OutboundScope,
      body: body.message,
      urgent: body.urgent === true,
      quietHours: { startHour: 21, endHour: 8, localHour: new Date().getHours() },
    });
    if (!result.sent) {
      const status = result.reason === "not_configured" ? 503 : 403;
      return apiError(
        `sms_blocked`,
        `SMS-Versand geblockt: ${result.reason}${result.providerError ? ` (${result.providerError})` : ""}`,
        status
      );
    }
    return Response.json({ ok: true, sid: result.sid, sentTo: normalized.slice(-4) });
  }
);
