/**
 * NetDocuments API Konnektor für Subsumio.
 * Referenz: https://developers.netdocuments.com/
 */

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

/** Connector bound to one DMS instance (a firm's own settings or the installation env). */
export function createNetDocumentsConnector(settings: DMSSettings): DMSConnector {
  const base = settings.baseUrl.replace(/\/+$/, "");
  return {
    name: "NetDocuments",

    isConfigured(): boolean {
      return isDmsConfigured(settings);
    },

    async search(
      query: string,
      opts?: { limit?: number; folderId?: string }
    ): Promise<DMSSearchResult> {
      const url = new URL(`${base}/v1/Repository`);
      url.searchParams.set("search", query);
      if (opts?.limit) url.searchParams.set("count", String(opts.limit));

      const data = await dmsFetchJson<{
        results?: Array<{
          id: string;
          name: string;
          extension?: string;
          author?: { name?: string };
          lastModified?: string;
          size?: number;
          version?: string;
          checkedOut?: boolean;
        }>;
        totalCount?: number;
      }>(url.toString(), { headers: dmsAuthHeaders(settings) });

      return {
        documents: (data.results ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          type: d.extension ?? "document",
          author: d.author?.name ?? "—",
          modifiedDate: d.lastModified ?? new Date().toISOString(),
          size: d.size,
          version: d.version,
          checkoutStatus: d.checkedOut ? "checked_out" : "available",
        })),
        folders: [],
        totalCount: data.totalCount ?? 0,
      };
    },

    async getDocument(docId: string): Promise<DMSDocument | null> {
      let d: {
        id: string;
        name: string;
        extension?: string;
        author?: { name?: string };
        lastModified?: string;
        size?: number;
        version?: string;
        checkedOut?: boolean;
      };
      try {
        d = await dmsFetchJson(`${base}/v1/Documents/${docId}`, {
          headers: dmsAuthHeaders(settings),
        });
      } catch {
        return null;
      }
      return {
        id: d.id,
        name: d.name,
        type: d.extension ?? "document",
        author: d.author?.name ?? "—",
        modifiedDate: d.lastModified ?? new Date().toISOString(),
        size: d.size,
        version: d.version,
        checkoutStatus: d.checkedOut ? "checked_out" : "available",
      };
    },

    async getDocumentContent(docId: string) {
      return fetchDmsContent(`${base}/v1/Documents/${encodeURIComponent(docId)}/content`, settings);
    },

    async getFolderContents(folderId: string): Promise<DMSSearchResult> {
      const data = await dmsFetchJson<{
        results?: Array<{
          id: string;
          name: string;
          extension?: string;
          author?: { name?: string };
          lastModified?: string;
          size?: number;
          version?: string;
          checkedOut?: boolean;
        }>;
      }>(`${base}/v1/Cabinets/${folderId}/documents`, { headers: dmsAuthHeaders(settings) });
      return {
        documents: (data.results ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          type: d.extension ?? "document",
          author: d.author?.name ?? "—",
          modifiedDate: d.lastModified ?? new Date().toISOString(),
          size: d.size,
          version: d.version,
          checkoutStatus: d.checkedOut ? "checked_out" : "available",
        })),
        folders: [],
        totalCount: data.results?.length ?? 0,
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
        "NetDocuments",
        `${base}/v1/Documents/${doc.id}/content`,
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
        const body: Record<string, unknown> = {
          name: filename,
          content: contentBase64,
          ...(opts.folderId ? { cabinet: opts.folderId } : {}),
          ...(opts.metadata ? { attributes: opts.metadata } : {}),
        };
        const result = await dmsFetchJson<{ id?: string; error?: string }>(`${base}/v1/Documents`, {
          method: "POST",
          headers: dmsAuthHeaders(settings),
          body: JSON.stringify(body),
        });
        if (result.id) {
          return { success: true, documentId: result.id };
        }
        return { success: false, error: result.error ?? "Unknown NetDocuments error" };
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
export const netDocumentsConnector = createNetDocumentsConnector({
  provider: "netdocuments",
  baseUrl: DMS_BASE,
  apiKey: DMS_API_KEY,
});
