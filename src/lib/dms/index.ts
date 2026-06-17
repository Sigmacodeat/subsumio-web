/**
 * DMS (Document Management System) Abstrakter Konnektor für SigmaBrain.
 * Unterstützt iManage und NetDocuments über ein einheitliches Interface.
 *
 * Konfiguration via Umgebungsvariablen:
 *   DMS_PROVIDER              — "imanager" | "netdocuments"
 *   DMS_BASE_URL              — API Base URL
 *   DMS_API_KEY / DMS_CLIENT_ID / DMS_CLIENT_SECRET
 */

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

export interface DMSFolder {
  id: string;
  name: string;
  path: string;
  documentCount?: number;
}

export interface DMSSearchResult {
  documents: DMSDocument[];
  folders: DMSFolder[];
  totalCount: number;
}

export interface DMSCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  baseUrl?: string;
}

export interface DMSConnector {
  name: string;
  isConfigured(): boolean;
  search(query: string, opts?: { limit?: number; folderId?: string }): Promise<DMSSearchResult>;
  getDocument(docId: string): Promise<DMSDocument | null>;
  getFolderContents(folderId: string): Promise<DMSSearchResult>;
  importToBrain(doc: DMSDocument, brainId: string, headers: Record<string, string>): Promise<{ slug: string; success: boolean }>;
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
