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
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { blockedCasesForUser, caseAccessForUser } from "@/lib/email/case-link";
import { mailboxAddressForBrain } from "@/lib/email/mailbox";

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  direction: z.enum(["inbound", "outbound"]).optional(),
  folder: z.enum(["inbox", "sent", "archive", "spam", "trash"]).optional(),
  search: z.string().max(200).optional(),
  unreadOnly: z.coerce.boolean().optional(),
  case: z.string().max(500).optional(),
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
    case_slug: z.string().max(500).optional(),
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
  async (ctx, _body, query, req) => {
    try {
      const scope = mailboxScopeFor(ctx, req);
      if (query.case) {
        const access = await caseAccessForUser(ctx.headers, query.case, ctx.user.id);
        if (access === "not_found") return apiError("case_not_found", "Akte nicht gefunden", 404);
        if (access === "blocked")
          return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
      }
      const [listed, unreadCounts] = await Promise.all([
        listMailMessages(scope, {
          limit: query.limit,
          direction: query.direction as MailDirection | undefined,
          folder: query.folder as MailFolder | undefined,
          search: query.search,
          unreadOnly: query.unreadOnly,
          caseSlug: query.case,
        }),
        getUnreadCounts(scope),
      ]);
      // Mail filed under a matter the user is walled off from is not listed.
      const blocked = await blockedCasesForUser(
        ctx.headers,
        listed.map((m) => m.caseSlug ?? "").filter(Boolean),
        ctx.user.id
      );
      const messages = listed.filter((m) => !m.caseSlug || !blocked.has(m.caseSlug));
      return Response.json({
        messages,
        unreadCounts,
        address: mailboxAddressForBrain(scope.brainId),
      });
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
  async (ctx, body, _query, req) => {
    try {
      if (body.case_slug) {
        const access = await caseAccessForUser(ctx.headers, body.case_slug, ctx.user.id);
        if (access === "not_found") return apiError("case_not_found", "Akte nicht gefunden", 400);
        if (access === "blocked")
          return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
      }
      const draft = { ...buildMailDraft(body), caseSlug: body.case_slug };
      const message = await sendMailboxMessage(mailboxScopeFor(ctx, req), draft);
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
