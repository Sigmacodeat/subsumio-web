/**
 * SharePoint Online / On-Premise Konnektor für Subsumio.
 * Microsoft Graph API für SharePoint Online; REST API für On-Premise.
 * Referenz: https://learn.microsoft.com/en-us/graph/api/resources/sharepoint
 *
 * Konfiguration via Umgebungsvariablen:
 *   DMS_PROVIDER              — "sharepoint"
 *   DMS_BASE_URL              — SharePoint site URL (e.g. https://contoso.sharepoint.com/sites/legal)
 *   DMS_API_KEY               — Bearer token (Microsoft Graph access token)
 *   SHAREPOINT_SITE_ID        — Site ID (optional, auto-discovered if not set)
 *   SHAREPOINT_DRIVE_ID       — Document library drive ID (optional, auto-discovered)
 */

import {
  type DMSConnector,
  type DMSDocument,
  type DMSSearchResult,
  type DMSPushResult,
  DMS_BASE,
  dmsAuthHeaders,
  dmsFetchJson,
  isDmsConfigured,
  importToBrainCommon,
} from "./index";

const SHAREPOINT_SITE_ID = process.env.SHAREPOINT_SITE_ID || "";
const SHAREPOINT_DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID || "";

function graphBase(): string {
  return "https://graph.microsoft.com/v1.0";
}

async function resolveSiteId(): Promise<string> {
  if (SHAREPOINT_SITE_ID) return SHAREPOINT_SITE_ID;
  const siteUrl = new URL(DMS_BASE);
  const hostname = siteUrl.hostname;
  const sitePath = siteUrl.pathname.replace(/^\/sites\//, "").replace(/^\//, "");
  const data = await dmsFetchJson<{ id: string }>(`${graphBase()}/sites/${hostname}:/${sitePath}`, {
    headers: dmsAuthHeaders(),
  });
  return data.id;
}

async function resolveDriveId(siteId: string): Promise<string> {
  if (SHAREPOINT_DRIVE_ID) return SHAREPOINT_DRIVE_ID;
  const data = await dmsFetchJson<{ value: Array<{ id: string; name: string }> }>(
    `${graphBase()}/sites/${siteId}/drives`,
    { headers: dmsAuthHeaders() }
  );
  const drive = data.value?.find((d) => d.name === "Documents") ?? data.value?.[0];
  if (!drive) throw new Error("No document library found in SharePoint site");
  return drive.id;
}

export const sharePointConnector: DMSConnector = {
  name: "SharePoint",

  isConfigured(): boolean {
    return isDmsConfigured();
  },

  async search(
    query: string,
    opts?: { limit?: number; folderId?: string }
  ): Promise<DMSSearchResult> {
    const siteId = await resolveSiteId();
    const driveId = await resolveDriveId(siteId);
    const limit = opts?.limit ?? 50;

    let url: string;
    if (query.trim()) {
      url = `${graphBase()}/sites/${siteId}/drive/root/search(q='${encodeURIComponent(query)}')?$top=${limit}`;
    } else if (opts?.folderId) {
      url = `${graphBase()}/drives/${driveId}/items/${opts.folderId}/children?$top=${limit}`;
    } else {
      url = `${graphBase()}/drives/${driveId}/root/children?$top=${limit}`;
    }

    const data = await dmsFetchJson<{
      value?: Array<{
        id: string;
        name: string;
        file?: { mimeType?: string };
        folder?: { childCount?: number };
        createdBy?: { user?: { displayName?: string } };
        lastModifiedDateTime?: string;
        size?: number;
        parentReference?: { path?: string };
      }>;
      "@odata.nextLink"?: string;
    }>(url, { headers: dmsAuthHeaders() });

    const documents: DMSDocument[] = [];
    const folders: Array<{ id: string; name: string; path: string; documentCount?: number }> = [];

    for (const item of data.value ?? []) {
      if (item.folder) {
        folders.push({
          id: item.id,
          name: item.name,
          path: item.parentReference?.path ?? item.name,
          documentCount: item.folder.childCount,
        });
      } else if (item.file) {
        documents.push({
          id: item.id,
          name: item.name,
          type: item.file.mimeType ?? "document",
          author: item.createdBy?.user?.displayName ?? "—",
          modifiedDate: item.lastModifiedDateTime ?? new Date().toISOString(),
          size: item.size,
        });
      }
    }

    return {
      documents,
      folders,
      totalCount: documents.length + folders.length,
    };
  },

  async getDocument(docId: string): Promise<DMSDocument | null> {
    const siteId = await resolveSiteId();
    const driveId = await resolveDriveId(siteId);
    try {
      const item = await dmsFetchJson<{
        id: string;
        name: string;
        file?: { mimeType?: string };
        createdBy?: { user?: { displayName?: string } };
        lastModifiedDateTime?: string;
        size?: number;
      }>(`${graphBase()}/drives/${driveId}/items/${docId}`, {
        headers: dmsAuthHeaders(),
      });
      return {
        id: item.id,
        name: item.name,
        type: item.file?.mimeType ?? "document",
        author: item.createdBy?.user?.displayName ?? "—",
        modifiedDate: item.lastModifiedDateTime ?? new Date().toISOString(),
        size: item.size,
      };
    } catch {
      return null;
    }
  },

  async getFolderContents(folderId: string): Promise<DMSSearchResult> {
    const siteId = await resolveSiteId();
    const driveId = await resolveDriveId(siteId);
    const data = await dmsFetchJson<{
      value?: Array<{
        id: string;
        name: string;
        file?: { mimeType?: string };
        folder?: { childCount?: number };
        createdBy?: { user?: { displayName?: string } };
        lastModifiedDateTime?: string;
        size?: number;
        parentReference?: { path?: string };
      }>;
    }>(`${graphBase()}/drives/${driveId}/items/${folderId}/children?$top=100`, {
      headers: dmsAuthHeaders(),
    });

    const documents: DMSDocument[] = [];
    const folders: Array<{ id: string; name: string; path: string; documentCount?: number }> = [];

    for (const item of data.value ?? []) {
      if (item.folder) {
        folders.push({
          id: item.id,
          name: item.name,
          path: item.parentReference?.path ?? item.name,
          documentCount: item.folder.childCount,
        });
      } else if (item.file) {
        documents.push({
          id: item.id,
          name: item.name,
          type: item.file.mimeType ?? "document",
          author: item.createdBy?.user?.displayName ?? "—",
          modifiedDate: item.lastModifiedDateTime ?? new Date().toISOString(),
          size: item.size,
        });
      }
    }

    return { documents, folders, totalCount: documents.length + folders.length };
  },

  async importToBrain(
    doc: DMSDocument,
    brainId: string,
    headers: Record<string, string>
  ): Promise<{ slug: string; success: boolean }> {
    const siteId = await resolveSiteId();
    const driveId = await resolveDriveId(siteId);
    return importToBrainCommon(
      doc,
      brainId,
      headers,
      "SharePoint",
      `${graphBase()}/drives/${driveId}/items/${doc.id}/content`
    );
  },

  async pushToDms(
    filename: string,
    contentBase64: string,
    opts: { folderId?: string; metadata?: Record<string, string> }
  ): Promise<DMSPushResult> {
    try {
      const siteId = await resolveSiteId();
      const driveId = await resolveDriveId(siteId);
      const parentId = opts.folderId ?? "root";
      const url = `${graphBase()}/drives/${driveId}/items/${parentId}:/${encodeURIComponent(filename)}:/content`;

      const res = await fetch(url, {
        method: "PUT",
        headers: {
          ...dmsAuthHeaders(),
          "Content-Type": "application/octet-stream",
        },
        body: Buffer.from(contentBase64, "base64"),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return {
          success: false,
          error: `SharePoint upload failed: ${res.status} ${errText}`.slice(0, 500),
        };
      }

      const result = (await res.json()) as { id?: string };
      if (result.id) {
        return { success: true, documentId: result.id };
      }
      return { success: false, error: "SharePoint upload returned no document ID" };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
