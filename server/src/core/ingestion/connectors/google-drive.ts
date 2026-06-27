/**
 * GoogleDriveConnector — ingest Google Drive files into GBrain.
 *
 * Features:
 *   - OAuth2 token refresh
 *   - Delta sync via Drive API changes() (state token / pageToken)
 *   - Content-type routing: PDF → application/pdf, DOCX → text extraction
 *   - Webhook push notifications (optional, requires domain verification)
 *   - Folder filtering (sync only specific Drive folders)
 *
 * Setup:
 *   1. Create OAuth2 credentials at https://console.cloud.google.com/
 *   2. Enable Google Drive API
 *   3. Run: gbrain connector add google-drive --client-id XXX --client-secret YYY
 *   4. Complete OAuth2 flow in browser
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import { type IngestionEvent, type IngestionContentType } from "../types.ts";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  parents?: string[];
}

interface DriveChange {
  fileId: string;
  file?: DriveFile;
  removed?: boolean;
}

export class GoogleDriveConnector extends BaseConnector {
  constructor(config: ConnectorConfig) {
    super("google-drive", config);
  }

  getApiRateLimit(): { capacity: number; windowMs: number } {
    // Google Drive API: 1,000 queries per 100 seconds per user.
    return { capacity: 1000, windowMs: 100_000 };
  }

  async refreshToken(): Promise<void> {
    const refreshToken = await this._loadState().then((s) => s?.refresh_token);
    if (!refreshToken) throw new Error("No refresh token available");

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

    // Step 1: Get changes list.
    let pageToken = cursor;
    if (!pageToken) {
      // First sync: get the latest start page token.
      const startRes = await fetch("https://www.googleapis.com/drive/v3/changes/startPageToken", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!startRes.ok) throw new Error(`startPageToken failed: ${startRes.status}`);
      const startData = await startRes.json();
      pageToken = startData.startPageToken;
    }

    const changesUrl = new URL("https://www.googleapis.com/drive/v3/changes");
    changesUrl.searchParams.set("pageToken", pageToken!);
    changesUrl.searchParams.set("pageSize", String(this._config.batch_size ?? 100));
    changesUrl.searchParams.set(
      "fields",
      "nextPageToken,newStartPageToken,changes(fileId,file(name,mimeType,modifiedTime,webViewLink,parents),removed)"
    );

    // Apply folder filter if configured.
    const folderFilter = this._config.filters?.folder as string | undefined;
    if (folderFilter) {
      changesUrl.searchParams.set("driveId", folderFilter);
      changesUrl.searchParams.set("includeItemsFromAllDrives", "true");
      changesUrl.searchParams.set("supportsAllDrives", "true");
    }

    const res = await fetch(changesUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Changes API failed: ${res.status}`);
    const data = await res.json();

    const items: ConnectorItem[] = [];
    for (const change of (data.changes ?? []) as DriveChange[]) {
      if (change.removed) continue;
      if (!change.file) continue;
      // Skip Google Workspace native formats that need export.
      const file = change.file;
      if (file.mimeType.startsWith("application/vnd.google-apps.")) {
        // Convert to exportable format.
        const exportMime = this._exportMimeType(file.mimeType);
        if (!exportMime) continue;
        items.push({
          id: file.id,
          title: file.name,
          modified_at: file.modifiedTime,
          content: `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportMime)}`,
          content_type: exportMime,
          url: file.webViewLink,
          metadata: { drive_mime: file.mimeType, export_mime: exportMime, parents: file.parents },
        });
      } else {
        items.push({
          id: file.id,
          title: file.name,
          modified_at: file.modifiedTime,
          content: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          content_type: file.mimeType,
          url: file.webViewLink,
          metadata: { drive_mime: file.mimeType, parents: file.parents },
        });
      }
    }

    return {
      items,
      nextCursor: data.nextPageToken ?? data.newStartPageToken,
    };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    // Download the file content.
    const token = this.getAccessToken();
    if (!token) throw new Error("Not authenticated");

    const contentUrl = item.content; // either export URL or media URL
    const res = await fetch(contentUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const mime = item.content_type ?? "unknown";
    let content: string;

    if (mime === "text/html" || mime === "text/plain" || mime === "text/markdown") {
      content = await res.text();
    } else if (mime === "application/pdf") {
      // For PDFs, download binary and let the document processor handle it.
      const buf = Buffer.from(await res.arrayBuffer());
      content = buf.toString("base64");
    } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      // DOCX — download binary for extract-document.ts.
      const buf = Buffer.from(await res.arrayBuffer());
      content = buf.toString("base64");
    } else {
      // Binary: store as base64 or reference.
      const buf = Buffer.from(await res.arrayBuffer());
      content = buf.toString("base64");
    }

    const detectedType = this.detectContentType(item.title ?? "", mime) as IngestionContentType;

    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `google-drive://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: detectedType,
      content,
      content_hash: this.hashContent(content),
      metadata: {
        ...item.metadata,
        connector: this.service,
        drive_file_id: item.id,
        drive_filename: item.title,
      },
    };
  }

  private _exportMimeType(driveMime: string): string | null {
    const map: Record<string, string> = {
      "application/vnd.google-apps.document": "text/plain",
      "application/vnd.google-apps.spreadsheet": "text/csv",
      "application/vnd.google-apps.presentation": "text/plain",
    };
    return map[driveMime] ?? null;
  }

  // ── Push webhook (Google Drive changes.watch) ─────────────────────────

  /**
   * Register a push webhook with Google Drive.
   * Requires a publicly accessible webhookUrl (e.g. via ngrok for local dev).
   * Google verifies the domain; for localhost use polling instead.
   */
  async registerWebhook(): Promise<void> {
    const webhookUrl = this._config.webhook_url as string | undefined;
    if (!webhookUrl) {
      this._ctx?.logger.warn(`[${this.id}] No webhook_url configured; falling back to polling`);
      return;
    }

    const token = this.getAccessToken();
    if (!token) throw new Error("Not authenticated");

    // Generate a unique channel id for this connector instance.
    const channelId = `gbrain-drive-${this.id}-${Date.now()}`;

    const res = await fetch("https://www.googleapis.com/drive/v3/changes/watch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        payload: true,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Drive changes.watch failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as { resourceId: string; expiration?: string };

    // Persist channel info for verification and cleanup.
    if (this._state) {
      this._state.webhook_channel_id = channelId;
      this._state.webhook_resource_id = data.resourceId;
      if (data.expiration) {
        this._state.webhook_expires_at = parseInt(data.expiration, 10);
      }
      await this._saveState(this._state);
    }

    this._ctx?.logger.info(`[${this.id}] Drive push webhook registered (channel: ${channelId})`);
  }

  async unregisterWebhook(): Promise<void> {
    const channelId = this._state?.webhook_channel_id as string | undefined;
    const resourceId = this._state?.webhook_resource_id as string | undefined;
    if (!channelId || !resourceId) return;

    const token = this.getAccessToken();
    if (!token) return;

    try {
      await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: channelId, resourceId }),
      });
    } catch {
      /* non-fatal: channel may have already expired */
    }

    if (this._state) {
      delete this._state.webhook_channel_id;
      delete this._state.webhook_resource_id;
      delete this._state.webhook_expires_at;
      await this._saveState(this._state);
    }

    this._ctx?.logger.info(`[${this.id}] Drive push webhook unregistered`);
  }
}
