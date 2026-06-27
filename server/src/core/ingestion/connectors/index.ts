/**
 * Connector ingestion sources — external system integrations for GBrain.
 *
 * Architecture:
 *   - BaseConnector: abstract class with OAuth2, retry, rate-limit, delta-sync
 *   - ConnectorManager: registers N connectors with the IngestionDaemon
 *   - Per-service connectors: GoogleDrive, Gmail, Notion, GitHub, Slack, Calendar, Dropbox, Asana, Jira
 *
 * Each connector is a full IngestionSource; the daemon supervises it like
 * any other source (file-watcher, inbox-folder).
 *
 * State of the Art features:
 *   - OAuth2 token refresh (auto)
 *   - Delta sync with cursors / timestamps
 *   - Webhook push where supported (Google Drive push notifications)
 *   - Rate limiting with token bucket
 *   - Exponential backoff on API errors
 *   - Content-type aware routing (PDF → document-ingest, EML → email parsing)
 *   - Bulk migration mode (one-shot full sync)
 *   - Per-connector health checks
 *
 * Usage:
 *   gbrain connector add google-drive   # OAuth2 flow
 *   gbrain connector sync google-drive   # Delta sync
 *   gbrain connector list                # Show all connectors
 *   gbrain connector status              # Health check
 *   gbrain connector remove google-drive # Disconnect
 */

export { BaseConnector } from "./base.ts";
export { ConnectorManager, SUPPORTED_CONNECTORS } from "./manager.ts";
export { GoogleDriveConnector } from "./google-drive.ts";
export { GmailConnector } from "./gmail.ts";
export { NotionConnector } from "./notion.ts";
export { GitHubConnector } from "./github.ts";
export { SlackConnector } from "./slack.ts";
export { CalendarConnector } from "./calendar.ts";
export { DropboxConnector } from "./dropbox.ts";
export { AsanaConnector } from "./asana.ts";
export { JiraConnector } from "./jira.ts";
export { LegalJudgementsConnector } from "./legal-judgements.ts";
export { BeaImportConnector } from "./bea-import.ts";

export type { ConnectorState, ConnectorConfig, SyncCursor } from "./base.ts";
