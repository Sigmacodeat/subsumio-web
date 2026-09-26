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

import { dmsSafeFetch } from "./egress";
import {
  type DMSConnector,
  type DMSDocument,
  type DMSSearchResult,
  type DMSPushResult,
  type DMSSettings,
  type DMSImportOptions,
  DMS_BASE,
  DMS_API_KEY,
  dmsAuthHeaders,
  dmsFetchJson,
  fetchDmsContent,
  isDmsConfigured,
  importToBrainCommon,
} from "./index";

function graphBase(): string {
  return "https://graph.microsoft.com/v1.0";
}

async function resolveSiteId(settings: DMSSettings): Promise<string> {
  if (settings.sharepointSiteId) return settings.sharepointSiteId;
  const siteUrl = new URL(settings.baseUrl);
  const hostname = siteUrl.hostname;
  const sitePath = siteUrl.pathname.replace(/^\/sites\//, "").replace(/^\//, "");
  const data = await dmsFetchJson<{ id: string }>(`${graphBase()}/sites/${hostname}:/${sitePath}`, {
    headers: dmsAuthHeaders(settings),
  });
  return data.id;
}

async function resolveDriveId(settings: DMSSettings, siteId: string): Promise<string> {
  if (settings.sharepointDriveId) return settings.sharepointDriveId;
  const data = await dmsFetchJson<{ value: Array<{ id: string; name: string }> }>(
    `${graphBase()}/sites/${siteId}/drives`,
    { headers: dmsAuthHeaders(settings) }
  );
  const drive = data.value?.find((d) => d.name === "Documents") ?? data.value?.[0];
  if (!drive) throw new Error("No document library found in SharePoint site");
  return drive.id;
}

/** Connector bound to one SharePoint site (a firm's own settings or the installation env). */
export function createSharePointConnector(settings: DMSSettings): DMSConnector {
  return {
    name: "SharePoint",

    isConfigured(): boolean {
      return isDmsConfigured(settings);
    },

    async search(
      query: string,
      opts?: { limit?: number; folderId?: string }
    ): Promise<DMSSearchResult> {
      const siteId = await resolveSiteId(settings);
      const driveId = await resolveDriveId(settings, siteId);
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
      }>(url, { headers: dmsAuthHeaders(settings) });

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
      const siteId = await resolveSiteId(settings);
      const driveId = await resolveDriveId(settings, siteId);
      try {
        const item = await dmsFetchJson<{
          id: string;
          name: string;
          file?: { mimeType?: string };
          createdBy?: { user?: { displayName?: string } };
          lastModifiedDateTime?: string;
          size?: number;
        }>(`${graphBase()}/drives/${driveId}/items/${docId}`, {
          headers: dmsAuthHeaders(settings),
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

    async getDocumentContent(docId: string) {
      const siteId = await resolveSiteId(settings);
      const driveId = await resolveDriveId(settings, siteId);
      return fetchDmsContent(
        `${graphBase()}/drives/${driveId}/items/${encodeURIComponent(docId)}/content`,
        settings
      );
    },

    async getFolderContents(folderId: string): Promise<DMSSearchResult> {
      const siteId = await resolveSiteId(settings);
      const driveId = await resolveDriveId(settings, siteId);
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
        headers: dmsAuthHeaders(settings),
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
      headers: Record<string, string>,
      opts?: DMSImportOptions
    ): Promise<{ slug: string; success: boolean }> {
      const siteId = await resolveSiteId(settings);
      const driveId = await resolveDriveId(settings, siteId);
      return importToBrainCommon(
        doc,
        brainId,
        headers,
        "SharePoint",
        `${graphBase()}/drives/${driveId}/items/${doc.id}/content`,
        settings,
        opts
      );
    },

    async pushToDms(
      filename: string,
      contentBase64: string,
      opts: { folderId?: string; metadata?: Record<string, string> }
    ): Promise<DMSPushResult> {
      try {
        const siteId = await resolveSiteId(settings);
        const driveId = await resolveDriveId(settings, siteId);
        const parentId = opts.folderId ?? "root";
        const url = `${graphBase()}/drives/${driveId}/items/${parentId}:/${encodeURIComponent(filename)}:/content`;

        const res = await dmsSafeFetch(url, {
          method: "PUT",
          headers: {
            ...dmsAuthHeaders(settings),
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
}

/** Installation (env) connector — transitional single-tenant path. */
export const sharePointConnector = createSharePointConnector({
  provider: "sharepoint",
  baseUrl: DMS_BASE,
  apiKey: DMS_API_KEY,
  sharepointSiteId: process.env.SHAREPOINT_SITE_ID || null,
  sharepointDriveId: process.env.SHAREPOINT_DRIVE_ID || null,
});
