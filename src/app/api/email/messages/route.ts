import { z } from "zod";
import {
  buildMailDraft,
  listMailMessages,
  sendMailboxMessage,
  getUnreadCounts,
  type MailDirection,
  type MailFolder,
} from "@/lib/email/mailbox";
import { createHandler, apiError } from "@/lib/api-handler";

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  direction: z.enum(["inbound", "outbound"]).optional(),
  folder: z.enum(["inbox", "sent", "archive", "spam", "trash"]).optional(),
  search: z.string().max(200).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

const messagePostSchema = z
  .object({
    subject: z.string().trim().min(1, "subject_required").max(500),
    text: z.string().trim().max(100_000).optional(),
    html: z.string().trim().max(500_000).optional(),
    to: z.union([z.string().max(500), z.array(z.string().max(500)).max(50)]).optional(),
    cc: z.union([z.string().max(500), z.array(z.string().max(500)).max(50)]).optional(),
    bcc: z.union([z.string().max(500), z.array(z.string().max(500)).max(50)]).optional(),
    replyToMessageId: z.string().max(200).optional(),
  })
  .passthrough()
  .refine((data) => data.text || data.html, {
    message: "body_required",
  });

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: messagesQuerySchema,
    audit: (_ctx, _body, query) => ({
      action: "email.messages_list" as const,
      entityType: "email_message",
      details: {
        limit: query.limit,
        direction: query.direction,
        folder: query.folder,
        unread_only: query.unreadOnly,
        has_search: Boolean(query.search),
      },
    }),
  },
  async (ctx, _body, query, _req) => {
    try {
      const [messages, unreadCounts] = await Promise.all([
        listMailMessages(ctx.user, {
          limit: query.limit,
          direction: query.direction as MailDirection | undefined,
          folder: query.folder as MailFolder | undefined,
          search: query.search,
          unreadOnly: query.unreadOnly,
        }),
        getUnreadCounts(ctx.user),
      ]);
      return Response.json({ messages, unreadCounts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "mailbox_database_not_configured" ? 503 : 500;
      console.error("[email] failed to list messages:", message);
      if (status === 500)
        return apiError("internal_error", "Nachrichten konnten nicht geladen werden", 500);
      return apiError(message, message, status);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: messagePostSchema,
    audit: (_ctx, body) => ({
      action: "email.message_send" as const,
      entityType: "email_message",
      details: {
        has_subject: Boolean(body.subject),
        has_text: Boolean(body.text),
        has_html: Boolean(body.html),
        recipient_count_to: Array.isArray(body.to) ? body.to.length : body.to ? 1 : 0,
        recipient_count_cc: Array.isArray(body.cc) ? body.cc.length : body.cc ? 1 : 0,
        recipient_count_bcc: Array.isArray(body.bcc) ? body.bcc.length : body.bcc ? 1 : 0,
        has_reply_to: Boolean(body.replyToMessageId),
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const draft = buildMailDraft(body);
      const message = await sendMailboxMessage(ctx.user, draft);
      return Response.json({ message }, { status: message.status === "sent" ? 201 : 202 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        message === "mailbox_database_not_configured"
          ? 503
          : /required|invalid/.test(message)
            ? 400
            : 500;
      console.error("[email] failed to send message:", message);
      if (status === 500)
        return apiError("internal_error", "E-Mail konnte nicht gesendet werden", 500);
      return apiError(message, message, status);
    }
  }
);
