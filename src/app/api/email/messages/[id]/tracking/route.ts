import { getMailMessage } from "@/lib/email/mailbox";
import { getTrackingEvents } from "@/lib/email/tracking";
import { createHandler, apiError } from "@/lib/api-handler";
import { mailboxScopeFor } from "@/lib/email/mailbox-scope";
import { caseAccessForUser } from "@/lib/email/case-link";

import { logger } from "@/lib/logger";
const log = logger("api/email/messages/[id]/tracking");

export const GET = createHandler(
  {
    action: "mail.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    try {
      const message = await getMailMessage(mailboxScopeFor(ctx, req), id);
      if (!message) return apiError("not_found", "Nachricht nicht gefunden", 404);
      if (message.caseSlug) {
        const access = await caseAccessForUser(ctx.headers, message.caseSlug, ctx.user.id);
        if (access === "blocked")
          return apiError("forbidden", "Kein Zugriff auf diese Akte (Ethical Wall)", 403);
        if (access !== "ok") return apiError("not_found", "Nachricht nicht gefunden", 404);
      }

      const events = await getTrackingEvents(id);

      return Response.json({
        message,
        events,
        summary: {
          trackingStatus: (message as unknown as Record<string, unknown>).tracking_status ?? "sent",
          openCount: (message as unknown as Record<string, unknown>).open_count ?? 0,
          clickCount: (message as unknown as Record<string, unknown>).click_count ?? 0,
          forwarded: (message as unknown as Record<string, unknown>).forwarded ?? false,
          firstOpenedAt: (message as unknown as Record<string, unknown>).first_opened_at ?? null,
          lastOpenedAt: (message as unknown as Record<string, unknown>).last_opened_at ?? null,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg === "mailbox_database_not_configured" ? 503 : 500;
      log.error("[email] failed to load tracking data:", msg);
      return apiError("load_failed", "Tracking-Daten konnten nicht geladen werden", status);
    }
  }
);
