/**
 * Microsoft Graph API Client
 * ============================
 * Provides OAuth2 client-credentials flow and Graph API access for:
 * - Calendar sync (Outlook events)
 * - Mail delta sync (Outlook messages)
 * - Contact sync (Outlook contacts)
 *
 * Config via env:
 *   MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_TENANT_ID
 *   MS365_OUTLOOK_FOLDER (optional, default: Inbox)
 *   MS365_CALENDAR_NAME (optional, default: calendar)
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

const MS365_CLIENT_ID = process.env.MS365_CLIENT_ID || "";
const MS365_CLIENT_SECRET = process.env.MS365_CLIENT_SECRET || "";
const MS365_TENANT_ID = process.env.MS365_TENANT_ID || "";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getGraphToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  if (!MS365_CLIENT_ID || !MS365_CLIENT_SECRET || !MS365_TENANT_ID) {
    throw new Error(
      "MS365 credentials not configured (MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_TENANT_ID)"
    );
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${MS365_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS365_CLIENT_ID,
        client_secret: MS365_CLIENT_SECRET,
        scope: GRAPH_SCOPE,
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MS365 token request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function graphFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getGraphToken();
  return fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
}

async function graphGetJson<T>(path: string): Promise<T> {
  const res = await graphFetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

// ── Calendar Sync ─────────────────────────────────────────────────────

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  attendees?: Array<{
    emailAddress?: { name?: string; address?: string };
    type?: string;
  }>;
  bodyPreview?: string;
  isAllDay?: boolean;
  sensitivity?: string;
  showAs?: string;
  webLink?: string;
  categories?: string[];
}

export interface CalendarSyncResult {
  events: OutlookEvent[];
  deltaLink?: string;
  nextLink?: string;
  syncedAt: string;
}

export async function syncCalendar(opts?: {
  calendarName?: string;
  since?: string;
  maxResults?: number;
}): Promise<CalendarSyncResult> {
  const calendarName = opts?.calendarName || process.env.MS365_CALENDAR_NAME || "calendar";
  const maxResults = opts?.maxResults ?? 50;

  const params = new URLSearchParams({
    $top: String(maxResults),
    $select:
      "id,subject,start,end,location,attendees,bodyPreview,isAllDay,sensitivity,showAs,webLink,categories",
    $orderby: "start/dateTime desc",
  });

  if (opts?.since) {
    params.set("$filter", `start/dateTime ge ${opts.since}`);
  }

  const path = `/me/calendars/${encodeURIComponent(calendarName)}/events?${params}`;
  const data = await graphGetJson<{
    value: OutlookEvent[];
    "@odata.deltaLink"?: string;
    "@odata.nextLink"?: string;
  }>(path);

  return {
    events: data.value ?? [],
    deltaLink: data["@odata.deltaLink"],
    nextLink: data["@odata.nextLink"],
    syncedAt: new Date().toISOString(),
  };
}

export async function createCalendarEvent(event: {
  subject: string;
  start: string;
  end: string;
  timeZone?: string;
  location?: string;
  body?: string;
  attendees?: Array<{ name: string; email: string }>;
  categories?: string[];
}): Promise<OutlookEvent> {
  const calendarName = process.env.MS365_CALENDAR_NAME || "calendar";
  const body = {
    subject: event.subject,
    start: { dateTime: event.start, timeZone: event.timeZone || "Europe/Berlin" },
    end: { dateTime: event.end, timeZone: event.timeZone || "Europe/Berlin" },
    location: event.location ? { displayName: event.location } : undefined,
    body: event.body ? { contentType: "text", content: event.body } : undefined,
    attendees: event.attendees?.map((a) => ({
      emailAddress: { name: a.name, address: a.email },
      type: "required",
    })),
    categories: event.categories,
  };

  const res = await graphFetch(`/me/calendars/${encodeURIComponent(calendarName)}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create event: ${res.status} ${text}`);
  }

  return (await res.json()) as OutlookEvent;
}

// ── Mail Delta Sync ───────────────────────────────────────────────────

export interface OutlookMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime: string;
  hasAttachments: boolean;
  webLink?: string;
  conversationId?: string;
  categories?: string[];
}

export interface MailSyncResult {
  messages: OutlookMessage[];
  deltaLink?: string;
  nextLink?: string;
  syncedAt: string;
}

export async function syncMail(opts?: {
  folder?: string;
  deltaLink?: string;
  maxResults?: number;
}): Promise<MailSyncResult> {
  const folder = opts?.folder || process.env.MS365_OUTLOOK_FOLDER || "Inbox";
  const maxResults = opts?.maxResults ?? 50;

  if (opts?.deltaLink) {
    const data = await graphGetJson<{
      value: OutlookMessage[];
      "@odata.deltaLink"?: string;
      "@odata.nextLink"?: string;
    }>(opts.deltaLink.replace(GRAPH_BASE, ""));
    return {
      messages: data.value ?? [],
      deltaLink: data["@odata.deltaLink"],
      nextLink: data["@odata.nextLink"],
      syncedAt: new Date().toISOString(),
    };
  }

  const params = new URLSearchParams({
    $top: String(maxResults),
    $select:
      "id,subject,bodyPreview,from,receivedDateTime,hasAttachments,webLink,conversationId,categories",
    $orderby: "receivedDateTime desc",
  });

  const path = `/me/mailFolders/${encodeURIComponent(folder)}/messages?${params}`;
  const data = await graphGetJson<{
    value: OutlookMessage[];
    "@odata.deltaLink"?: string;
    "@odata.nextLink"?: string;
  }>(path);

  return {
    messages: data.value ?? [],
    deltaLink: data["@odata.deltaLink"],
    nextLink: data["@odata.nextLink"],
    syncedAt: new Date().toISOString(),
  };
}

// ── Contact Sync ──────────────────────────────────────────────────────

export interface OutlookContact {
  id: string;
  displayName: string;
  emailAddresses?: Array<{ address?: string; name?: string }>;
  phoneNumbers?: Array<{ number?: string; type?: string }>;
  company?: string;
  jobTitle?: string;
}

export async function syncContacts(opts?: { maxResults?: number }): Promise<{
  contacts: OutlookContact[];
  syncedAt: string;
}> {
  const maxResults = opts?.maxResults ?? 100;
  const params = new URLSearchParams({
    $top: String(maxResults),
    $select: "id,displayName,emailAddresses,phoneNumbers,companyName,jobTitle",
  });

  const data = await graphGetJson<{ value: OutlookContact[] }>(`/me/contacts?${params}`);
  return {
    contacts: data.value ?? [],
    syncedAt: new Date().toISOString(),
  };
}

// ── Health Check ──────────────────────────────────────────────────────

export async function checkGraphHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    await graphGetJson("/organization?$select=id,displayName");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function isMsGraphConfigured(): boolean {
  return Boolean(MS365_CLIENT_ID && MS365_CLIENT_SECRET && MS365_TENANT_ID);
}
