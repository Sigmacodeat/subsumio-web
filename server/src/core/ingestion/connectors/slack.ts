/**
 * SlackConnector — ingest messages from Slack channels.
 *
 * Authentication: Slack Bot token (xoxb-...)
 * Setup: https://api.slack.com/apps → Create App → Add Bot Token Scopes:
 *   - channels:history
 *   - groups:history
 *   - im:history
 *   - mpim:history
 *   - channels:read
 *   - groups:read
 *
 * Delta sync: timestamp-based cursor (oldest message ts per channel).
 * Rate limit: Tier 1 — 1 req/sec per method, burst 1.
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent, IngestionSourceContext } from "../types.ts";

const SLACK_API_BASE = "https://slack.com/api";

export class SlackConnector extends BaseConnector {
  constructor(config: ConnectorConfig = {}) {
    super("slack", config);
  }

  getApiRateLimit() {
    return { capacity: 1, windowMs: 1000 };
  }

  async refreshToken(): Promise<void> {
    // Slack bot tokens don't expire; no-op.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const token = this.getAccessToken();
    if (!token) throw new Error("Slack bot token not configured");

    const channels = await this._listChannels(token);
    const channelFilter = (this._config.filters?.channels as string[]) ?? [];

    const items: ConnectorItem[] = [];
    let latestCursor = cursor;

    for (const channel of channels) {
      if (channelFilter.length > 0 && !channelFilter.includes(channel.name)) continue;

      const oldest = cursor ? parseFloat(cursor) : 0;
      const messages = await this._fetchMessages(token, channel.id, oldest);

      for (const msg of messages) {
        if (!msg.text) continue;
        items.push({
          id: `${channel.id}-${msg.ts}`,
          title: `${channel.name}: ${msg.text.slice(0, 80)}`,
          modified_at: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          content: msg.text,
          content_type: "text/plain",
          url: `https://app.slack.com/client/${channel.id}/thread/${msg.ts}`,
          metadata: {
            channel: channel.name,
            channel_id: channel.id,
            user: msg.user,
            ts: msg.ts,
          },
        });
      }

      // Track the latest timestamp seen across all channels.
      if (messages.length > 0) {
        const maxTs = Math.max(...messages.map((m) => parseFloat(m.ts)));
        if (!latestCursor || maxTs > parseFloat(latestCursor)) {
          latestCursor = String(maxTs);
        }
      }
    }

    return { items, nextCursor: latestCursor };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `slack://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: "text/plain",
      content: item.content,
      content_hash: this.hashContent(item.content),
      metadata: item.metadata,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private async _listChannels(token: string): Promise<Array<{ id: string; name: string }>> {
    const res = await fetch(
      `${SLACK_API_BASE}/conversations.list?types=public_channel,private_channel`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const data = (await res.json()) as {
      ok: boolean;
      channels?: Array<{ id: string; name: string }>;
      error?: string;
    };
    if (!data.ok) throw new Error(`Slack conversations.list failed: ${data.error}`);
    return data.channels ?? [];
  }

  private async _fetchMessages(
    token: string,
    channelId: string,
    oldest: number
  ): Promise<Array<{ ts: string; text: string; user?: string }>> {
    const url = new URL(`${SLACK_API_BASE}/conversations.history`);
    url.searchParams.set("channel", channelId);
    url.searchParams.set("oldest", String(oldest));
    url.searchParams.set("limit", "100");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as {
      ok: boolean;
      messages?: Array<{ ts: string; text: string; user?: string; subtype?: string }>;
      error?: string;
    };
    if (!data.ok) throw new Error(`Slack conversations.history failed: ${data.error}`);

    // Filter out bot/system messages (optional; keep join/leave out).
    return (data.messages ?? []).filter((m) => !m.subtype && m.text);
  }
}
