/**
 * GmailConnector — ingest Gmail messages into GBrain as structured email pages.
 *
 * Features:
 *   - OAuth2 token refresh
 *   - Delta sync via historyId (Gmail API history.list)
 *   - Label filtering (sync only specific labels)
 *   - EML parsing via postal-mime (already in GBrain)
 *   - Thread grouping (emails in same thread linked)
 *   - Attachment handling (PDF/DOCX forwarded to document-ingest)
 *
 * Setup:
 *   1. Enable Gmail API in Google Cloud Console
 *   2. Run: gbrain connector add gmail --client-id XXX --client-secret YYY
 *   3. OAuth2 scopes: https://www.googleapis.com/auth/gmail.readonly
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import { type IngestionEvent, type IngestionContentType } from "../types.ts";

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; attachmentId?: string };
      filename?: string;
    }>;
    body?: { data?: string };
  };
  internalDate: string;
  historyId: string;
}

interface GmailHistory {
  id: string;
  messages?: Array<{ id: string; threadId: string }>;
  labelsAdded?: unknown[];
  labelsRemoved?: unknown[];
}

export class GmailConnector extends BaseConnector {
  private labelFilter?: string[];

  constructor(config: ConnectorConfig) {
    super("gmail", config);
    this.labelFilter = config.filters?.labels as string[] | undefined;
  }

  getApiRateLimit(): { capacity: number; windowMs: number } {
    // Gmail API: 250 queries per user per 100 seconds.
    return { capacity: 250, windowMs: 100_000 };
  }

  async refreshToken(): Promise<void> {
    const refreshToken = await this._loadState().then((s) => s?.refresh_token);
    if (!refreshToken) throw new Error("No refresh token");

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this._config.client_id ?? "",
        client_secret: this._config.client_secret ?? "",
      }),
    });

    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    const data = await res.json();
    this.updateTokens(data.access_token, refreshToken, data.expires_in);
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const token = this.getAccessToken();
    if (!token) throw new Error("Not authenticated");

    let historyId = cursor;
    if (!historyId) {
      // First sync: get the user's current historyId from profile.
      const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!profileRes.ok) throw new Error(`Profile failed: ${profileRes.status}`);
      const profile = await profileRes.json();
      historyId = String(profile.historyId);
    }

    // Fetch history changes.
    const historyUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
    historyUrl.searchParams.set("startHistoryId", historyId!);
    historyUrl.searchParams.set("historyTypes", "messageAdded");
    historyUrl.searchParams.set("labelId", "INBOX");
    if (this.labelFilter) {
      for (const label of this.labelFilter) {
        historyUrl.searchParams.append("labelId", label);
      }
    }

    const res = await fetch(historyUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`History API failed: ${res.status}`);
    const data = await res.json();

    const messageIds = new Set<string>();
    for (const history of (data.history ?? []) as GmailHistory[]) {
      for (const msg of history.messages ?? []) {
        messageIds.add(msg.id);
      }
    }

    // Fetch full message bodies.
    const items: ConnectorItem[] = [];
    for (const msgId of messageIds) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!msgRes.ok) continue;
      const msg: GmailMessage = await msgRes.json();

      const headers = msg.payload?.headers ?? [];
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
      const from = headers.find((h) => h.name === "From")?.value ?? "";
      const to = headers.find((h) => h.name === "To")?.value ?? "";
      const date = headers.find((h) => h.name === "Date")?.value ?? new Date().toISOString();

      // Extract body (prefer plain text, fallback to HTML).
      let body = "";
      const textPart = msg.payload?.parts?.find((p) => p.mimeType === "text/plain");
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
      } else if (msg.payload?.body?.data) {
        body = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
      }

      // Detect attachments.
      const attachments = (msg.payload?.parts ?? [])
        .filter((p) => p.filename && p.filename.length > 0)
        .map((p) => ({
          filename: p.filename!,
          mimeType: p.mimeType,
          attachmentId: p.body?.attachmentId,
        }));

      items.push({
        id: msg.id,
        title: subject,
        modified_at: new Date(parseInt(msg.internalDate)).toISOString(),
        content: body,
        content_type: "text/plain",
        url: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
        metadata: {
          thread_id: msg.threadId,
          from,
          to,
          date,
          history_id: msg.historyId,
          label_ids: msg.labelIds,
          attachments,
        },
      });
    }

    return {
      items,
      nextCursor: data.historyId ? String(data.historyId) : historyId,
    };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const meta = item.metadata ?? {};
    const from = meta.from as string;
    const to = meta.to as string;
    const date = meta.date as string;
    const threadId = meta.thread_id as string;

    // Build markdown with email structure.
    const markdown = [
      `---`,
      `title: "${item.title}"`,
      `type: email`,
      `thread_id: ${threadId}`,
      `from: "${from}"`,
      `to: "${to}"`,
      `date: "${date}"`,
      `---`,
      ``,
      `# ${item.title}`,
      ``,
      `**From:** ${from}  `,
      `**To:** ${to}  `,
      `**Date:** ${date}  `,
      `**Thread:** [Gmail Thread](https://mail.google.com/mail/u/0/#inbox/${threadId})`,
      ``,
      `## Body`,
      ``,
      item.content,
    ].join("\n");

    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `gmail://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: "text/markdown" as IngestionContentType,
      content: markdown,
      content_hash: this.hashContent(markdown),
      metadata: {
        connector: this.service,
        gmail_message_id: item.id,
        gmail_thread_id: threadId,
        gmail_labels: meta.label_ids,
      },
    };
  }
}
