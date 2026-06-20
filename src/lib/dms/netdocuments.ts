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

    const res = await fetch(url.toString(), { headers: dmsAuthHeaders() });
    const data = (await res.json()) as {
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
    };

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
    const res = await fetch(`${DMS_BASE}/v1/Documents/${docId}`, { headers: dmsAuthHeaders() });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      id: string;
      name: string;
      extension?: string;
      author?: { name?: string };
      lastModified?: string;
      size?: number;
      version?: string;
      checkedOut?: boolean;
    };
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
    const res = await fetch(`${DMS_BASE}/v1/Cabinets/${folderId}/documents`, {
      headers: dmsAuthHeaders(),
    });
    const data = (await res.json()) as {
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
    };
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
