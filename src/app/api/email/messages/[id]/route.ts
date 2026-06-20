
import { getMailMessage } from "@/lib/email/mailbox";
import { createHandler, apiError } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { id } = await ((req as unknown as { params: Promise<{ id: string }> }).params);
    try {
      const message = await getMailMessage(ctx.user, id);
      if (!message) return apiError("not_found", "Nachricht nicht gefunden", 404);
      return Response.json({ message });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "mailbox_database_not_configured" ? 503 : 500;
      console.error("[email] failed to load message:", message);
      return apiError(message, message, status);
    }
  },
);
