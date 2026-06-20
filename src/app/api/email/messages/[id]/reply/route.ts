
import { z } from "zod";
import { buildMailDraft, getMailMessage, sendMailboxMessage } from "@/lib/email/mailbox";
import { createHandler, apiError } from "@/lib/api-handler";

const replySchema = z.object({}).passthrough();

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: replySchema,
  },
  async (ctx, body, _query, req) => {
    const { id } = await ((req as unknown as { params: Promise<{ id: string }> }).params);
    try {
      const parent = await getMailMessage(ctx.user, id);
      if (!parent) return apiError("not_found", "Nachricht nicht gefunden", 404);
      const draft = buildMailDraft(body, id);
      const message = await sendMailboxMessage(ctx.user, draft);
      return Response.json({ message }, { status: message.status === "sent" ? 201 : 202 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status =
        message === "mailbox_database_not_configured" ? 503 :
        /required|invalid/.test(message) ? 400 :
        500;
      console.error("[email] failed to send reply:", message);
      return apiError(message, message, status);
    }
  },
);
