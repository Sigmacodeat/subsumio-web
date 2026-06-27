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

const messagePostSchema = z.object({
  subject: z.string().trim().min(1, "subject_required").max(500),
  text: z.string().trim().max(100_000).optional(),
  html: z.string().trim().max(500_000).optional(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  cc: z.union([z.string(), z.array(z.string())]).optional(),
  bcc: z.union([z.string(), z.array(z.string())]).optional(),
  replyToMessageId: z.string().max(200).optional(),
}).passthrough().refine((data) => data.text || data.html, {
  message: "body_required",
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: messagesQuerySchema,
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
      return apiError(message, message, status);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: messagePostSchema,
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
      return apiError(message, message, status);
    }
  }
);
