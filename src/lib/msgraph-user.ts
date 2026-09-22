/**
 * Microsoft Graph — delegiertes OAuth pro Nutzer (WP-4.19).
 *
 * Anders als `msgraph.ts` (client_credentials = ein Dienst-Account für die
 * ganze Kanzlei) fließt hier der Authorization-Code-Flow pro Anwältin:
 * jede Person verbindet ihren eigenen Outlook-Kalender, die Tokens liegen
 * verschlüsselt im User-Store (`ms365*`-Felder, SENSITIVE_USER_FIELDS).
 *
 * Scopes: offline_access (Refresh-Token), User.Read (Verbunden-als-Anzeige),
 * Calendars.ReadWrite (2-Wege: lesen + Termine aus Subsumio heraus anlegen).
 *
 * Config: MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_TENANT_ID (oder
 * "common"/"organizations" für Multi-Tenant).
 */

import { getStore, type User } from "@/lib/auth/store";
import { externalFetchTimeout } from "@/lib/retry";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger("msgraph-user");

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const MS365_DELEGATED_SCOPES = "offline_access User.Read Calendars.ReadWrite";

const CLIENT_ID = process.env.MS365_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MS365_CLIENT_SECRET || "";
const TENANT = process.env.MS365_TENANT_ID || "common";

export function isDelegatedMs365Configured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function ms365RedirectUri(): string {
  return `${env("NEXT_PUBLIC_APP_URL") || "https://subsum.io"}/api/outlook/callback`;
}

export function buildMs365AuthUrl(state: string): string {
  const url = new URL(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ms365RedirectUri());
  url.searchParams.set("scope", MS365_DELEGATED_SCOPES);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export interface Ms365TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export class Ms365AuthError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "Ms365AuthError";
  }
}

async function tokenRequest(params: Record<string, string>): Promise<Ms365TokenSet> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      ...params,
    }),
    signal: externalFetchTimeout(),
  });
  const data = (await res.json().catch(() => ({}))) as Ms365TokenSet & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new Ms365AuthError(
      data.error_description || data.error || `token request failed: ${res.status}`,
      data.error ?? "ms365_token_failed"
    );
  }
  if (!data.access_token || typeof data.expires_in !== "number") {
    throw new Ms365AuthError("incomplete token response", "ms365_incomplete_token");
  }
  return data;
}

export function exchangeMs365Code(code: string): Promise<Ms365TokenSet> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: ms365RedirectUri(),
    scope: MS365_DELEGATED_SCOPES,
  });
}

/** UPN/E-Mail des verbundenen Accounts — für „Verbunden als …" in der UI. */
export async function fetchMs365Me(accessToken: string): Promise<string | undefined> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: externalFetchTimeout(),
  });
  if (!res.ok) return undefined;
  const data = (await res.json().catch(() => ({}))) as {
    mail?: string;
    userPrincipalName?: string;
  };
  return data.mail ?? data.userPrincipalName;
}

/**
 * Liefert ein gültiges Access-Token für den Nutzer — refreshed automatisch
 * wenn abgelaufen (≤60s Puffer) und persistiert das neue Token-Paar.
 * Wirft Ms365AuthError("ms365_not_connected") wenn nicht verbunden.
 */
export async function getUserMs365Token(userId: string): Promise<string> {
  const store = getStore();
  const user = await store.getById(userId);
  if (!user?.ms365AccessToken) {
    throw new Ms365AuthError("nicht verbunden", "ms365_not_connected");
  }
  const expiresAt = user.ms365TokenExpiresAt ? new Date(user.ms365TokenExpiresAt).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return user.ms365AccessToken;

  if (!user.ms365RefreshToken) {
    throw new Ms365AuthError("Token abgelaufen, kein Refresh-Token", "ms365_token_expired");
  }
  const refreshed = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: user.ms365RefreshToken,
    scope: MS365_DELEGATED_SCOPES,
  });
  await store.update(userId, {
    ms365AccessToken: refreshed.access_token,
    ms365RefreshToken: refreshed.refresh_token ?? user.ms365RefreshToken,
    ms365TokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  });
  return refreshed.access_token;
}

export async function disconnectMs365(userId: string): Promise<void> {
  await getStore().update(userId, {
    ms365AccessToken: null,
    ms365RefreshToken: null,
    ms365TokenExpiresAt: null,
    ms365UserEmail: null,
  });
}

export function isMs365Connected(user: User): boolean {
  return Boolean(user.ms365AccessToken && user.ms365RefreshToken);
}

// ── Kalender (delegiert, /me) ──────────────────────────────────────────

export interface Ms365CalendarEvent {
  id: string;
  subject?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
}

/** Alle Termine des Nutzers im Fenster [start, end] — max. `top` je Seite. */
export async function listUserCalendarEvents(
  userId: string,
  opts: { start: Date; end: Date; top?: number }
): Promise<Ms365CalendarEvent[]> {
  const token = await getUserMs365Token(userId);
  const url = new URL(`${GRAPH_BASE}/me/calendarView`);
  url.searchParams.set("startDateTime", opts.start.toISOString());
  url.searchParams.set("endDateTime", opts.end.toISOString());
  url.searchParams.set("$top", String(opts.top ?? 100));
  url.searchParams.set("$select", "id,subject,start,end,isAllDay,location,organizer");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: externalFetchTimeout(),
  });
  if (!res.ok) {
    throw new Ms365AuthError(`calendarView failed: ${res.status}`, "ms365_calendar_failed");
  }
  const data = (await res.json().catch(() => ({}))) as { value?: Ms365CalendarEvent[] };
  return data.value ?? [];
}

/** 2-Wege: Termin aus Subsumio in den Outlook-Kalender des Nutzers schreiben. */
export async function createUserCalendarEvent(
  userId: string,
  event: { subject: string; start: string; end: string; location?: string }
): Promise<string | undefined> {
  const token = await getUserMs365Token(userId);
  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: event.subject.slice(0, 255),
      start: { dateTime: event.start, timeZone: "Europe/Vienna" },
      end: { dateTime: event.end, timeZone: "Europe/Vienna" },
      ...(event.location ? { location: { displayName: event.location.slice(0, 300) } } : {}),
    }),
    signal: externalFetchTimeout(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log.warn("create event failed", { status: res.status, body: text.slice(0, 300) });
    throw new Ms365AuthError(`event create failed: ${res.status}`, "ms365_event_failed");
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return data.id;
}
