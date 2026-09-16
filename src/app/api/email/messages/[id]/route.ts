import { z } from "zod";
import { getMailMessage, updateMailMessage, type MailFolder } from "@/lib/email/mailbox";
import { createHandler, apiError } from "@/lib/api-handler";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { caseAccessForUser } from "@/lib/email/case-link";

const patchSchema = z
  .object({
    folder: z.enum(["inbox", "sent", "archive", "spam", "trash"]).optional(),
    isRead: z.boolean().optional(),
    /** File under a matter; null removes the assignment. */
    case_slug: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) =>
      data.folder !== undefined || data.isRead !== undefined || data.case_slug !== undefined,
    { message: "At least one of folder, isRead or case_slug must be provided" }
  );

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
      const message = await getMailMessage(mailboxScopeFor(ctx, req), id);
      if (!message) return apiError("not_found", "Nachricht nicht gefunden", 404);
      if (
        message.caseSlug &&
        (await caseAccessForUser(ctx.headers, message.caseSlug, ctx.user.id)) === "blocked"
      ) {
        return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
      }
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
        case_slug: body.case_slug,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    try {
      const scope = mailboxScopeFor(ctx, req);
      const current = await getMailMessage(scope, id);
      if (!current) return apiError("not_found", "Nachricht nicht gefunden", 404);
      for (const slug of [current.caseSlug, body.case_slug]) {
        if (!slug) continue;
        const access = await caseAccessForUser(ctx.headers, slug, ctx.user.id);
        if (access === "blocked")
          return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
        if (access === "not_found" && slug === body.case_slug) {
          return apiError("case_not_found", "Akte nicht gefunden", 400);
        }
      }
      const updated = await updateMailMessage(scope, id, {
        folder: body.folder as MailFolder | undefined,
        isRead: body.isRead,
        caseSlug: body.case_slug,
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
