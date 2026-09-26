/**
 * WP-4.19 — Two-way calendar sync per user (Microsoft 365, delegated OAuth).
 * The ONE implementation: the per-user cron (cron/outlook-user-sync) and the
 * mailbox "Jetzt synchronisieren" (email/accounts/[id]/calendar-sync) both
 * run `pullOutlookEvents` + `pushAppointmentsToOutlook`.
 *
 * Pull: events from the user's calendar (Graph /me/calendarView, every page
 * via @odata.nextLink, times in Europe/Vienna via `Prefer: outlook.timezone`)
 * are upserted as `calendar_event` pages keyed by owner mailbox + event id,
 * so re-syncs are idempotent. Mirrors of Subsumio appointments are skipped.
 *
 * Push (upsert): `appointment` pages flagged `sync_to_outlook: true` and owned
 * by the account (`calendar_owner_email`) are
 *   - created in Outlook when they have no `outlook_event_id` yet,
 *   - PATCHed when changed since the last push (`updated_at` > `outlook_synced_at`),
 *   - DELETEd when cancelled or deleted in Subsumio.
 *
 * Requires the mailbox's OAuth grant to include Calendars.ReadWrite — accounts
 * connected before that scope existed need one re-consent (Einstellungen →
 * E-Mail-Postfach → Microsoft neu verbinden).
 */

import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { listEnginePages, type ListedPage } from "@/lib/engine-pages";
import { externalFetchTimeout } from "@/lib/retry";
import {
  getMailAccountAuth,
  recordCalendarSyncResult,
  type MailAccount,
} from "@/lib/email/imap-accounts";
import { addMinutesToWallClock } from "@/lib/calendar/wall-clock";
import { isPrivateSensitivity } from "@/lib/calendar/personal-events";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface GraphCalendarEvent {
  id: string;
  subject?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  webLink?: string;
  lastModifiedDateTime?: string;
  /** normal | personal | private | confidential */
  sensitivity?: string;
}

/** Graph event → engine page payload (pure, unit-tested). */
export function graphEventToPage(
  event: GraphCalendarEvent,
  ownerEmail: string,
  opts: { ownerUserId?: string } = {}
): {
  slug: string;
  title: string;
  type: "calendar_event";
  frontmatter: Record<string, unknown>;
} | null {
  if (!event.id) return null;
  const start = event.start?.dateTime ?? null;
  // A private/confidential Outlook appointment only blocks time in Subsumio:
  // subject, location and link stay in the owner's own calendar.
  const isPrivate = isPrivateSensitivity(event.sensitivity);
  return {
    slug: `calendar/outlook/${ownerEmail}/${event.id}`,
    title: isPrivate ? "Termin: Beschäftigt" : `Termin: ${event.subject ?? "(ohne Betreff)"}`,
    type: "calendar_event",
    frontmatter: {
      type: "calendar_event",
      outlook_event_id: event.id,
      subject: isPrivate ? "Beschäftigt" : (event.subject ?? ""),
      start,
      end: event.end?.dateTime ?? null,
      timezone: event.start?.timeZone ?? null,
      location: isPrivate ? null : (event.location?.displayName ?? null),
      all_day: event.isAllDay === true,
      cancelled: event.isCancelled === true,
      web_link: isPrivate ? null : (event.webLink ?? null),
      ...(isPrivate ? { private: true } : {}),
      owner_email: ownerEmail,
      ...(opts.ownerUserId ? { owner_user_id: opts.ownerUserId } : {}),
      synced_from: "outlook",
      last_modified: event.lastModifiedDateTime ?? null,
      synced_at: new Date().toISOString(),
    },
  };
}

/** Subsumio appointment → Graph event body (pure, unit-tested). */
export function appointmentToGraphEvent(frontmatter: Record<string, unknown>): {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  body?: { contentType: "text"; content: string };
} | null {
  const date = typeof frontmatter.date === "string" ? frontmatter.date : null;
  const time = typeof frontmatter.time === "string" ? frontmatter.time : "09:00";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const topic =
    (typeof frontmatter.title === "string" && frontmatter.title) ||
    (typeof frontmatter.topic === "string" && frontmatter.topic) ||
    "Subsumio-Termin";
  const durationMin =
    typeof frontmatter.duration === "number" && frontmatter.duration > 0
      ? frontmatter.duration
      : typeof frontmatter.duration_minutes === "number" && frontmatter.duration_minutes > 0
        ? frontmatter.duration_minutes
        : 60;
  const startClock = /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  const startIso = `${date}T${startClock}:00`;
  // Wall-clock arithmetic (not Date+toISOString, which would shift the end
  // into UTC) that rolls into the next day for appointments past midnight.
  const end = addMinutesToWallClock(date, startClock, durationMin);
  const endIso = `${end.date}T${end.time}:00`;
  return {
    subject: `Subsumio: ${topic}`,
    start: { dateTime: startIso, timeZone: "Europe/Vienna" },
    end: { dateTime: endIso, timeZone: "Europe/Vienna" },
    ...(typeof frontmatter.location === "string" && frontmatter.location
      ? { location: { displayName: frontmatter.location } }
      : {}),
    ...(typeof frontmatter.description === "string" && frontmatter.description
      ? { body: { contentType: "text" as const, content: frontmatter.description } }
      : {}),
  };
}

export const CALENDAR_TIMEZONE = "Europe/Vienna";
/** Safety stop for calendarView paging (100 events per page). */
export const MAX_CALENDAR_PAGES = 50;

export class GraphRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "GraphRequestError";
  }
}

/** Graph request; `path` may be a full @odata.nextLink URL. 204 → null. */
async function graphFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T | null> {
  const res = await fetch(path.startsWith("https://") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      // Wall times in the firm zone instead of UTC without offset.
      Prefer: `outlook.timezone="${CALENDAR_TIMEZONE}"`,
      ...(init?.headers ?? {}),
    },
    signal: externalFetchTimeout(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GraphRequestError(res.status, `graph_${res.status}:${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

/**
 * Every event of the calendar view window — follows @odata.nextLink so a busy
 * calendar is not cut off after the first 100 events. Throws when the page
 * budget runs out rather than returning a silently truncated list.
 */
export async function fetchCalendarView(
  accessToken: string,
  window: { start: Date; end: Date }
): Promise<GraphCalendarEvent[]> {
  const events: GraphCalendarEvent[] = [];
  let next: string | undefined =
    `/me/calendarView?startDateTime=${encodeURIComponent(window.start.toISOString())}` +
    `&endDateTime=${encodeURIComponent(window.end.toISOString())}` +
    `&$top=100&$orderby=start/dateTime`;
  for (let page = 0; next; page++) {
    if (page >= MAX_CALENDAR_PAGES) throw new Error("calendar_view_too_large");
    const data: { value?: GraphCalendarEvent[]; "@odata.nextLink"?: string } | null =
      await graphFetch(accessToken, next);
    events.push(...(data?.value ?? []));
    next = data?.["@odata.nextLink"];
  }
  return events;
}

/** Pull Outlook → Subsumio as calendar_event pages. Returns pulled count + errors. */
export async function pullOutlookEvents(
  accessToken: string,
  headers: Record<string, string>,
  owner: { email: string; userId?: string },
  window: { start: Date; end: Date },
  /** outlook_event_ids of pushed Subsumio appointments — not re-imported. */
  skipEventIds: ReadonlySet<string> = new Set()
): Promise<{ pulled: number; removed: number; errors: string[] }> {
  // Throws on any Graph failure or an oversized view — then nothing below
  // runs, in particular no page is marked as deleted on an incomplete view.
  const events = await fetchCalendarView(accessToken, window);
  let pulled = 0;
  const errors: string[] = [];
  for (const event of events) {
    if (skipEventIds.has(event.id)) continue;
    const page = graphEventToPage(event, owner.email, { ownerUserId: owner.userId });
    if (!page) continue;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(page),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) pulled++;
      else errors.push(`pull:${event.id}:${res.status}`);
    } catch (e) {
      errors.push(`pull:${event.id}:${e instanceof Error ? e.message : "network"}`);
    }
  }
  const removed = await markEventsRemovedInOutlook(
    headers,
    owner.email,
    window,
    new Set(events.map((e) => e.id)),
    errors
  );
  return { pulled, removed, errors };
}

const DAY_MS = 86_400_000;

/**
 * Earlier pulled events of this mailbox that the (complete) calendar view no
 * longer returns were deleted in Outlook: mark them cancelled so they leave
 * the Subsumio calendar. Only pages whose start lies well inside the window
 * are judged (a day of margin for the wall-clock/UTC difference).
 */
async function markEventsRemovedInOutlook(
  headers: Record<string, string>,
  ownerEmail: string,
  window: { start: Date; end: Date },
  deliveredIds: ReadonlySet<string>,
  errors: string[]
): Promise<number> {
  let pages: ListedPage[];
  try {
    pages = await listEnginePages(headers, "calendar_event", 10_000, { strict: true });
  } catch (e) {
    errors.push(`reconcile:list:${e instanceof Error ? e.message : "failed"}`);
    return 0;
  }
  const prefix = `calendar/outlook/${ownerEmail}/`;
  const from = window.start.getTime() + DAY_MS;
  const to = window.end.getTime() - DAY_MS;
  const now = new Date().toISOString();
  let removed = 0;
  for (const page of pages) {
    if (!page.slug.startsWith(prefix)) continue;
    const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
    if (fm.cancelled === true || fm.status === "tombstoned") continue;
    const eventId = typeof fm.outlook_event_id === "string" ? fm.outlook_event_id : "";
    if (!eventId || deliveredIds.has(eventId)) continue;
    const start = Date.parse(String(fm.start ?? ""));
    if (!Number.isFinite(start) || start < from || start > to) continue;
    try {
      const res = await enginePatchPage(headers, {
        slug: page.slug,
        frontmatter: { cancelled: true, removed_in_outlook_at: now },
      });
      if (res.ok) removed++;
      else errors.push(`reconcile:${eventId}:${res.status}`);
    } catch (e) {
      errors.push(`reconcile:${eventId}:${e instanceof Error ? e.message : "network"}`);
    }
  }
  return removed;
}

const CLOSED_STATUSES = new Set(["cancelled", "storniert", "tombstoned"]);

export type AppointmentPushAction = "create" | "update" | "delete" | null;

/** What the push has to do for one appointment (pure, unit-tested). */
export function appointmentPushAction(fm: Record<string, unknown>): AppointmentPushAction {
  if (fm.sync_to_outlook !== true) return null;
  const eventId = typeof fm.outlook_event_id === "string" ? fm.outlook_event_id : "";
  const closed = CLOSED_STATUSES.has(String(fm.status ?? ""));
  if (closed) return eventId && !fm.outlook_deleted_at ? "delete" : null;
  if (!eventId) return "create";
  const updated = Date.parse(String(fm.updated_at ?? ""));
  const synced = Date.parse(String(fm.outlook_synced_at ?? fm.synced_at ?? ""));
  if (Number.isFinite(updated) && (!Number.isFinite(synced) || updated > synced)) {
    return "update";
  }
  return null;
}

async function markPushed(
  headers: Record<string, string>,
  slug: string,
  frontmatter: Record<string, unknown>
): Promise<void> {
  const res = await enginePatchPage(headers, { slug, frontmatter });
  if (!res.ok) throw new Error(`engine_mark_failed:${res.status}`);
}

/**
 * Push Subsumio appointments of `ownerEmails` into that Outlook calendar
 * (create / update / delete). `appointments` must include deleted
 * (tombstoned) pages so deletions reach Outlook.
 */
export async function pushAppointmentsToOutlook(
  accessToken: string,
  headers: Record<string, string>,
  appointments: readonly ListedPage[],
  ownerEmails: readonly string[]
): Promise<{ pushed: number; updated: number; deleted: number; errors: string[] }> {
  const owners = new Set(ownerEmails.map((e) => e.toLowerCase()));
  const out = { pushed: 0, updated: 0, deleted: 0, errors: [] as string[] };
  for (const appt of appointments) {
    const fm = (appt.frontmatter ?? {}) as Record<string, unknown>;
    const owner =
      typeof fm.calendar_owner_email === "string" ? fm.calendar_owner_email.toLowerCase() : "";
    if (!owner || !owners.has(owner)) continue;
    const action = appointmentPushAction(fm);
    if (!action) continue;
    const eventId = String(fm.outlook_event_id ?? "");
    const now = new Date().toISOString();
    try {
      if (action === "delete") {
        try {
          await graphFetch(accessToken, `/me/events/${encodeURIComponent(eventId)}`, {
            method: "DELETE",
          });
        } catch (e) {
          // Already gone in Outlook — nothing left to delete.
          if (!(e instanceof GraphRequestError && e.status === 404)) throw e;
        }
        await markPushed(headers, appt.slug, { outlook_deleted_at: now });
        out.deleted++;
        continue;
      }
      const body = appointmentToGraphEvent(fm);
      if (!body) continue;
      if (action === "update") {
        try {
          await graphFetch(accessToken, `/me/events/${encodeURIComponent(eventId)}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          await markPushed(headers, appt.slug, { outlook_synced_at: now, synced_at: now });
          out.updated++;
          continue;
        } catch (e) {
          // Deleted in Outlook meanwhile → create it again below.
          if (!(e instanceof GraphRequestError && e.status === 404)) throw e;
        }
      }
      const created = await graphFetch<{ id: string }>(accessToken, "/me/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!created?.id) throw new Error("graph_create_without_id");
      await markPushed(headers, appt.slug, {
        outlook_event_id: created.id,
        synced_to: "outlook",
        outlook_synced_at: now,
        synced_at: now,
      });
      out.pushed++;
    } catch (e) {
      out.errors.push(`push:${appt.slug}:${e instanceof Error ? e.message : "network"}`);
    }
  }
  return out;
}

/** Pull window used by both sync entry points. */
export function calendarSyncWindow(now: number = Date.now()): { start: Date; end: Date } {
  return { start: new Date(now - 30 * 86_400_000), end: new Date(now + 90 * 86_400_000) };
}

/** outlook_event_ids already owned by Subsumio appointments (pull skips them). */
export function pushedEventIds(appointments: readonly ListedPage[]): Set<string> {
  const ids = new Set<string>();
  for (const a of appointments) {
    const id = (a.frontmatter as Record<string, unknown> | undefined)?.outlook_event_id;
    if (typeof id === "string" && id) ids.add(id);
  }
  return ids;
}

/** All appointments of a brain incl. deleted ones (for delete propagation). Strict. */
export function listAppointmentsForSync(headers: Record<string, string>): Promise<ListedPage[]> {
  return listEnginePages(headers, "appointment", 10_000, {
    includeTombstoned: true,
    strict: true,
  });
}

export interface CalendarSyncResult {
  accountId: string;
  email: string;
  pulled: number;
  pushed: number;
  errors: string[];
}

/**
 * Sync one OAuth mailbox's calendar both ways. Never throws per-event; a
 * provider-level failure (token, network) bubbles up to the caller which
 * records it on the account.
 */
export async function syncAccountCalendar(account: MailAccount): Promise<CalendarSyncResult> {
  const result: CalendarSyncResult = {
    accountId: account.id,
    email: account.email,
    pulled: 0,
    pushed: 0,
    errors: [],
  };
  const auth = await getMailAccountAuth(account);
  if (!auth || auth.type !== "oauth") throw new Error("calendar_sync_no_oauth_token");
  const headers = engineHeadersForBrain(account.brainId);

  const appointments = await listAppointmentsForSync(headers);

  // ── Pull: Outlook → Subsumio ────────────────────────────────────────────
  const pull = await pullOutlookEvents(
    auth.accessToken,
    headers,
    { email: account.email },
    calendarSyncWindow(),
    pushedEventIds(appointments)
  );
  result.pulled = pull.pulled;
  result.errors.push(...pull.errors);

  // ── Push: Subsumio → Outlook ────────────────────────────────────────────
  // Only appointments the owner explicitly flagged; without attribution we
  // would push the whole firm calendar into every connected mailbox.
  const push = await pushAppointmentsToOutlook(auth.accessToken, headers, appointments, [
    account.email,
  ]);
  result.pushed = push.pushed + push.updated + push.deleted;
  result.errors.push(...push.errors);

  await recordCalendarSyncResult(
    account.id,
    result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null
  );
  return result;
}
