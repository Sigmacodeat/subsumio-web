/**
 * NetDocuments API Konnektor für SigmaBrain.
 * Referenz: https://developers.netdocuments.com/
 */

import { type DMSConnector, type DMSDocument, type DMSFolder, type DMSSearchResult } from "./index";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

const BASE = process.env.DMS_BASE_URL || "";
const API_KEY = process.env.DMS_API_KEY || "";

function authHeaders(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" } : {};
}

export const netDocumentsConnector: DMSConnector = {
  name: "NetDocuments",

  isConfigured(): boolean {
    return Boolean(BASE && API_KEY);
  },

  async search(query: string, opts?: { limit?: number; folderId?: string }): Promise<DMSSearchResult> {
    const url = new URL(`${BASE}/v1/Repository`);
    url.searchParams.set("search", query);
    if (opts?.limit) url.searchParams.set("count", String(opts.limit));

    const res = await fetch(url.toString(), { headers: authHeaders() });
    const data = (await res.json()) as {
      results?: Array<{
        id: string; name: string; extension?: string; author?: { name?: string };
        lastModified?: string; size?: number; version?: string; checkedOut?: boolean;
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
    const res = await fetch(`${BASE}/v1/Documents/${docId}`, { headers: authHeaders() });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      id: string; name: string; extension?: string; author?: { name?: string };
      lastModified?: string; size?: number; version?: string; checkedOut?: boolean;
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
    const res = await fetch(`${BASE}/v1/Cabinets/${folderId}/documents`, { headers: authHeaders() });
    const data = (await res.json()) as {
      results?: Array<{
        id: string; name: string; extension?: string; author?: { name?: string };
        lastModified?: string; size?: number; version?: string; checkedOut?: boolean;
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

  async importToBrain(doc: DMSDocument, brainId: string, headers: Record<string, string>): Promise<{ slug: string; success: boolean }> {
    let content = doc.content;
    if (!content) {
      const contentRes = await fetch(`${BASE}/v1/Documents/${doc.id}/content`, { headers: authHeaders() });
      if (contentRes.ok) {
        const blob = await contentRes.arrayBuffer();
        content = Buffer.from(blob).toString("base64");
      }
    }

    const slug = `dms/import/${doc.id}`;
    const pageRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        title: doc.name,
        type: "dms_document",
        content: `Imported from NetDocuments. Author: ${doc.author}. Modified: ${doc.modifiedDate}.`,
        frontmatter: {
          dms_provider: "netdocuments",
          dms_document_id: doc.id,
          dms_version: doc.version ?? "1",
          dms_author: doc.author,
          dms_modified: doc.modifiedDate,
          document_base64: content ?? null,
          imported_at: new Date().toISOString(),
        },
      }),
    });

    return { slug, success: pageRes.ok };
  },
};
