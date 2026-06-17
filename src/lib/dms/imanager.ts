/**
 * iManage Work API Konnektor für SigmaBrain.
 * Referenz: https://developer.imanage.com/api/
 */

import { type DMSConnector, type DMSDocument, type DMSFolder, type DMSSearchResult, type DMSCredentials } from "./index";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";

const BASE = process.env.DMS_BASE_URL || "";
const API_KEY = process.env.DMS_API_KEY || "";

function authHeaders(): Record<string, string> {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" } : {};
}

export const iManageConnector: DMSConnector = {
  name: "iManage Work",

  isConfigured(): boolean {
    return Boolean(BASE && API_KEY);
  },

  async search(query: string, opts?: { limit?: number; folderId?: string }): Promise<DMSSearchResult> {
    const url = new URL(`${BASE}/api/v2/search`);
    url.searchParams.set("q", query);
    if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
    if (opts?.folderId) url.searchParams.set("folder_id", opts.folderId);

    const res = await fetch(url.toString(), { headers: authHeaders() });
    const data = (await res.json()) as {
      documents?: Array<{
        id: string; name: string; document_type?: string; author?: string; last_modified?: string;
        size?: number; version?: string; checkout_status?: string;
      }>;
      folders?: Array<{ id: string; name: string; path?: string; document_count?: number }>;
      total_count?: number;
    };

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
    const res = await fetch(`${BASE}/api/v2/documents/${docId}`, { headers: authHeaders() });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      id: string; name: string; document_type?: string; author?: string;
      last_modified?: string; size?: number; version?: string; checkout_status?: string;
    };
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

  async importToBrain(doc: DMSDocument, brainId: string, headers: Record<string, string>): Promise<{ slug: string; success: boolean }> {
    // Fetch document content if not already loaded
    let content = doc.content;
    if (!content) {
      const contentRes = await fetch(`${BASE}/api/v2/documents/${doc.id}/content`, { headers: authHeaders() });
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
        content: `Imported from iManage Work. Author: ${doc.author}. Modified: ${doc.modifiedDate}.`,
        frontmatter: {
          dms_provider: "imanager",
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
