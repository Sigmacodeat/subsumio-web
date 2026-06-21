/**
 * NetDocuments API Konnektor für Subsumio.
 * Referenz: https://developers.netdocuments.com/
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

export const netDocumentsConnector: DMSConnector = {
  name: "NetDocuments",

  isConfigured(): boolean {
    return isDmsConfigured();
  },

  async search(
    query: string,
    opts?: { limit?: number; folderId?: string }
  ): Promise<DMSSearchResult> {
    const url = new URL(`${DMS_BASE}/v1/Repository`);
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
    }>(url.toString(), { headers: dmsAuthHeaders() });

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
      d = await dmsFetchJson(`${DMS_BASE}/v1/Documents/${docId}`, { headers: dmsAuthHeaders() });
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
    }>(`${DMS_BASE}/v1/Cabinets/${folderId}/documents`, { headers: dmsAuthHeaders() });
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
    headers: Record<string, string>
  ): Promise<{ slug: string; success: boolean }> {
    return importToBrainCommon(
      doc,
      brainId,
      headers,
      "NetDocuments",
      `${DMS_BASE}/v1/Documents/${doc.id}/content`
    );
  },
};
