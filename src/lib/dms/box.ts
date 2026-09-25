/**
 * Box Cloud Storage Connector für Subsumio.
 * Box API v2.0 — https://developer.box.com/reference/
 *
 * Konfiguration via Umgebungsvariablen:
 *   DMS_PROVIDER              — "box"
 *   DMS_API_KEY               — Box Developer Token or JWT access token
 *   BOX_FOLDER_ID             — Root folder ID (optional, defaults to "0" = All Files)
 *   BOX_ENTERPRISE_ID         — Enterprise ID (optional, for JWT auth)
 */

import {
  type DMSConnector,
  type DMSDocument,
  type DMSSearchResult,
  type DMSPushResult,
  type DMSSettings,
  type DMSImportOptions,
  DMS_API_KEY,
  dmsAuthHeaders,
  dmsFetchJson,
  fetchDmsContent,
  isDmsConfigured,
  importToBrainCommon,
} from "./index";

const BOX_API = "https://api.box.com/2.0";

interface BoxItem {
  id: string;
  type: "file" | "folder";
  name: string;
  description?: string;
  size?: number;
  modified_at?: string;
  created_at?: string;
  created_by?: { id: string; name: string; login: string };
  path_collection?: {
    entries: Array<{ id: string; name: string }>;
  };
  parent?: { id: string; name: string };
}

interface BoxSearchResponse {
  entries: BoxItem[];
  total_count: number;
  limit: number;
  offset: number;
}

interface BoxFolderResponse {
  item_collection: {
    entries: BoxItem[];
    total_count: number;
    limit: number;
    offset: number;
  };
}

function boxItemToDocument(item: BoxItem): DMSDocument {
  return {
    id: item.id,
    name: item.name,
    type: item.type === "folder" ? "folder" : "file",
    author: item.created_by?.name ?? item.created_by?.login ?? "",
    modifiedDate: item.modified_at ?? item.created_at ?? "",
    size: item.size,
  };
}

function boxItemToFolder(item: BoxItem): {
  id: string;
  name: string;
  path: string;
  documentCount?: number;
} {
  const path = item.path_collection?.entries?.map((e) => e.name).join("/") ?? "";
  return {
    id: item.id,
    name: item.name,
    path: path ? `/${path}/${item.name}` : `/${item.name}`,
  };
}

/** Connector bound to one Box account (a firm's own settings or the installation env). */
export function createBoxConnector(settings: DMSSettings): DMSConnector {
  return {
    name: "Box",

    isConfigured(): boolean {
      return isDmsConfigured(settings);
    },

    async search(
      query: string,
      opts?: { limit?: number; folderId?: string }
    ): Promise<DMSSearchResult> {
      const limit = opts?.limit ?? 50;
      const params = new URLSearchParams({
        query,
        limit: String(limit),
        fields: "id,type,name,description,size,modified_at,created_at,path_collection,parent",
      });
      if (opts?.folderId) {
        params.set("ancestor_folder_ids", opts.folderId);
      }

      const data = await dmsFetchJson<BoxSearchResponse>(`${BOX_API}/search?${params}`, {
        headers: dmsAuthHeaders(settings),
      });

      const entries = data.entries ?? [];
      return {
        documents: entries.filter((e) => e.type === "file").map(boxItemToDocument),
        folders: entries.filter((e) => e.type === "folder").map(boxItemToFolder),
        totalCount: data.total_count ?? 0,
      };
    },

    async getDocument(docId: string): Promise<DMSDocument | null> {
      try {
        const data = await dmsFetchJson<BoxItem>(`${BOX_API}/files/${docId}`, {
          headers: dmsAuthHeaders(settings),
        });
        return boxItemToDocument(data);
      } catch {
        return null;
      }
    },

    async getDocumentContent(docId: string) {
      return fetchDmsContent(`${BOX_API}/files/${encodeURIComponent(docId)}/content`, settings);
    },

    async getFolderContents(folderId: string): Promise<DMSSearchResult> {
      const data = await dmsFetchJson<BoxFolderResponse>(
        `${BOX_API}/folders/${folderId}/items?fields=id,type,name,description,size,modified_at,created_at,created_by,path_collection,parent&limit=100`,
        { headers: dmsAuthHeaders(settings) }
      );

      const entries = data.item_collection?.entries ?? [];
      return {
        documents: entries.filter((e) => e.type === "file").map(boxItemToDocument),
        folders: entries.filter((e) => e.type === "folder").map(boxItemToFolder),
        totalCount: data.item_collection?.total_count ?? 0,
      };
    },

    async importToBrain(
      doc: DMSDocument,
      brainId: string,
      headers: Record<string, string>,
      opts?: DMSImportOptions
    ): Promise<{ slug: string; success: boolean }> {
      return importToBrainCommon(
        doc,
        brainId,
        headers,
        "Box",
        `${BOX_API}/files/${encodeURIComponent(doc.id)}/content`,
        settings,
        opts
      );
    },

    async pushToDms(
      filename: string,
      contentBase64: string,
      opts: { folderId?: string; metadata?: Record<string, string> }
    ): Promise<DMSPushResult> {
      const folderId = opts.folderId ?? (settings.boxFolderId || "0");
      const content = Buffer.from(contentBase64, "base64").toString("utf-8");

      const formData = new FormData();
      const attributes = JSON.stringify({
        name: filename,
        parent: { id: folderId },
        ...(opts.metadata
          ? {
              description: Object.entries(opts.metadata)
                .map(([k, v]) => `${k}: ${v}`)
                .join("\n"),
            }
          : {}),
      });
      formData.append("attributes", attributes);
      formData.append("file", new Blob([content], { type: "text/plain" }), filename);

      const uploadRes = await fetch(`${BOX_API}/files/content`, {
        method: "POST",
        headers: dmsAuthHeaders(settings),
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => "");
        return {
          success: false,
          error: `Box upload failed: ${uploadRes.status} ${text.slice(0, 200)}`,
        };
      }

      const result = (await uploadRes.json()) as { entries?: BoxItem[] };
      const file = result.entries?.[0];

      return {
        success: true,
        documentId: file?.id,
      };
    },
  };
}

/** Installation (env) connector — transitional single-tenant path. */
export const boxConnector = createBoxConnector({
  provider: "box",
  baseUrl: "",
  apiKey: DMS_API_KEY,
  boxFolderId: process.env.BOX_FOLDER_ID || null,
});
