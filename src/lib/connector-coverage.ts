/**
 * Connector Coverage Matrix — P1-BRAIN-010
 * ==========================================
 * Definiert eine systematische Coverage-Matrix für alle Datenquellen-Connectoren:
 * DMS, Microsoft 365, Google Workspace, beA, DATEV, lokale Ordner und Uploads.
 *
 * Jeder Connector wird nach folgenden Dimensionen klassifiziert:
 *   - Status: available | beta | planned | not_applicable
 *   - Content-Types: Welche Dateiformate werden unterstützt
 *   - Sync-Mode: delta | full | manual
 *   - Auth: oauth2 | api_key | file_watch | manual_upload | none
 *   - Rate-Limit: API-spezifisch
 *   - Tenant-Isolation: brain_id + org_id scoping
 *   - GoBD-Relevanz: Ob Aktenrelevanz gegeben ist
 *   - DSGVO-Relevanz: Ob personenbezogene Daten verarbeitet werden
 *   - Matter-Scope: Ob auf Akten-Level gefiltert werden kann
 *
 * Die Matrix dient als Single-Source-of-Truth für:
 *   1. UI: "Welche Datenquellen sind verfügbar?"
 *   2. Eval: Coverage-Gaps identifizieren
 *   3. CI: Regression-Tests gegen definierte Erwartungen
 *   4. Onboarding: Welche Connectoren müssen konfiguriert werden?
 */

// ── Types ─────────────────────────────────────────────────────────────

export type ConnectorStatus = "available" | "beta" | "planned" | "not_applicable";

export type ConnectorCategory =
  | "dms"
  | "microsoft_365"
  | "google_workspace"
  | "bea"
  | "datev"
  | "local_folder"
  | "upload"
  | "legal_database";

export type SyncMode = "delta" | "full" | "manual";

export type AuthMethod = "oauth2" | "api_key" | "file_watch" | "manual_upload" | "none";

export type ContentType =
  | "text/markdown"
  | "text/html"
  | "text/plain"
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "application/vnd.google-apps.document"
  | "application/vnd.google-apps.spreadsheet"
  | "image/*"
  | "audio/*"
  | "video/*"
  | "application/json"
  | "text/xml"
  | "unknown";

export interface ConnectorCoverageEntry {
  /** Unique connector identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category for grouping */
  category: ConnectorCategory;
  /** Implementation status */
  status: ConnectorStatus;
  /** Engine connector service name (matches CONNECTOR_REGISTRY key, or null for web-only) */
  engine_service: string | null;
  /** Web-side DMS connector key (matches DMS_PROVIDER env, or null) */
  dms_provider: string | null;
  /** Supported content types */
  content_types: ContentType[];
  /** Sync mode */
  sync_mode: SyncMode;
  /** Authentication method */
  auth_method: AuthMethod;
  /** API rate limit (requests per window) */
  rate_limit?: { capacity: number; window_ms: number };
  /** Whether tenant isolation is enforced (brain_id + org_id) */
  tenant_isolated: boolean;
  /** Whether matter-level scoping is supported */
  matter_scope: boolean;
  /** GoBD-relevant (Aktenrelevanz) */
  gobd_relevant: boolean;
  /** DSGVO-relevant (personenbezogene Daten) */
  gdpr_relevant: boolean;
  /** Whether push notifications/webhooks are supported */
  push_notifications: boolean;
  /** Whether full-text search is available on the source */
  full_text_search: boolean;
  /** Whether version history is preserved */
  version_history: boolean;
  /** Setup difficulty: easy | medium | hard */
  setup_difficulty: "easy" | "medium" | "hard";
  /** Required environment variables or config keys */
  required_config: string[];
  /** Optional config keys */
  optional_config: string[];
  /** Description */
  description: string;
  /** Known limitations */
  limitations?: string[];
}

export interface CoverageMatrix {
  connectors: ConnectorCoverageEntry[];
  by_category: Record<ConnectorCategory, ConnectorCoverageEntry[]>;
  by_status: Record<ConnectorStatus, ConnectorCoverageEntry[]>;
  total: number;
  available_count: number;
  beta_count: number;
  planned_count: number;
  coverage_gaps: CoverageGap[];
}

export interface CoverageGap {
  category: ConnectorCategory;
  description: string;
  missing_connectors: string[];
  severity: "low" | "medium" | "high";
}

// ── Matrix Definition ─────────────────────────────────────────────────

export const CONNECTOR_COVERAGE_MATRIX: ConnectorCoverageEntry[] = [
  // ── DMS ──────────────────────────────────────────────────────────────
  {
    id: "dms-imanager",
    name: "iManage DMS",
    category: "dms",
    status: "available",
    engine_service: null,
    dms_provider: "imanager",
    content_types: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/markdown",
      "unknown",
    ],
    sync_mode: "manual",
    auth_method: "api_key",
    rate_limit: { capacity: 100, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: true,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: false,
    full_text_search: true,
    version_history: true,
    setup_difficulty: "medium",
    required_config: ["DMS_BASE_URL", "DMS_API_KEY"],
    optional_config: ["DMS_CLIENT_ID", "DMS_CLIENT_SECRET"],
    description:
      "iManage Document Management System — Such- und Import-Schnittstelle für Kanzleien mit iManage.",
    limitations: [
      "Kein Push/Webhook — manuelle Synchronisation",
      "Volltext-Suche benötigt iManage Search API",
    ],
  },
  {
    id: "dms-netdocuments",
    name: "NetDocuments DMS",
    category: "dms",
    status: "available",
    engine_service: null,
    dms_provider: "netdocuments",
    content_types: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/markdown",
      "unknown",
    ],
    sync_mode: "manual",
    auth_method: "api_key",
    rate_limit: { capacity: 100, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: true,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: false,
    full_text_search: true,
    version_history: true,
    setup_difficulty: "medium",
    required_config: ["DMS_BASE_URL", "DMS_API_KEY"],
    optional_config: [],
    description:
      "NetDocuments DMS — Such- und Import-Schnittstelle für Kanzleien mit NetDocuments.",
    limitations: ["Kein Push/Webhook — manuelle Synchronisation"],
  },

  // ── Microsoft 365 ────────────────────────────────────────────────────
  {
    id: "ms365-sharepoint",
    name: "Microsoft SharePoint",
    category: "microsoft_365",
    status: "beta",
    engine_service: "ms365-sharepoint",
    dms_provider: null,
    content_types: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/html",
      "unknown",
    ],
    sync_mode: "delta",
    auth_method: "oauth2",
    rate_limit: { capacity: 1000, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: true,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: true,
    version_history: true,
    setup_difficulty: "hard",
    required_config: ["MS365_CLIENT_ID", "MS365_CLIENT_SECRET", "MS365_TENANT_ID"],
    optional_config: ["MS365_SHAREPOINT_SITE"],
    description:
      "Microsoft SharePoint Online — Delta-Sync von Dokumentbibliotheken mit Microsoft Graph API.",
    limitations: [
      "Microsoft Graph Delta-Sync im Engine-Connector vorhanden",
      "Live-Tenant-Consent, Webhook-Erneuerung und Provider-E2E noch offen",
    ],
  },
  {
    id: "ms365-onedrive",
    name: "Microsoft OneDrive",
    category: "microsoft_365",
    status: "beta",
    engine_service: "ms365-onedrive",
    dms_provider: null,
    content_types: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/*",
      "unknown",
    ],
    sync_mode: "delta",
    auth_method: "oauth2",
    rate_limit: { capacity: 1000, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: false,
    version_history: true,
    setup_difficulty: "medium",
    required_config: ["MS365_CLIENT_ID", "MS365_CLIENT_SECRET", "MS365_TENANT_ID"],
    optional_config: ["MS365_ONEDRIVE_FOLDER"],
    description:
      "Microsoft OneDrive — Persönliche Dokumente und geteilte Ordner via Microsoft Graph API.",
    limitations: [
      "Microsoft Graph Delta-Sync im Engine-Connector vorhanden",
      "Kein Matter-Scope ohne manuelle Zuordnung",
      "Live-Tenant-Consent und Provider-E2E noch offen",
    ],
  },
  {
    id: "ms365-outlook",
    name: "Microsoft Outlook (Exchange)",
    category: "microsoft_365",
    status: "beta",
    engine_service: "ms365-outlook",
    dms_provider: null,
    content_types: ["text/html", "text/plain", "application/pdf", "unknown"],
    sync_mode: "delta",
    auth_method: "oauth2",
    rate_limit: { capacity: 1000, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: true,
    version_history: false,
    setup_difficulty: "hard",
    required_config: ["MS365_CLIENT_ID", "MS365_CLIENT_SECRET", "MS365_TENANT_ID"],
    optional_config: ["MS365_OUTLOOK_FOLDER"],
    description:
      "Microsoft Outlook/Exchange — E-Mail-Import mit Delta-Sync via Microsoft Graph API.",
    limitations: [
      "Microsoft Graph Messages-Delta im Engine-Connector vorhanden",
      "Kein Matter-Scope ohne manuelle Zuordnung",
      "Live-Tenant-Consent und Provider-E2E noch offen",
    ],
  },

  // ── Google Workspace ─────────────────────────────────────────────────
  {
    id: "google-drive",
    name: "Google Drive",
    category: "google_workspace",
    status: "available",
    engine_service: "google-drive",
    dms_provider: null,
    content_types: [
      "application/pdf",
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.spreadsheet",
      "text/markdown",
      "text/html",
      "image/*",
      "unknown",
    ],
    sync_mode: "delta",
    auth_method: "oauth2",
    rate_limit: { capacity: 1000, window_ms: 100_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: false,
    version_history: true,
    setup_difficulty: "medium",
    required_config: ["client_id", "client_secret"],
    optional_config: ["filters.folder", "webhook_url", "poll_interval_ms"],
    description: "Google Drive — Delta-Sync via Drive API mit OAuth2 und optionalen Push-Webhooks.",
    limitations: [
      "Kein Matter-Scope ohne manuelle Zuordnung",
      "Google Workspace native Formate werden als Text exportiert",
    ],
  },
  {
    id: "google-gmail",
    name: "Google Gmail",
    category: "google_workspace",
    status: "available",
    engine_service: "gmail",
    dms_provider: null,
    content_types: ["text/html", "text/plain", "application/pdf", "unknown"],
    sync_mode: "delta",
    auth_method: "oauth2",
    rate_limit: { capacity: 250, window_ms: 100_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: false,
    full_text_search: true,
    version_history: false,
    setup_difficulty: "medium",
    required_config: ["client_id", "client_secret"],
    optional_config: ["filters.labels", "poll_interval_ms"],
    description: "Google Gmail — E-Mail-Import mit Label-Filter und Delta-Sync via Gmail API.",
    limitations: [
      "Kein Push-Webhook (Gmail API unterstützt nur Polling)",
      "Kein Matter-Scope ohne manuelle Zuordnung",
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "google_workspace",
    status: "available",
    engine_service: "calendar",
    dms_provider: null,
    content_types: ["application/json"],
    sync_mode: "delta",
    auth_method: "oauth2",
    rate_limit: { capacity: 1000, window_ms: 100_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: false,
    version_history: false,
    setup_difficulty: "easy",
    required_config: ["client_id", "client_secret"],
    optional_config: ["filters.calendar_id", "poll_interval_ms"],
    description: "Google Calendar — Termin-Import mit Delta-Sync via Calendar API.",
    limitations: ["Kein Matter-Scope — Termine müssen manuell Akten zugeordnet werden"],
  },

  // ── beA ──────────────────────────────────────────────────────────────
  {
    id: "bea-import",
    name: "beA (elektronischer Rechtsverkehr)",
    category: "bea",
    status: "available",
    engine_service: "bea-import",
    dms_provider: null,
    content_types: ["text/xml", "text/plain", "application/pdf", "unknown"],
    sync_mode: "manual",
    auth_method: "file_watch",
    rate_limit: { capacity: 1000, window_ms: 1000 },
    tenant_isolated: true,
    matter_scope: true,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: false,
    full_text_search: false,
    version_history: false,
    setup_difficulty: "easy",
    required_config: ["filters.watch_dir"],
    optional_config: [],
    description:
      "beA-Import — Überwacht ein Verzeichnis auf beA-Export-XML-Dateien und importiert Nachrichten mit Metadaten.",
    limitations: [
      "Keine direkte beA-API — XML-Exporte müssen manuell heruntergeladen werden",
      "Kein Push-Webhook",
    ],
  },

  // ── DATEV ────────────────────────────────────────────────────────────
  {
    id: "datev-import",
    name: "DATEV (Buchhaltung/Steuer)",
    category: "datev",
    status: "available",
    engine_service: null,
    dms_provider: null,
    content_types: [
      "text/plain",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/xml",
      "application/pdf",
      "unknown",
    ],
    sync_mode: "manual",
    auth_method: "manual_upload",
    rate_limit: { capacity: 100, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: true,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: false,
    full_text_search: false,
    version_history: true,
    setup_difficulty: "medium",
    required_config: [],
    optional_config: ["DATEV_WATCH_DIR", "DATEV_CLIENT_ID"],
    description:
      "DATEV-Import — Importiert DATEV-Buchungsstapel-CSV als Importlauf und einzelne Buchungen ins Kanzlei-OS.",
    limitations: [
      "Keine direkte DATEV-API — Datei-basierter Import",
      "Beleg-PDFs und DATEV-Export werden noch nicht zurueckgeschrieben",
    ],
  },

  // ── Local Folders ────────────────────────────────────────────────────
  {
    id: "local-folder",
    name: "Lokaler Ordner (File Watcher)",
    category: "local_folder",
    status: "available",
    engine_service: null,
    dms_provider: null,
    content_types: [
      "text/markdown",
      "text/html",
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/*",
      "unknown",
    ],
    sync_mode: "delta",
    auth_method: "file_watch",
    rate_limit: { capacity: 10000, window_ms: 1000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: false,
    version_history: false,
    setup_difficulty: "easy",
    required_config: ["LOCAL_FOLDER_PATH"],
    optional_config: ["LOCAL_FOLDER_GLOB", "LOCAL_FOLDER_RECURSIVE"],
    description:
      "Lokaler Ordner — Überwacht ein Verzeichnis auf Dateiänderungen (Watch-API) und importiert automatisch.",
    limitations: [
      "Kein Matter-Scope ohne manuelle Zuordnung",
      "Keine Volltext-Suche auf Quell-Ebene",
    ],
  },

  // ── Uploads ──────────────────────────────────────────────────────────
  {
    id: "manual-upload",
    name: "Manueller Upload",
    category: "upload",
    status: "available",
    engine_service: null,
    dms_provider: null,
    content_types: [
      "text/markdown",
      "text/html",
      "text/plain",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/*",
      "audio/*",
      "video/*",
      "application/json",
      "text/xml",
      "unknown",
    ],
    sync_mode: "manual",
    auth_method: "manual_upload",
    rate_limit: { capacity: 100, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: true,
    gobd_relevant: true,
    gdpr_relevant: true,
    push_notifications: false,
    full_text_search: false,
    version_history: false,
    setup_difficulty: "easy",
    required_config: [],
    optional_config: [],
    description:
      "Manueller Datei-Upload — Benutzer lädt Dateien direkt über das Dashboard hoch. Unterstützt alle gängigen Formate.",
    limitations: ["Keine automatische Synchronisation — manuell ausgelöst"],
  },

  // ── Legal Databases ──────────────────────────────────────────────────
  {
    id: "legal-judgements-de",
    name: "Deutsche Rechtsprechung (Urteile)",
    category: "legal_database",
    status: "available",
    engine_service: "legal-judgements",
    dms_provider: null,
    content_types: ["text/markdown", "text/html"],
    sync_mode: "full",
    auth_method: "none",
    rate_limit: { capacity: 10, window_ms: 60_000 },
    tenant_isolated: false,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: false,
    push_notifications: false,
    full_text_search: true,
    version_history: false,
    setup_difficulty: "easy",
    required_config: [],
    optional_config: [],
    description:
      "Deutsche Gerichtsentscheidungen — Import von öffentlich verfügbaren Urteilen über juris/DIPPER etc.",
    limitations: ["Keine Tenant-Isolation (öffentliche Daten)", "Quellenabhängige Verfügbarkeit"],
  },
  {
    id: "legal-judgements-ch",
    name: "Schweizer Rechtsprechung (Urteile)",
    category: "legal_database",
    status: "available",
    engine_service: "swiss-judgements",
    dms_provider: null,
    content_types: ["text/markdown", "text/html"],
    sync_mode: "full",
    auth_method: "none",
    rate_limit: { capacity: 10, window_ms: 60_000 },
    tenant_isolated: false,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: false,
    push_notifications: false,
    full_text_search: true,
    version_history: false,
    setup_difficulty: "easy",
    required_config: [],
    optional_config: [],
    description:
      "Schweizer Gerichtsentscheidungen — Import von Bundesgerichts- und kantonalen Urteilen.",
    limitations: ["Keine Tenant-Isolation (öffentliche Daten)"],
  },

  // ── Additional Engine Connectors ─────────────────────────────────────
  {
    id: "notion",
    name: "Notion",
    category: "local_folder",
    status: "available",
    engine_service: "notion",
    dms_provider: null,
    content_types: ["text/markdown", "application/json"],
    sync_mode: "delta",
    auth_method: "api_key",
    rate_limit: { capacity: 3, window_ms: 1000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: true,
    push_notifications: false,
    full_text_search: true,
    version_history: false,
    setup_difficulty: "easy",
    required_config: ["api_key"],
    optional_config: ["filters.database_id"],
    description: "Notion — Import von Notion-Seiten und Datenbanken via Notion API.",
    limitations: ["Strenge Rate-Limit (3 req/s)", "Kein Matter-Scope"],
  },
  {
    id: "github",
    name: "GitHub",
    category: "local_folder",
    status: "available",
    engine_service: "github",
    dms_provider: null,
    content_types: ["text/markdown", "application/json", "text/plain"],
    sync_mode: "delta",
    auth_method: "api_key",
    rate_limit: { capacity: 5000, window_ms: 3_600_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: false,
    push_notifications: true,
    full_text_search: true,
    version_history: true,
    setup_difficulty: "easy",
    required_config: ["api_key"],
    optional_config: ["filters.repo", "filters.org"],
    description: "GitHub — Import von Repositories, Issues und Dokumentation via GitHub API.",
    limitations: ["Kein Matter-Scope", "Primär für Entwickler-Dokumentation"],
  },
  {
    id: "slack",
    name: "Slack",
    category: "local_folder",
    status: "available",
    engine_service: "slack",
    dms_provider: null,
    content_types: ["text/plain", "application/json"],
    sync_mode: "delta",
    auth_method: "api_key",
    rate_limit: { capacity: 80, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: true,
    version_history: false,
    setup_difficulty: "easy",
    required_config: ["api_key"],
    optional_config: ["filters.channels"],
    description: "Slack — Import von Kanal-Nachrichten via Slack Web API.",
    limitations: ["Kein Matter-Scope", "Rate-Limit beachten"],
  },
  {
    id: "dropbox",
    name: "Dropbox",
    category: "local_folder",
    status: "available",
    engine_service: "dropbox",
    dms_provider: null,
    content_types: ["application/pdf", "text/markdown", "image/*", "unknown"],
    sync_mode: "delta",
    auth_method: "oauth2",
    rate_limit: { capacity: 300, window_ms: 60_000 },
    tenant_isolated: true,
    matter_scope: false,
    gobd_relevant: false,
    gdpr_relevant: true,
    push_notifications: true,
    full_text_search: false,
    version_history: true,
    setup_difficulty: "medium",
    required_config: ["client_id", "client_secret"],
    optional_config: ["filters.folder"],
    description: "Dropbox — Delta-Sync von Dropbox-Ordnern via Dropbox API.",
    limitations: ["Kein Matter-Scope"],
  },
];

// ── Matrix Helpers ────────────────────────────────────────────────────

export function getCoverageMatrix(): CoverageMatrix {
  const byCategory = groupByCategory(CONNECTOR_COVERAGE_MATRIX);
  const byStatus = groupByStatus(CONNECTOR_COVERAGE_MATRIX);
  const gaps = identifyCoverageGaps(byCategory);

  return {
    connectors: CONNECTOR_COVERAGE_MATRIX,
    by_category: byCategory,
    by_status: byStatus,
    total: CONNECTOR_COVERAGE_MATRIX.length,
    available_count: byStatus.available?.length ?? 0,
    beta_count: byStatus.beta?.length ?? 0,
    planned_count: byStatus.planned?.length ?? 0,
    coverage_gaps: gaps,
  };
}

function groupByCategory(
  connectors: ConnectorCoverageEntry[]
): Record<ConnectorCategory, ConnectorCoverageEntry[]> {
  const groups: Record<string, ConnectorCoverageEntry[]> = {};
  for (const c of connectors) {
    if (!groups[c.category]) groups[c.category] = [];
    groups[c.category].push(c);
  }
  return groups as Record<ConnectorCategory, ConnectorCoverageEntry[]>;
}

function groupByStatus(
  connectors: ConnectorCoverageEntry[]
): Record<ConnectorStatus, ConnectorCoverageEntry[]> {
  const groups: Record<string, ConnectorCoverageEntry[]> = {};
  for (const c of connectors) {
    if (!groups[c.status]) groups[c.status] = [];
    groups[c.status].push(c);
  }
  return groups as Record<ConnectorStatus, ConnectorCoverageEntry[]>;
}

function identifyCoverageGaps(
  byCategory: Record<ConnectorCategory, ConnectorCoverageEntry[]>
): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  // Check: Microsoft 365 — no implemented connector or beta-only integration
  const ms365 = byCategory["microsoft_365"] ?? [];
  if (ms365.length > 0 && ms365.every((c) => c.status === "planned")) {
    gaps.push({
      category: "microsoft_365",
      description: "Alle Microsoft 365 Connectoren sind noch nicht implementiert (planned).",
      missing_connectors: ms365.map((c) => c.id),
      severity: "high",
    });
  }
  if (ms365.length > 0 && ms365.some((c) => c.status === "beta")) {
    gaps.push({
      category: "microsoft_365",
      description:
        "Microsoft 365 Connectoren sind als Graph-Delta-Sync beta implementiert; Live-Tenant-Consent, Webhooks und Provider-E2E fehlen noch.",
      missing_connectors: ms365.filter((c) => c.status === "planned").map((c) => c.id),
      severity: ms365.some((c) => c.status === "planned") ? "high" : "medium",
    });
  }

  // Check: DATEV — no implemented import path
  const datev = byCategory["datev"] ?? [];
  if (datev.length > 0 && datev.every((c) => c.status === "planned")) {
    gaps.push({
      category: "datev",
      description:
        "DATEV-Connector ist noch nicht implementiert (planned). Steuer- und Buchhaltungsdaten können nicht importiert werden.",
      missing_connectors: datev.map((c) => c.id),
      severity: "high",
    });
  }

  if (
    datev.length > 0 &&
    datev.some((c) => c.status === "available") &&
    datev.every((c) => !c.push_notifications)
  ) {
    gaps.push({
      category: "datev",
      description:
        "DATEV-Import ist verfuegbar, aber dateibasiert. Direkte DATEV-API und Rueckexport sind noch offen.",
      missing_connectors: [],
      severity: "medium",
    });
  }

  // Check: DMS — no push notifications
  const dms = byCategory["dms"] ?? [];
  if (dms.length > 0 && dms.every((c) => !c.push_notifications)) {
    gaps.push({
      category: "dms",
      description:
        "DMS-Connectoren unterstützen keine Push-Benachrichtigungen — nur manuelle Synchronisation.",
      missing_connectors: [],
      severity: "medium",
    });
  }

  // Check: beA — no API, file-based only
  const bea = byCategory["bea"] ?? [];
  if (bea.length > 0 && bea.every((c) => c.auth_method === "file_watch")) {
    gaps.push({
      category: "bea",
      description:
        "beA-Import ist dateibasiert (XML-Export) — keine direkte API-Anbindung verfügbar.",
      missing_connectors: [],
      severity: "low",
    });
  }

  return gaps;
}

// ── Lookup Helpers ────────────────────────────────────────────────────

export function getConnectorById(id: string): ConnectorCoverageEntry | undefined {
  return CONNECTOR_COVERAGE_MATRIX.find((c) => c.id === id);
}

export function getConnectorsByCategory(category: ConnectorCategory): ConnectorCoverageEntry[] {
  return CONNECTOR_COVERAGE_MATRIX.filter((c) => c.category === category);
}

export function getConnectorsByStatus(status: ConnectorStatus): ConnectorCoverageEntry[] {
  return CONNECTOR_COVERAGE_MATRIX.filter((c) => c.status === status);
}

export function getAvailableConnectors(): ConnectorCoverageEntry[] {
  return getConnectorsByStatus("available");
}

export function getPlannedConnectors(): ConnectorCoverageEntry[] {
  return getConnectorsByStatus("planned");
}

export function getConnectorsByAuthMethod(method: AuthMethod): ConnectorCoverageEntry[] {
  return CONNECTOR_COVERAGE_MATRIX.filter((c) => c.auth_method === method);
}

export function getGoBdRelevantConnectors(): ConnectorCoverageEntry[] {
  return CONNECTOR_COVERAGE_MATRIX.filter((c) => c.gobd_relevant);
}

export function getGdprRelevantConnectors(): ConnectorCoverageEntry[] {
  return CONNECTOR_COVERAGE_MATRIX.filter((c) => c.gdpr_relevant);
}

export function getMatterScopeConnectors(): ConnectorCoverageEntry[] {
  return CONNECTOR_COVERAGE_MATRIX.filter((c) => c.matter_scope);
}

export function getConnectorByEngineService(service: string): ConnectorCoverageEntry | undefined {
  return CONNECTOR_COVERAGE_MATRIX.find((c) => c.engine_service === service);
}

export function getConnectorByDmsProvider(provider: string): ConnectorCoverageEntry | undefined {
  return CONNECTOR_COVERAGE_MATRIX.find((c) => c.dms_provider === provider);
}

// ── Validation ────────────────────────────────────────────────────────

export function validateConnectorEntry(entry: ConnectorCoverageEntry): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!entry.id || entry.id.trim().length === 0) errors.push("id is required");
  if (!entry.name || entry.name.trim().length === 0) errors.push("name is required");
  if (!entry.description || entry.description.trim().length === 0)
    errors.push("description is required");
  if (entry.content_types.length === 0) errors.push("content_types must not be empty");
  if (
    entry.required_config.length === 0 &&
    entry.status === "available" &&
    entry.auth_method !== "none" &&
    entry.auth_method !== "manual_upload"
  ) {
    errors.push("available connectors with auth must have required_config");
  }

  return { valid: errors.length === 0, errors };
}

export function validateMatrix(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const entry of CONNECTOR_COVERAGE_MATRIX) {
    if (ids.has(entry.id)) {
      errors.push(`Duplicate connector id: ${entry.id}`);
    }
    ids.add(entry.id);

    const result = validateConnectorEntry(entry);
    if (!result.valid) {
      errors.push(`${entry.id}: ${result.errors.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Summary ───────────────────────────────────────────────────────────

export interface CoverageSummary {
  total: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  by_auth_method: Record<string, number>;
  by_sync_mode: Record<string, number>;
  gobd_relevant_count: number;
  gdpr_relevant_count: number;
  matter_scope_count: number;
  push_notification_count: number;
  coverage_gaps_count: number;
  high_severity_gaps: number;
}

export function getCoverageSummary(): CoverageSummary {
  const matrix = getCoverageMatrix();
  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byAuth: Record<string, number> = {};
  const bySync: Record<string, number> = {};

  for (const c of CONNECTOR_COVERAGE_MATRIX) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    byAuth[c.auth_method] = (byAuth[c.auth_method] ?? 0) + 1;
    bySync[c.sync_mode] = (bySync[c.sync_mode] ?? 0) + 1;
  }

  return {
    total: CONNECTOR_COVERAGE_MATRIX.length,
    by_category: byCategory,
    by_status: byStatus,
    by_auth_method: byAuth,
    by_sync_mode: bySync,
    gobd_relevant_count: CONNECTOR_COVERAGE_MATRIX.filter((c) => c.gobd_relevant).length,
    gdpr_relevant_count: CONNECTOR_COVERAGE_MATRIX.filter((c) => c.gdpr_relevant).length,
    matter_scope_count: CONNECTOR_COVERAGE_MATRIX.filter((c) => c.matter_scope).length,
    push_notification_count: CONNECTOR_COVERAGE_MATRIX.filter((c) => c.push_notifications).length,
    coverage_gaps_count: matrix.coverage_gaps.length,
    high_severity_gaps: matrix.coverage_gaps.filter((g) => g.severity === "high").length,
  };
}
