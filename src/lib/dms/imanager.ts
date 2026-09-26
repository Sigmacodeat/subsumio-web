/**
 * iManage Work API Konnektor für Subsumio.
 * Referenz: https://developer.imanage.com/api/
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
export function createIManageConnector(settings: DMSSettings): DMSConnector {
  const base = settings.baseUrl.replace(/\/+$/, "");
  return {
    name: "iManage Work",

    isConfigured(): boolean {
      return isDmsConfigured(settings);
    },

    async search(
      query: string,
      opts?: { limit?: number; folderId?: string }
    ): Promise<DMSSearchResult> {
      const url = new URL(`${base}/api/v2/search`);
      url.searchParams.set("q", query);
      if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
      if (opts?.folderId) url.searchParams.set("folder_id", opts.folderId);

      const data = await dmsFetchJson<{
        documents?: Array<{
          id: string;
          name: string;
          document_type?: string;
          author?: string;
          last_modified?: string;
          size?: number;
          version?: string;
          checkout_status?: string;
        }>;
        folders?: Array<{ id: string; name: string; path?: string; document_count?: number }>;
        total_count?: number;
      }>(url.toString(), { headers: dmsAuthHeaders(settings) });

      return {
        documents: (data.documents ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          type: d.document_type ?? "document",
          author: d.author ?? "—",
          modifiedDate: d.last_modified ?? new Date().toISOString(),
          size: d.size,
          version: d.version,
          checkoutStatus: d.checkout_status,
        })),
        folders: (data.folders ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          path: f.path ?? f.name,
          documentCount: f.document_count,
        })),
        totalCount: data.total_count ?? 0,
      };
    },

    async getDocument(docId: string): Promise<DMSDocument | null> {
      let d: {
        id: string;
        name: string;
        document_type?: string;
        author?: string;
        last_modified?: string;
        size?: number;
        version?: string;
        checkout_status?: string;
      };
      try {
        d = await dmsFetchJson(`${base}/api/v2/documents/${docId}`, {
          headers: dmsAuthHeaders(settings),
        });
      } catch {
        return null;
      }
      return {
        id: d.id,
        name: d.name,
        type: d.document_type ?? "document",
        author: d.author ?? "—",
        modifiedDate: d.last_modified ?? new Date().toISOString(),
        size: d.size,
        version: d.version,
        checkoutStatus: d.checkout_status,
      };
    },

    async getDocumentContent(docId: string) {
      return fetchDmsContent(
        `${base}/api/v2/documents/${encodeURIComponent(docId)}/content`,
        settings
      );
    },

    async getFolderContents(folderId: string): Promise<DMSSearchResult> {
      return this.search("", { folderId, limit: 100 });
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
        "iManage Work",
        `${base}/api/v2/documents/${doc.id}/content`,
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
          ...(opts.folderId ? { parent_id: opts.folderId } : {}),
          ...(opts.metadata ? { custom_attributes: opts.metadata } : {}),
        };
        const result = await dmsFetchJson<{ id?: string; error?: string }>(
          `${base}/api/v2/documents`,
          {
            method: "POST",
            headers: dmsAuthHeaders(settings),
            body: JSON.stringify(body),
          }
        );
        if (result.id) {
          return { success: true, documentId: result.id };
        }
        return { success: false, error: result.error ?? "Unknown iManage error" };
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
export const iManageConnector = createIManageConnector({
  provider: "imanager",
  baseUrl: DMS_BASE,
  apiKey: DMS_API_KEY,
});
