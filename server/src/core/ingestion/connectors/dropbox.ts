/**
 * DropboxConnector — ingest files from Dropbox.
 *
 * Authentication: Dropbox OAuth2 (PKCE) or long-lived access token.
 *   - Create app at https://www.dropbox.com/developers/apps
 *   - Enable "files.content.read" scope
 *
 * Delta sync: Dropbox API v2 `files/list_folder/continue` with cursor.
 * Rate limit: 1,000 req / 300s (approx 3.3 req/s). Uses conservative 2 req/s.
 *
 * Setup:
 *   gbrain connector add dropbox --api-key ACCESS_TOKEN
 *   gbrain connector sync dropbox
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import type { IngestionEvent } from "../types.ts";

const DROPBOX_API_BASE = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2";

interface DropboxFile {
  id: string;
  name: string;
  path_display: string;
  path_lower: string;
  server_modified: string;
  client_modified: string;
  content_hash?: string;
  size: number;
}

interface DropboxFolderEntry {
  ".tag": "file" | "folder";
  id: string;
  name: string;
  path_display?: string;
  path_lower?: string;
  server_modified?: string;
  client_modified?: string;
  content_hash?: string;
  size?: number;
}

export class DropboxConnector extends BaseConnector {
  constructor(config: ConnectorConfig = {}) {
    super("dropbox", config);
  }

  getApiRateLimit() {
    return { capacity: 6, windowMs: 3_000 };
  }

  async refreshToken(): Promise<void> {
    // Dropbox long-lived tokens don't expire by default.
    // Short-lived tokens (4h) with refresh_token are supported but
    // most integrations use long-lived tokens. No-op here.
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const token = this.getAccessToken();
    if (!token)
      throw new Error(
        "Dropbox access token missing. Run: gbrain connector add dropbox --api-key XXX"
      );

    const folderPath = (this._config.filters?.folder as string) ?? "";

    let entries: DropboxFolderEntry[] = [];
    let nextCursor: string | undefined;

    if (!cursor) {
      // Initial sync: list_folder.
      const res = await fetch(`${DROPBOX_API_BASE}/files/list_folder`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: folderPath,
          recursive: true,
          include_media_info: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: true,
          limit: (this._config.batch_size ?? 100) as number,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Dropbox list_folder failed: ${res.status} ${err}`);
      }

      const data = (await res.json()) as {
        entries: DropboxFolderEntry[];
        cursor: string;
        has_more: boolean;
      };
      entries = data.entries;
      nextCursor = data.cursor;
    } else {
      // Delta sync: list_folder/continue.
      const res = await fetch(`${DROPBOX_API_BASE}/files/list_folder/continue`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cursor }),
      });

      if (!res.ok) {
        const err = await res.text();
        // Cursor expired → reset and start over.
        if (err.includes("invalid_cursor") || res.status === 409) {
          return this.fetchDelta(undefined);
        }
        throw new Error(`Dropbox list_folder/continue failed: ${res.status} ${err}`);
      }

      const data = (await res.json()) as {
        entries: DropboxFolderEntry[];
        cursor: string;
        has_more: boolean;
      };
      entries = data.entries;
      nextCursor = data.cursor;
    }

    const items: ConnectorItem[] = [];
    for (const entry of entries) {
      if (entry[".tag"] !== "file") continue;

      items.push({
        id: entry.id,
        title: entry.name ?? "untitled",
        modified_at: entry.server_modified ?? new Date().toISOString(),
        content: entry.path_lower ?? entry.path_display ?? "",
        content_type: this.detectContentType(entry.name ?? "", "unknown"),
        url: `https://www.dropbox.com/home${entry.path_lower ?? ""}`,
        metadata: {
          path: entry.path_display,
          path_lower: entry.path_lower,
          size: entry.size,
          content_hash: entry.content_hash,
        },
      });
    }

    return { items, nextCursor };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    const token = this.getAccessToken();
    if (!token) throw new Error("Dropbox token missing");

    // Download file content via content-download endpoint.
    const path = item.content; // stored path_lower in content field
    const res = await fetch(`${DROPBOX_CONTENT_BASE}/files/download`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path }),
      },
    });

    if (!res.ok) throw new Error(`Dropbox download failed: ${res.status}`);

    const mime = item.content_type ?? "unknown";
    let content: string;

    if (mime.startsWith("text/")) {
      content = await res.text();
    } else {
      // Binary: base64 encode for document/image/audio/video processors.
      const buf = Buffer.from(await res.arrayBuffer());
      content = buf.toString("base64");
    }

    return {
      source_id: this.id,
      source_kind: this.kind,
      source_uri: item.url ?? `dropbox://${item.id}`,
      received_at: new Date().toISOString(),
      content_type: this.detectContentType(item.title ?? "", mime),
      content,
      content_hash: this.hashContent(content),
      metadata: {
        ...item.metadata,
        connector: this.service,
        dropbox_file_id: item.id,
        dropbox_filename: item.title,
      },
    };
  }
}
