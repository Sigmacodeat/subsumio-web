/**
 * The signed-in user's own Outlook appointments, from the `calendar_event`
 * pages the per-user sync pulls (src/lib/calendar/graph-user-sync.ts).
 * Pure, client-safe — the calendar page renders the result for every role.
 */
import { graphDateTimeToFirmLocal } from "@/lib/calendar/wall-clock";

export interface OutlookCalendarItem {
  id: string;
  eventId: string;
  title: string;
  /** Firm-local `YYYY-MM-DD` */
  date: string;
  /** Firm-local `HH:MM`, absent for all-day events */
  time?: string;
  durationMin?: number;
  location?: string;
  webLink?: string;
}

interface PageLike {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function ownOutlookEvents(
  pages: readonly PageLike[],
  me: { id?: string; email?: string } | null | undefined,
  /** outlook_event_ids of Subsumio appointments (already shown as such). */
  mirroredEventIds: ReadonlySet<string> = new Set()
): OutlookCalendarItem[] {
  const myId = me?.id ?? "";
  const myEmail = (me?.email ?? "").toLowerCase();
  if (!myId && !myEmail) return [];
  const byEvent = new Map<string, OutlookCalendarItem>();
  for (const page of pages) {
    const fm = page.frontmatter ?? {};
    if (fm.type && fm.type !== "calendar_event") continue;
    if (fm.cancelled === true || fm.status === "tombstoned") continue;
    const ownerId = str(fm.owner_user_id);
    const ownerEmail = str(fm.owner_email).toLowerCase();
    const mine = (myId && ownerId === myId) || (myEmail && ownerEmail === myEmail);
    if (!mine) continue;
    const eventId = str(fm.outlook_event_id);
    if (!eventId || mirroredEventIds.has(eventId) || byEvent.has(eventId)) continue;
    const tz = str(fm.timezone) || null;
    const start = graphDateTimeToFirmLocal(str(fm.start), tz);
    if (!start) continue;
    const end = graphDateTimeToFirmLocal(str(fm.end), tz);
    const allDay = fm.all_day === true || fm.is_all_day === true;
    byEvent.set(eventId, {
      id: `outlook:${eventId}`,
      eventId,
      title: str(fm.subject) || page.title?.replace(/^Termin:\s*/, "") || "Ohne Betreff",
      date: start.date,
      time: allDay ? undefined : start.time,
      durationMin:
        !allDay && end ? Math.max(15, Math.round((end.ms - start.ms) / 60_000)) : undefined,
      location: str(fm.location) || undefined,
      webLink: str(fm.web_link) || undefined,
    });
  }
  return [...byEvent.values()];
}
