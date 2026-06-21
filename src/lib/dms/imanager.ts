/**
 * iManage Work API Konnektor für Subsumio.
 * Referenz: https://developer.imanage.com/api/
 */

import {
  type DMSConnector,
  type DMSDocument,
  type DMSSearchResult,
  DMS_BASE,
  dmsAuthHeaders,
  dmsFetchJson,
  isDmsConfigured,
  importToBrainCommon,
} from "./index";

export const iManageConnector: DMSConnector = {
  name: "iManage Work",

  isConfigured(): boolean {
    return isDmsConfigured();
  },

  async search(
    query: string,
    opts?: { limit?: number; folderId?: string }
  ): Promise<DMSSearchResult> {
    const url = new URL(`${DMS_BASE}/api/v2/search`);
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
    }>(url.toString(), { headers: dmsAuthHeaders() });

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
      d = await dmsFetchJson(`${DMS_BASE}/api/v2/documents/${docId}`, {
        headers: dmsAuthHeaders(),
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

  async getFolderContents(folderId: string): Promise<DMSSearchResult> {
    return this.search("", { folderId, limit: 100 });
  },

  async importToBrain(
    doc: DMSDocument,
    brainId: string,
    headers: Record<string, string>
  ): Promise<{ slug: string; success: boolean }> {
    return importToBrainCommon(
      doc,
      brainId,
      headers,
      "iManage Work",
      `${DMS_BASE}/api/v2/documents/${doc.id}/content`
    );
  },
};
