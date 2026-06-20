
import { z } from "zod";
import { buildMailDraft, listMailMessages, sendMailboxMessage, type MailDirection } from "@/lib/email/mailbox";
import { createHandler, apiError } from "@/lib/api-handler";

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  direction: z.enum(["inbound", "outbound"]).optional(),
});

const messagePostSchema = z.object({}).passthrough();

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: messagesQuerySchema,
  },
  async (ctx, _body, query, _req) => {
    try {
      const messages = await listMailMessages(ctx.user, {
        limit: query.limit,
        direction: query.direction as MailDirection | undefined,
      });
      return Response.json({ messages });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "mailbox_database_not_configured" ? 503 : 500;
      console.error("[email] failed to list messages:", message);
      return apiError(message, message, status);
    }
  },
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
        message === "mailbox_database_not_configured" ? 503 :
        /required|invalid/.test(message) ? 400 :
        500;
      console.error("[email] failed to send message:", message);
      return apiError(message, message, status);
    }
  },
);
