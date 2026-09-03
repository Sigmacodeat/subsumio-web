import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { sendWhatsAppInteractive, sendWhatsAppMedia } from "@/lib/whatsapp/send";
import { sendWhatsAppFlow } from "@/lib/whatsapp/flow-send";
import { sendGuardedWhatsAppMessage, sendProactiveMessage } from "@/lib/whatsapp/proactive-send";
import { loadAllowedSenders, resolveSender, phoneHash } from "@/lib/whatsapp/verify";
import { getWhatsAppIdentityStore } from "@/lib/whatsapp/identity-store";
import { normalizePhone, type WhatsAppTemplateMessage } from "@/lib/whatsapp/types";
import type { OutboundScope } from "@/lib/whatsapp/outbound-gate";

const sendSchema = z
  .object({
    to: z.string().min(1, "recipient_required").optional(),
    to_phone_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, "recipient_hash_invalid")
      .optional(),
    type: z.enum(["text", "template", "interactive", "media", "flow"]).default("text"),
    scope: z
      .enum([
        "daily_briefing",
        "deadline_alert",
        "approval_request",
        "conflict_alert",
        "new_document",
        "client_reminder",
        "appointment_reminder",
      ])
      .default("client_reminder"),
    urgent: z.boolean().optional(),

    // text
    message: z.string().min(1, "message_required").max(3900, "message_too_long").optional(),

    // template
    template: z
      .object({
        name: z.string().min(1).max(200),
        language: z.object({ code: z.string().min(1).max(10) }),
        components: z
          .array(
            z.object({
              type: z.enum(["header", "body", "button"]),
              sub_type: z.string().max(50).optional(),
              index: z.string().max(10).optional(),
              parameters: z
                .array(
                  z
                    .object({
                      type: z.enum(["text", "currency", "date_time", "image", "document", "video"]),
                      text: z.string().max(1000).optional(),
                    })
                    .passthrough()
                )
                .max(50),
            })
          )
          .max(20)
          .optional(),
      })
      .optional(),

    // interactive (buttons or list)
    interactive: z
      .object({
        type: z.enum(["button", "list"]),
        body: z.object({ text: z.string().max(4000) }),
        action: z.record(z.unknown()),
        header: z.object({ type: z.literal("text"), text: z.string().max(1000) }).optional(),
        footer: z.object({ text: z.string().max(1000) }).optional(),
      })
      .passthrough()
      .optional(),

    // media
    media: z
      .object({
        type: z.enum(["image", "document", "audio", "video", "sticker"]),
        mediaId: z.string().max(200).optional(),
        link: z.string().url().optional(),
        caption: z.string().max(1024).optional(),
        filename: z.string().max(240).optional(),
      })
      .optional(),

    // flow
    flow: z
      .object({
        flowToken: z.string().min(1).max(200),
        flowName: z.string().max(200).optional(),
        flowId: z.string().max(200).optional(),
        flowCta: z.string().min(1).max(20),
        headerText: z.string().max(60).optional(),
        bodyText: z.string().min(1).max(1024),
        footerText: z.string().max(60).optional(),
        initialScreen: z.string().optional(),
        initialData: z.record(z.unknown()).optional(),
      })
      .optional(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (!value.to && !value.to_phone_hash) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "recipient_required" });
    }
  });

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "standard",
    body: sendSchema,
    audit: (ctx, body) => ({
      action: "settings.update" as const,
      entityType: "whatsapp_message",
      details: {
        to: body.to?.slice(-4),
        toPhoneHash: body.to_phone_hash,
        type: body.type,
        sentBy: ctx.user.email,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      return apiError(
        "whatsapp_not_configured",
        "WhatsApp ist nicht konfiguriert (WHATSAPP_ACCESS_TOKEN oder WHATSAPP_PHONE_NUMBER_ID fehlt)",
        503
      );
    }

    const requestedHash = body.to_phone_hash?.toLowerCase();
    const identityStore = getWhatsAppIdentityStore();
    const storedIdentity = requestedHash
      ? await identityStore.getByPhoneHash(requestedHash).catch(() => null)
      : await identityStore.getByPhoneHash(phoneHash(normalizePhone(body.to!))).catch(() => null);
    const normalizedTo = storedIdentity?.phone ?? normalizePhone(body.to!);
    const envSender = resolveSender(normalizedTo);
    const storedAllowed = Boolean(
      storedIdentity &&
      storedIdentity.status === "active" &&
      storedIdentity.orgId === (ctx.user.orgId || ctx.brainId)
    );
    const envAllowed = loadAllowedSenders().some(
      (sender) =>
        sender.brainId === ctx.brainId &&
        phoneHash(normalizePhone(sender.phone)) === phoneHash(normalizedTo)
    );
    if (!envSender && !storedAllowed && !envAllowed) {
      return apiError(
        "recipient_not_allowed",
        "Empfänger ist nicht in der Liste der erlaubten WhatsApp-Teilnehmer",
        403
      );
    }

    try {
      switch (body.type) {
        case "text": {
          if (!body.message) return apiError("message_required", "Text-Nachricht fehlt", 400);
          const result = await sendProactiveMessage({
            to: normalizedTo,
            brainId: ctx.brainId,
            scope: body.scope as OutboundScope,
            freeform: body.message,
            urgent: body.urgent === true,
          });
          if (!result.sent) {
            return apiError(
              "whatsapp_blocked",
              `WhatsApp-Versand geblockt: ${result.decision.reason ?? "blocked"}`,
              403
            );
          }
          return Response.json({
            ok: true,
            type: "text",
            messageId: result.messageId,
            sentTo: normalizedTo.slice(-4),
          });
        }
        case "template": {
          if (!body.template) return apiError("template_required", "Template fehlt", 400);
          const result = await sendProactiveMessage({
            to: normalizedTo,
            brainId: ctx.brainId,
            scope: body.scope as OutboundScope,
            template: body.template as WhatsAppTemplateMessage,
            urgent: body.urgent === true,
          });
          if (!result.sent) {
            return apiError(
              "whatsapp_blocked",
              `WhatsApp-Versand geblockt: ${result.decision.reason ?? "blocked"}`,
              403
            );
          }
          return Response.json({
            ok: true,
            type: "template",
            messageId: result.messageId,
            sentTo: normalizedTo.slice(-4),
          });
        }
        case "interactive": {
          if (!body.interactive)
            return apiError("interactive_required", "Interactive message fehlt", 400);
          const result = await sendGuardedWhatsAppMessage({
            to: normalizedTo,
            brainId: ctx.brainId,
            scope: body.scope as OutboundScope,
            messageKind: "freeform",
            send: () => sendWhatsAppInteractive(normalizedTo, body.interactive as never),
            urgent: body.urgent === true,
          });
          if (!result.sent) return apiError("whatsapp_blocked", "WhatsApp-Versand geblockt", 403);
          return Response.json({
            ok: true,
            type: "interactive",
            messageId: result.messageId,
            sentTo: normalizedTo.slice(-4),
          });
        }
        case "media": {
          if (!body.media) return apiError("media_required", "Media fehlt", 400);
          if (!body.media.mediaId && !body.media.link) {
            return apiError("media_id_or_link_required", "Media ID oder Link erforderlich", 400);
          }
          const result = await sendGuardedWhatsAppMessage({
            to: normalizedTo,
            brainId: ctx.brainId,
            scope: body.scope as OutboundScope,
            messageKind: "freeform",
            send: () => sendWhatsAppMedia(normalizedTo, body.media!),
            urgent: body.urgent === true,
          });
          if (!result.sent) return apiError("whatsapp_blocked", "WhatsApp-Versand geblockt", 403);
          return Response.json({
            ok: true,
            type: "media",
            messageId: result.messageId,
            sentTo: normalizedTo.slice(-4),
          });
        }
        case "flow": {
          if (!body.flow) return apiError("flow_required", "Flow fehlt", 400);
          const result = await sendGuardedWhatsAppMessage({
            to: normalizedTo,
            brainId: ctx.brainId,
            scope: body.scope as OutboundScope,
            messageKind: "freeform",
            send: () =>
              sendWhatsAppFlow({
                to: normalizedTo,
                flowToken: body.flow!.flowToken,
                flowName: body.flow!.flowName,
                flowId: body.flow!.flowId,
                flowCta: body.flow!.flowCta,
                headerText: body.flow!.headerText,
                bodyText: body.flow!.bodyText,
                footerText: body.flow!.footerText,
                initialScreen: body.flow!.initialScreen,
                initialData: body.flow!.initialData,
              }),
            urgent: body.urgent === true,
          });
          if (!result.sent) return apiError("whatsapp_blocked", "WhatsApp-Versand geblockt", 403);
          return Response.json({
            ok: true,
            type: "flow",
            messageId: result.messageId,
            sentTo: normalizedTo.slice(-4),
          });
        }
        default:
          return apiError("unknown_type", `Unbekannter Message-Type: ${body.type}`, 400);
      }
    } catch (err) {
      console.error("[whatsapp/send] failed:", err instanceof Error ? err.message : String(err));
      return apiError("send_failed", "WhatsApp-Nachricht konnte nicht gesendet werden", 502);
    }
  }
);
