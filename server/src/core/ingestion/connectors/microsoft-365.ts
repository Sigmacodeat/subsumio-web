/**
 * Microsoft 365 connectors for Microsoft Graph.
 *
 * Uses Microsoft identity platform client credentials flow and Graph delta
 * queries for Outlook messages plus OneDrive/SharePoint drive items.
 */

import { BaseConnector, type ConnectorConfig, type ConnectorItem } from "./base.ts";
import { computeContentHash, type IngestionContentType, type IngestionEvent } from "../types.ts";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

interface GraphDeltaResponse<T> {
  value?: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  lastModifiedDateTime?: string;
  webLink?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  hasAttachments?: boolean;
  internetMessageId?: string;
}

interface GraphDriveItem {
  id: string;
  name?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
  size?: number;
  file?: { mimeType?: string };
  folder?: unknown;
  deleted?: unknown;
  parentReference?: { driveId?: string; path?: string; siteId?: string };
}

abstract class MicrosoftGraphConnector extends BaseConnector {
  constructor(service: string, config: ConnectorConfig) {
    super(service, config);
  }

  getApiRateLimit(): { capacity: number; windowMs: number } {
    return { capacity: 1000, windowMs: 60_000 };
  }

  async refreshToken(): Promise<void> {
    const tenantId = String(
      this._config.filters?.tenant_id ?? this._config.filters?.tenantId ?? ""
    );
    const clientId = this._config.client_id ?? "";
    const clientSecret = this._config.client_secret ?? "";
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("Microsoft 365 connector missing tenant_id, client_id, or client_secret");
    }

    const res = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Microsoft token refresh failed: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in?: number };
    this.updateTokens(data.access_token, undefined, data.expires_in ?? 3600);
  }

  protected async graphGet<T>(pathOrUrl: string): Promise<T> {
    let token = this.getAccessToken();
    if (!token) {
      await this.refreshToken();
      token = this.getAccessToken();
    }
    if (!token) throw new Error("Microsoft Graph access token missing");

    const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) {
        await this.refreshToken();
      }
      throw new Error(`Microsoft Graph request failed: ${res.status} ${text}`);
    }

    return (await res.json()) as T;
  }

  protected nextCursor<T>(data: GraphDeltaResponse<T>, fallback?: string): string | undefined {
    return data["@odata.nextLink"] ?? data["@odata.deltaLink"] ?? fallback;
  }
}

export class MicrosoftOutlookConnector extends MicrosoftGraphConnector {
  constructor(config: ConnectorConfig = {}) {
    super("ms365-outlook", config);
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const userId = String(this._config.filters?.user_id ?? this._config.filters?.user ?? "");
    if (!userId) throw new Error("Microsoft Outlook connector requires filters.user_id");
    const folderId = String(
      this._config.filters?.folder_id ?? this._config.filters?.folder ?? "inbox"
    );
    const select = [
      "id",
      "subject",
      "bodyPreview",
      "receivedDateTime",
      "lastModifiedDateTime",
      "webLink",
      "from",
      "toRecipients",
      "hasAttachments",
      "internetMessageId",
    ].join(",");
    const initialPath = `/users/${encodeURIComponent(userId)}/mailFolders/${encodeURIComponent(folderId)}/messages/delta?$select=${select}`;
    const data = await this.graphGet<GraphDeltaResponse<GraphMessage>>(cursor || initialPath);

    const items = (data.value ?? []).map((message) => {
      const from = message.from?.emailAddress;
      const to = (message.toRecipients ?? [])
        .map((recipient) => recipient.emailAddress?.address || recipient.emailAddress?.name)
        .filter(Boolean)
        .join(", ");
      const received =
        message.receivedDateTime ?? message.lastModifiedDateTime ?? new Date().toISOString();
      const content = [
        `# ${message.subject || "(no subject)"}`,
        "",
        `- From: ${from?.address || from?.name || "unknown"}`,
        to ? `- To: ${to}` : "",
        `- Received: ${received}`,
        message.hasAttachments ? "- Attachments: yes" : "",
        "",
        message.bodyPreview || "",
      ]
        .filter(Boolean)
        .join("\n");

      return {
        id: message.id,
        title: message.subject || "(no subject)",
        modified_at: message.lastModifiedDateTime ?? received,
        content,
        content_type: "text/markdown",
        url: message.webLink,
        metadata: {
          connector: this.service,
          message_id: message.id,
          internet_message_id: message.internetMessageId,
          folder_id: folderId,
          user_id: userId,
          from: from?.address || from?.name,
          to,
          received_at: received,
          has_attachments: Boolean(message.hasAttachments),
        },
      } satisfies ConnectorItem;
    });

    return { items, nextCursor: this.nextCursor(data, cursor) };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    return graphItemToEvent(this, item, "email");
  }
}

abstract class MicrosoftDriveConnector extends MicrosoftGraphConnector {
  protected abstract readonly pageType: "ms365_onedrive_document" | "ms365_sharepoint_document";

  protected buildInitialDeltaPath(): string {
    const driveId = this._config.filters?.drive_id ? String(this._config.filters.drive_id) : "";
    if (driveId) return `/drives/${encodeURIComponent(driveId)}/root/delta`;

    const userId = this._config.filters?.user_id ? String(this._config.filters.user_id) : "";
    if (userId) return `/users/${encodeURIComponent(userId)}/drive/root/delta`;

    const siteId = this._config.filters?.site_id ? String(this._config.filters.site_id) : "";
    if (siteId) return `/sites/${encodeURIComponent(siteId)}/drive/root/delta`;

    return "/me/drive/root/delta";
  }

  async fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }> {
    const data = await this.graphGet<GraphDeltaResponse<GraphDriveItem>>(
      cursor || this.buildInitialDeltaPath()
    );
    const items = (data.value ?? [])
      .filter((item) => !item.deleted && !item.folder)
      .map((item) => {
        const modified =
          item.lastModifiedDateTime ?? item.createdDateTime ?? new Date().toISOString();
        const contentType = this.detectContentType(item.name ?? item.id, item.file?.mimeType);
        const content = [
          `# ${item.name || item.id}`,
          "",
          `- Modified: ${modified}`,
          typeof item.size === "number" ? `- Size: ${item.size}` : "",
          item.webUrl ? `- URL: ${item.webUrl}` : "",
          item.parentReference?.path ? `- Path: ${item.parentReference.path}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        return {
          id: item.id,
          title: item.name || item.id,
          modified_at: modified,
          content,
          content_type: contentType,
          url: item.webUrl,
          metadata: {
            connector: this.service,
            graph_item_id: item.id,
            drive_id: item.parentReference?.driveId,
            site_id: item.parentReference?.siteId,
            path: item.parentReference?.path,
            size: item.size,
            mime_type: item.file?.mimeType,
          },
        } satisfies ConnectorItem;
      });

    return { items, nextCursor: this.nextCursor(data, cursor) };
  }

  async toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent> {
    return graphItemToEvent(this, item, this.pageType);
  }
}

export class MicrosoftOneDriveConnector extends MicrosoftDriveConnector {
  protected readonly pageType = "ms365_onedrive_document" as const;

  constructor(config: ConnectorConfig = {}) {
    super("ms365-onedrive", config);
  }
}

export class MicrosoftSharePointConnector extends MicrosoftDriveConnector {
  protected readonly pageType = "ms365_sharepoint_document" as const;

  constructor(config: ConnectorConfig = {}) {
    super("ms365-sharepoint", config);
  }
}

function graphItemToEvent(
  connector: BaseConnector,
  item: ConnectorItem,
  pageType: string
): IngestionEvent {
  const content = [
    `---`,
    `title: "${String(item.title).replace(/"/g, '\\"')}"`,
    `type: ${pageType}`,
    `connector: ${connector.service}`,
    item.url ? `source_url: "${item.url.replace(/"/g, '\\"')}"` : "",
    `---`,
    ``,
    item.content,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    source_id: connector.id,
    source_kind: connector.kind,
    source_uri: item.url ?? `${connector.service}://${item.id}`,
    received_at: new Date().toISOString(),
    content_type: "text/markdown" as IngestionContentType,
    content,
    content_hash: computeContentHash(content),
    metadata: item.metadata,
  };
}
