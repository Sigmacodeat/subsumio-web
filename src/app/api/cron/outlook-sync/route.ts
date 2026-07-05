import { NextRequest } from "next/server";
import { createCronHandler, apiSuccess } from "@/lib/api-handler";
import { syncCalendar, syncMail, isMsGraphConfigured } from "@/lib/msgraph";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = createCronHandler(async (_req: NextRequest) => {
  if (!isMsGraphConfigured()) {
    return apiSuccess({ ok: true, skipped: "msgraph_not_configured" });
  }

  const engineHeaders: Record<string, string> = {
    "x-api-key": process.env.ENGINE_API_KEY ?? "",
  };

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  let calendarSynced = 0;
  let mailSynced = 0;
  const errors: string[] = [];

  // 1. Sync calendar events
  try {
    const calResult = await syncCalendar({ since, maxResults: 100 });
    for (const event of calResult.events) {
      const slug = `calendar/outlook/${event.id}`;
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...engineHeaders },
        body: JSON.stringify({
          slug,
          title: `Termin: ${event.subject}`,
          type: "calendar_event",
          frontmatter: {
            type: "calendar_event",
            outlook_event_id: event.id,
            subject: event.subject,
            start: event.start?.dateTime,
            end: event.end?.dateTime,
            location: event.location?.displayName,
            web_link: event.webLink,
            synced_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) calendarSynced++;
    }
  } catch (e) {
    errors.push(`calendar: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Sync mail
  try {
    const mailResult = await syncMail({ maxResults: 50 });
    for (const msg of mailResult.messages) {
      const slug = `email/outlook/${msg.id}`;
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...engineHeaders },
        body: JSON.stringify({
          slug,
          title: `E-Mail: ${msg.subject}`,
          type: "outlook_email",
          frontmatter: {
            type: "outlook_email",
            outlook_message_id: msg.id,
            subject: msg.subject,
            from: msg.from?.emailAddress?.address,
            from_name: msg.from?.emailAddress?.name,
            received_at: msg.receivedDateTime,
            has_attachments: msg.hasAttachments,
            web_link: msg.webLink,
            conversation_id: msg.conversationId,
            synced_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) mailSynced++;
    }
  } catch (e) {
    errors.push(`mail: ${e instanceof Error ? e.message : String(e)}`);
  }

  return apiSuccess({
    ok: true,
    calendarSynced,
    mailSynced,
    errors: errors.length > 0 ? errors : undefined,
    syncedAt: new Date().toISOString(),
  });
});
