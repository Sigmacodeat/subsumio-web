/**
 * DMS (Document Management System) Abstrakter Konnektor für Subsumio.
 * Unterstützt iManage, NetDocuments, SharePoint und Box über ein
 * einheitliches Interface.
 *
 * Konfiguration pro Kanzlei (Brain): gespeichert über ./config-store.ts,
 * Zugangsdaten verschlüsselt. Jede Anfrage löst den Connector aus der
 * Konfiguration der Kanzlei des Aufrufers auf (`resolveDmsForBrain`).
 *
 * Übergang: die installationsweite Konfiguration via Umgebungsvariablen
 *   DMS_PROVIDER, DMS_BASE_URL, DMS_API_KEY
 * gilt nur noch für Kanzleien in DMS_ALLOWED_BRAIN_IDS.
 */

import { dmsSafeFetch } from "./egress";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";

import { logger } from "@/lib/logger";
const log = logger("lib/dms/index");

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

export interface DMSPushResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

export interface DMSContent {
  data: ArrayBuffer;
  mimeType: string;
}

export const DMS_PROVIDERS = ["imanager", "netdocuments", "sharepoint", "box"] as const;
export type DMSProvider = (typeof DMS_PROVIDERS)[number];

export function isDmsProvider(v: unknown): v is DMSProvider {
  return typeof v === "string" && (DMS_PROVIDERS as readonly string[]).includes(v);
}

/** Everything a connector needs to talk to one DMS instance. */
export interface DMSSettings {
  provider: DMSProvider;
  /** API base URL (iManage/NetDocuments) or site URL (SharePoint). Unused by Box. */
  baseUrl: string;
  /** Bearer token / API key. Server-side only — never sent to the browser. */
  apiKey: string;
  sharepointSiteId?: string | null;
  sharepointDriveId?: string | null;
  boxFolderId?: string | null;
}

/** Optional link of an imported DMS document to a matter. */
export interface DMSImportOptions {
  caseSlug?: string;
}

export interface DMSConnector {
  name: string;
  isConfigured(): boolean;
  search(query: string, opts?: { limit?: number; folderId?: string }): Promise<DMSSearchResult>;
  getDocument(docId: string): Promise<DMSDocument | null>;
  /** On-Demand-Download — für Dokumente, die zu groß für
   *  `document_base64`-Inline-Storage sind (`document_oversized`). */
  getDocumentContent(docId: string): Promise<DMSContent | null>;
  getFolderContents(folderId: string): Promise<DMSSearchResult>;
  importToBrain(
    doc: DMSDocument,
    brainId: string,
    headers: Record<string, string>,
    opts?: DMSImportOptions
  ): Promise<{
    slug: string;
    success: boolean;
    alreadyImported?: boolean;
    updated?: boolean;
    oversized?: boolean;
  }>;
  pushToDms(
    filename: string,
    contentBase64: string,
    opts: { folderId?: string; metadata?: Record<string, string> }
  ): Promise<DMSPushResult>;
}

// --- Shared config helpers --------------------------------------------------

export const DMS_BASE = process.env.DMS_BASE_URL || "";
export const DMS_API_KEY = process.env.DMS_API_KEY || "";

/** Page slug under which a DMS document is imported into a firm brain. */
export function dmsImportSlug(docId: string): string {
  return `dms/import/${docId}`;
}

/**
 * Authorization headers for a DMS call. Without `settings` the installation
 * (env) key is used — the transitional single-tenant path.
 */
export function dmsAuthHeaders(settings?: Pick<DMSSettings, "apiKey">): Record<string, string> {
  const key = settings ? settings.apiKey : DMS_API_KEY;
  return key ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } : {};
}

export function isDmsConfigured(settings?: DMSSettings): boolean {
  if (!settings) return Boolean(DMS_BASE && DMS_API_KEY);
  if (!settings.apiKey) return false;
  // Box talks to its fixed public API; the others need the firm's endpoint.
  return settings.provider === "box" || Boolean(settings.baseUrl);
}

const DMS_FETCH_TIMEOUT_MS = 10_000;

/**
 * Safe wrapper around fetch+json for DMS connector calls: bounds every
 * outbound request with a timeout (a hung DMS backend must not hang the
 * request indefinitely) and raises a clean error on non-2xx/non-JSON
 * responses instead of letting `.json()` throw an unhandled rejection.
 */
export async function dmsFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await dmsSafeFetch(url, { ...init, signal: AbortSignal.timeout(DMS_FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new Error(
      `DMS request to ${url} failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (!res.ok) {
    throw new Error(`DMS request to ${url} returned ${res.status}`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error(`DMS request to ${url} returned a non-JSON response`);
  }
}

/** Binärer Content-Download aus dem DMS. Großzügigerer Timeout als
 *  dmsFetchJson — das Haupt-Einsatzgebiet sind übergroße Dokumente. */
export async function fetchDmsContent(
  url: string,
  settings?: DMSSettings
): Promise<DMSContent | null> {
  let res: Response;
  try {
    res = await dmsSafeFetch(url, {
      headers: dmsAuthHeaders(settings),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return {
    data: await res.arrayBuffer(),
    mimeType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

// --- Shared importToBrain implementation ------------------------------------

/**
 * Common importToBrain logic for all DMS connectors.
 * Fetches document content if not already loaded, then POSTs to the engine.
 */
/** Konsistent mit mail-filing/whatsapp-media: max. 25 MB Rohdaten inline. */
const MAX_INLINE_BASE64_CHARS = Math.floor((25 * 1024 * 1024 * 4) / 3);

/**
 * Frontmatter-Felder für den Dokumentinhalt. Übergroße Dateien werden
 * NICHT inline in `document_base64` gelegt — sie würden jede Page-Read
 * aufblähen. Stattdessen `document_oversized` + Größe in Bytes.
 */
function inlineDocumentFields(content: string | null | undefined): Record<string, unknown> {
  if (!content) return { document_base64: null };
  if (content.length > MAX_INLINE_BASE64_CHARS) {
    const bytes = Math.floor((content.length * 3) / 4);
    log.warn(
      `[dms] document too large for inline storage (~${bytes} bytes); storing metadata only`
    );
    return { document_base64: null, document_oversized: true, document_size_bytes: bytes };
  }
  return { document_base64: content };
}

export async function importToBrainCommon(
  doc: DMSDocument,
  brainId: string,
  headers: Record<string, string>,
  providerName: string,
  contentUrl: string,
  settings?: DMSSettings,
  opts?: DMSImportOptions
): Promise<{
  slug: string;
  success: boolean;
  alreadyImported?: boolean;
  updated?: boolean;
  oversized?: boolean;
}> {
  let content = doc.content;
  if (!content) {
    try {
      const contentRes = await dmsSafeFetch(contentUrl, {
        headers: dmsAuthHeaders(settings),
        signal: AbortSignal.timeout(DMS_FETCH_TIMEOUT_MS),
      });
      if (contentRes.ok) {
        const blob = await contentRes.arrayBuffer();
        content = Buffer.from(blob).toString("base64");
      } else {
        log.warn(
          `[dms] content fetch from ${contentUrl} returned ${contentRes.status}; importing without content`
        );
      }
    } catch (err) {
      log.warn(
        `[dms] content fetch from ${contentUrl} failed: ${err instanceof Error ? err.message : String(err)}; importing without content`
      );
    }
  }

  const slug = dmsImportSlug(doc.id);
  const docFields = inlineDocumentFields(content);
  // Matter link: lets the matter's members open the document later.
  const caseSlug = opts?.caseSlug?.trim() || undefined;
  const caseFields: Record<string, unknown> = caseSlug ? { case_slug: caseSlug } : {};
  const oversized = docFields.document_oversized === true;

  // Idempotenz: gleiche DMS-Version nicht doppelt importieren, neuere
  // Version aktualisiert die vorhandene Page statt eines Duplikats.
  try {
    const existing = await fetch(
      `${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
      { headers, signal: AbortSignal.timeout(10_000) }
    );
    if (existing.ok) {
      const prev = (await existing.json()) as {
        frontmatter?: {
          dms_version?: string;
          dms_modified?: string;
          document_oversized?: boolean;
          case_slug?: string;
        };
      };
      // Skip nur bei identischer Version UND unverändertem modifiedDate —
      // DMS ohne Versionsnummern liefern Änderungen sonst nie nach.
      const sameVersion = (prev.frontmatter?.dms_version ?? "1") === (doc.version ?? "1");
      const sameModified =
        !doc.modifiedDate || (prev.frontmatter?.dms_modified ?? null) === doc.modifiedDate;
      const sameCase = !caseSlug || prev.frontmatter?.case_slug === caseSlug;
      if (sameVersion && sameModified && sameCase) {
        return {
          slug,
          success: true,
          alreadyImported: true,
          oversized: prev.frontmatter?.document_oversized === true,
        };
      }
      const patch = await enginePatchPage(headers, {
        slug,
        title: doc.name,
        content: `Imported from ${providerName}. Author: ${doc.author}. Modified: ${doc.modifiedDate}.`,
        frontmatter: {
          dms_provider: providerName.toLowerCase().replace(/\s+/g, ""),
          dms_document_id: doc.id,
          dms_version: doc.version ?? "1",
          dms_author: doc.author,
          dms_modified: doc.modifiedDate,
          ...docFields,
          ...caseFields,
          imported_at: new Date().toISOString(),
        },
      });
      return { slug, success: patch.ok, updated: true, oversized };
    }
  } catch {
    // Lookup fehlgeschlagen → normalen Import-Pfad weitergehen lassen;
    // der Engine-POST meldet Konflikte selbst.
  }

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
        ...docFields,
        ...caseFields,
        imported_at: new Date().toISOString(),
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  return { slug, success: pageRes.ok, oversized };
}

/** Build a connector bound to one firm's (or the installation's) settings. */
export async function createConnector(settings: DMSSettings): Promise<DMSConnector> {
  switch (settings.provider) {
    case "imanager":
      // Lazy-load to avoid circular deps
      return (await import("./imanager")).createIManageConnector(settings);
    case "netdocuments":
      return (await import("./netdocuments")).createNetDocumentsConnector(settings);
    case "sharepoint":
      return (await import("./sharepoint")).createSharePointConnector(settings);
    case "box":
      return (await import("./box")).createBoxConnector(settings);
  }
}

/** The installation-wide (env) connector — transitional single-tenant path. */
export async function getConnector(): Promise<DMSConnector | null> {
  const provider = process.env.DMS_PROVIDER;
  switch (provider) {
    case "imanager":
      // Lazy-load to avoid circular deps
      return (await import("./imanager")).iManageConnector;
    case "netdocuments":
      return (await import("./netdocuments")).netDocumentsConnector;
    case "sharepoint":
      return (await import("./sharepoint")).sharePointConnector;
    case "box":
      return (await import("./box")).boxConnector;
    default:
      return null;
  }
}

export function isAnyDMSConfigured(): boolean {
  return Boolean(process.env.DMS_PROVIDER && process.env.DMS_BASE_URL);
}

/**
 * The installation (env) DMS connector is configured once per installation,
 * not per firm. It stays available only as a transition for the firms whose
 * brain ids are listed explicitly in `DMS_ALLOWED_BRAIN_IDS`
 * (comma-separated). Unset or empty → no firm gets it (fail-closed).
 */
export function dmsAllowedBrainIds(): string[] {
  return (process.env.DMS_ALLOWED_BRAIN_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isDmsEnabledForBrain(brainId: string | undefined | null): boolean {
  return !!brainId && dmsAllowedBrainIds().includes(brainId);
}

export interface ResolvedDms {
  connector: DMSConnector;
  provider: string;
  /** "firm": the firm's own stored config; "installation": transitional env config. */
  source: "firm" | "installation";
}

/**
 * The DMS of the caller's firm: its own stored configuration first; the
 * installation env config only for firms listed in DMS_ALLOWED_BRAIN_IDS.
 * Anything else → null (the routes answer 503 "DMS nicht eingerichtet").
 */
export async function resolveDmsForBrain(
  brainId: string | undefined | null
): Promise<ResolvedDms | null> {
  if (!brainId) return null;
  let firm: DMSSettings | null = null;
  try {
    const { getDmsSettingsForBrain } = await import("./config-store");
    firm = await getDmsSettingsForBrain(brainId);
  } catch (err) {
    // Store unreachable: do not guess — a firm with its own DMS must never
    // silently land on the installation DMS. Fail closed.
    log.warn(
      `[dms] firm config lookup failed: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
  if (firm) {
    return { connector: await createConnector(firm), provider: firm.provider, source: "firm" };
  }
  if (isDmsEnabledForBrain(brainId)) {
    const connector = await getConnector();
    if (connector) {
      return {
        connector,
        provider: process.env.DMS_PROVIDER ?? "unknown",
        source: "installation",
      };
    }
  }
  return null;
}

/** The DMS connector of this firm, or null when none is set up for it. */
export async function getConnectorForBrain(
  brainId: string | undefined | null
): Promise<DMSConnector | null> {
  return (await resolveDmsForBrain(brainId))?.connector ?? null;
}
