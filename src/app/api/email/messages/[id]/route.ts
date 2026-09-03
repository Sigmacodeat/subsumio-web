import { z } from "zod";
import { getMailMessage, updateMailMessage, type MailFolder } from "@/lib/email/mailbox";
import { createHandler, apiError } from "@/lib/api-handler";

const patchSchema = z
  .object({
    folder: z.enum(["inbox", "sent", "archive", "spam", "trash"]).optional(),
    isRead: z.boolean().optional(),
  })
  .refine((data) => data.folder !== undefined || data.isRead !== undefined, {
    message: "At least one of folder or isRead must be provided",
  });

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    audit: (_ctx, _body, _query, _req) => ({
      action: "email.message_detail" as const,
      entityType: "email_message",
    }),
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    try {
      const message = await getMailMessage(ctx.user, id);
      if (!message) return apiError("not_found", "Nachricht nicht gefunden", 404);
      return Response.json({ message });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg === "mailbox_database_not_configured" ? 503 : 500;
      console.error("[email] failed to load message:", msg);
      return apiError("load_failed", "Nachricht konnte nicht geladen werden", status);
    }
  }
);

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "email.message_update" as const,
      entityType: "email_message",
      details: {
        folder: body.folder,
        is_read: body.isRead,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    try {
      const updated = await updateMailMessage(ctx.user, id, {
        folder: body.folder as MailFolder | undefined,
        isRead: body.isRead,
      });
      if (!updated) return apiError("not_found", "Nachricht nicht gefunden", 404);
      return Response.json({ message: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg === "mailbox_database_not_configured" ? 503 : 500;
      console.error("[email] failed to update message:", msg);
      return apiError("update_failed", "Nachricht konnte nicht aktualisiert werden", status);
    }
  }
);
