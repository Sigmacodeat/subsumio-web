/**
 * CalendarConnector — ingest events from Google Calendar.
 *
 * Authentication: OAuth2 (same flow as Google Drive / Gmail)
 * Scopes: https://www.googleapis.com/auth/calendar.readonly
 *
 * Delta sync: Google Calendar API v3 syncToken (event list incremental).
 * Rate limit: 1000 req / 100s (shared with Google Drive quota).
 *
 * Setup:
 *   gbrain connector add calendar --client-id XXX --client-secret YYY
 *   gbrain connector auth calendar
 *   gbrain connector sync calendar
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from './base.ts';
import type { IngestionEvent } from '../types.ts';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export class CalendarConnector extends BaseConnector {
  constructor(config: ConnectorConfig = {}) {
    super('calendar', config);
  }

  getApiRateLimit() {
    return { capacity: 100, windowMs: 100_000 };
  }

  async refreshToken(): Promise<void> {
    const refreshToken = this._state?.refresh_token;
    const clientId = this._config.client_id;
    const clientSecret = this._config.client_secret;
    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error('Calendar connector missing refresh token or client credentials');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Calendar token refresh failed: ${err}`);
    }

    const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
    this.updateTokens(data.access_token, data.refresh_token ?? refreshToken, data.expires_in);
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const token = this.getAccessToken();
    if (!token) throw new Error('Calendar access token missing. Run: gbrain connector auth calendar');

    const calendarIds = (this._config.filters?.calendars as string[]) ?? ['primary'];
    const items: ConnectorItem[] = [];
    let latestSyncToken = cursor;

    for (const calId of calendarIds) {
      const url = new URL(`${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calId)}/events`);
      url.searchParams.set('maxResults', '100');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('showDeleted', 'true');

      // Use syncToken for delta; omit for initial full sync.
      if (cursor) {
        url.searchParams.set('syncToken', cursor);
      } else {
        url.searchParams.set('timeMin', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      }

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.text();
        // syncToken expired → reset and fall back to time-based sync.
        if (err.includes('syncToken') || err.includes('410')) {
          return this.fetchDelta(undefined);
        }
        throw new Error(`Calendar events.list failed: ${err}`);
      }

      const data = await res.json() as {
        items?: Array<{
          id: string;
          summary?: string;
          description?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
          updated?: string;
          htmlLink?: string;
          status?: string;
          creator?: { email?: string };
          attendees?: Array<{ email?: string; responseStatus?: string }>;
        }>;
        nextSyncToken?: string;
        nextPageToken?: string;
      };

      for (const ev of data.items ?? []) {
        if (ev.status === 'cancelled') continue;

        const start = ev.start?.dateTime ?? ev.start?.date ?? '';
        const end = ev.end?.dateTime ?? ev.end?.date ?? '';
        const attendees = (ev.attendees ?? []).map((a) => `${a.email} (${a.responseStatus})`).join(', ');

        const content = [
          `# ${ev.summary ?? 'Untitled Event'}`,
          ``,
          `- **When:** ${start} → ${end}`,
          `- **Organizer:** ${ev.creator?.email ?? 'unknown'}`,
          attendees ? `- **Attendees:** ${attendees}` : '',
          ev.description ? `- **Description:** ${ev.description}` : '',
          ev.htmlLink ? `- **Link:** ${ev.htmlLink}` : '',
        ].filter(Boolean).join('\n');

        items.push({
          id: `${calId}-${ev.id}`,
          title: ev.summary ?? 'Untitled Event',
          modified_at: ev.updated ?? start,
          content,
          content_type: 'text/markdown',
          url: ev.htmlLink,
          metadata: {
            calendar_id: calId,
            event_id: ev.id,
            start,
            end,
            organizer: ev.creator?.email,
            attendees: ev.attendees?.length ?? 0,
          },
        });
      }

      // Prefer nextSyncToken over nextPageToken for delta cursor.
      if (data.nextSyncToken) {
        latestSyncToken = data.nextSyncToken;
      }
    }

    return { items, nextCursor: latestSyncToken };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `calendar://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: 'text/markdown',
      content: item.content,
      content_hash: this.hashContent(item.content),
      metadata: item.metadata,
    };
  }
}
