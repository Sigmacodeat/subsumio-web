import { getMailMessage } from "@/lib/email/mailbox";
import { getTrackingEvents } from "@/lib/email/tracking";
import { createHandler, apiError } from "@/lib/api-handler";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    try {
      const message = await getMailMessage(ctx.user, id);
      if (!message) return apiError("not_found", "Nachricht nicht gefunden", 404);

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
      console.error("[email] failed to load tracking data:", msg);
      return apiError("load_failed", "Tracking-Daten konnten nicht geladen werden", status);
    }
  }
);
