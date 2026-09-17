import { NextRequest } from "next/server";
import { createCronHandler, apiSuccess } from "@/lib/api-handler";
import { syncCalendar, isMsGraphConfigured } from "@/lib/msgraph";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Microsoft 365 calendar sync (Graph, app credentials, one mailbox per deployment).
 * Mail is NOT synced here any more: firms connect their mailbox under
 * Einstellungen → E-Mail-Postfach (IMAP/OAuth), see docs/architecture/EMAIL_IMAP.md.
 */
const handler = createCronHandler(async (_req: NextRequest) => {
  if (!isMsGraphConfigured()) {
    return apiSuccess({ ok: true, skipped: "msgraph_not_configured" });
  }

  // The events belong to one firm: without the target firm the job must not write anywhere.
  const brainId = env("MS365_BRAIN_ID");
  if (!brainId) {
    return apiSuccess({ ok: true, skipped: "ms365_brain_not_configured" });
  }
  const engineHeaders = engineHeadersForBrain(brainId);

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  let calendarSynced = 0;
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

  return apiSuccess({
    ok: true,
    calendarSynced,
    errors: errors.length > 0 ? errors : undefined,
    syncedAt: new Date().toISOString(),
  });
});

// The crontab calls GET; POST stays for manual triggers.
export const GET = handler;
export const POST = handler;
