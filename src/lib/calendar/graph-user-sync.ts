/**
 * WP-4.19 — Two-way calendar sync per user (Microsoft 365, delegated OAuth).
 *
 * Pull: events from the user's primary calendar (Graph /me/calendarView) are
 * upserted as `calendar_event` pages in the firm brain, keyed by
 * `outlook_event_id` so re-syncs are idempotent.
 *
 * Push: `appointment` pages flagged `sync_to_outlook: true` and owned by the
 * account's address (`calendar_owner_email`) are created in that user's
 * Outlook calendar; the returned event id is stored back as
 * `outlook_event_id` so the pull direction never duplicates them.
 *
 * Requires the mailbox's OAuth grant to include Calendars.ReadWrite — accounts
 * connected before that scope existed need one re-consent (Einstellungen →
 * E-Mail-Postfach → Microsoft neu verbinden).
 */

import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { externalFetchTimeout } from "@/lib/retry";
import {
  getMailAccountAuth,
  recordCalendarSyncResult,
  type MailAccount,
} from "@/lib/email/imap-accounts";

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
}

/** Graph event → engine page payload (pure, unit-tested). */
export function graphEventToPage(
  event: GraphCalendarEvent,
  ownerEmail: string
): {
  slug: string;
  title: string;
  type: "calendar_event";
  frontmatter: Record<string, unknown>;
} | null {
  if (!event.id) return null;
  const start = event.start?.dateTime ?? null;
  return {
    slug: `calendar/outlook/${ownerEmail}/${event.id}`,
    title: `Termin: ${event.subject ?? "(ohne Betreff)"}`,
    type: "calendar_event",
    frontmatter: {
      type: "calendar_event",
      outlook_event_id: event.id,
      subject: event.subject ?? "",
      start,
      end: event.end?.dateTime ?? null,
      timezone: event.start?.timeZone ?? null,
      location: event.location?.displayName ?? null,
      all_day: event.isAllDay === true,
      cancelled: event.isCancelled === true,
      web_link: event.webLink ?? null,
      owner_email: ownerEmail,
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
  // Wall-clock arithmetic, not Date+toISOString — that would shift the end
  // into UTC while the start stays local Vienna time.
  const [sh, sm] = startClock.split(":").map(Number);
  const endTotal = sh * 60 + sm + durationMin;
  const endClock = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(
    endTotal % 60
  ).padStart(2, "0")}`;
  const endIso = `${date}T${endClock}:00`;
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

async function graphFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: externalFetchTimeout(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`graph_${res.status}:${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
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

  // ── Pull: Outlook → Subsumio ────────────────────────────────────────────
  const now = Date.now();
  const windowStart = new Date(now - 14 * 86400000).toISOString();
  const windowEnd = new Date(now + 90 * 86400000).toISOString();
  const view = await graphFetch<{ value: GraphCalendarEvent[] }>(
    auth.accessToken,
    `/me/calendarView?startDateTime=${encodeURIComponent(windowStart)}&endDateTime=${encodeURIComponent(windowEnd)}&$top=100&$orderby=start/dateTime`
  );
  for (const event of view.value ?? []) {
    const page = graphEventToPage(event, account.email);
    if (!page) continue;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(page),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) result.pulled++;
      else result.errors.push(`pull:${event.id}:${res.status}`);
    } catch (e) {
      result.errors.push(`pull:${event.id}:${e instanceof Error ? e.message : "network"}`);
    }
  }

  // ── Push: Subsumio → Outlook ────────────────────────────────────────────
  // Only appointments the owner explicitly flagged; without attribution we
  // would push the whole firm calendar into every connected mailbox.
  const appointments = await listEnginePages(headers, "appointment", 500);
  for (const appt of appointments) {
    const fm = (appt.frontmatter ?? {}) as Record<string, unknown>;
    if (fm.sync_to_outlook !== true) continue;
    if (fm.calendar_owner_email !== account.email) continue;
    if (fm.outlook_event_id) continue; // already pushed — pull keeps it fresh
    const body = appointmentToGraphEvent(fm);
    if (!body) continue;
    try {
      const created = await graphFetch<{ id: string }>(auth.accessToken, "/me/events", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await enginePatchPage(headers, {
        slug: appt.slug,
        frontmatter: {
          outlook_event_id: created.id,
          synced_to: "outlook",
          synced_at: new Date().toISOString(),
        },
      });
      result.pushed++;
    } catch (e) {
      result.errors.push(`push:${appt.slug}:${e instanceof Error ? e.message : "network"}`);
    }
  }

  await recordCalendarSyncResult(
    account.id,
    result.errors.length > 0 ? result.errors.slice(0, 5).join("; ") : null
  );
  return result;
}
