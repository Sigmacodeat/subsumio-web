/**
 * DMS (Document Management System) Abstrakter Konnektor für SigmaBrain.
 * Unterstützt iManage und NetDocuments über ein einheitliches Interface.
 *
 * Konfiguration via Umgebungsvariablen:
 *   DMS_PROVIDER              — "imanager" | "netdocuments"
 *   DMS_BASE_URL              — API Base URL
 *   DMS_API_KEY / DMS_CLIENT_ID / DMS_CLIENT_SECRET
 */

import { ENGINE_URL } from "@/lib/engine";

export interface DMSDocument {
  id: string;
  name: string;
  type: string;
  author: string;
  modifiedDate: string;
  size?: number;
  version?: string;
  checkoutStatus?: string;
  content?: string; // base64-encoded content for import
}

export interface DMSSearchResult {
  documents: DMSDocument[];
  folders: Array<{ id: string; name: string; path: string; documentCount?: number }>;
  totalCount: number;
}

export interface DMSConnector {
  name: string;
  isConfigured(): boolean;
  search(query: string, opts?: { limit?: number; folderId?: string }): Promise<DMSSearchResult>;
  getDocument(docId: string): Promise<DMSDocument | null>;
  getFolderContents(folderId: string): Promise<DMSSearchResult>;
  importToBrain(doc: DMSDocument, brainId: string, headers: Record<string, string>): Promise<{ slug: string; success: boolean }>;
}

// --- Shared config helpers --------------------------------------------------

export const DMS_BASE = process.env.DMS_BASE_URL || "";
export const DMS_API_KEY = process.env.DMS_API_KEY || "";

export function dmsAuthHeaders(): Record<string, string> {
  return DMS_API_KEY ? { Authorization: `Bearer ${DMS_API_KEY}`, "Content-Type": "application/json" } : {};
}

export function isDmsConfigured(): boolean {
  return Boolean(DMS_BASE && DMS_API_KEY);
}

// --- Shared importToBrain implementation ------------------------------------

/**
 * Common importToBrain logic for all DMS connectors.
 * Fetches document content if not already loaded, then POSTs to the engine.
 */
export async function importToBrainCommon(
  doc: DMSDocument,
  brainId: string,
  headers: Record<string, string>,
  providerName: string,
  contentUrl: string,
): Promise<{ slug: string; success: boolean }> {
  let content = doc.content;
  if (!content) {
    const contentRes = await fetch(contentUrl, { headers: dmsAuthHeaders() });
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
      content: `Imported from ${providerName}. Author: ${doc.author}. Modified: ${doc.modifiedDate}.`,
      frontmatter: {
        dms_provider: providerName.toLowerCase().replace(/\s+/g, ""),
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
}

export async function getConnector(): Promise<DMSConnector | null> {
  const provider = process.env.DMS_PROVIDER;
  switch (provider) {
    case "imanager":
      // Lazy-load to avoid circular deps
      return (await import("./imanager")).iManageConnector;
    case "netdocuments":
      return (await import("./netdocuments")).netDocumentsConnector;
    default:
      return null;
  }
}

export function isAnyDMSConfigured(): boolean {
  return Boolean(process.env.DMS_PROVIDER && process.env.DMS_BASE_URL);
}
