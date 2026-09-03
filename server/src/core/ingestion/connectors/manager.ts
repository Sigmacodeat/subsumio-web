/**
 * ConnectorManager — orchestrates N connector instances, registers them
 * with the IngestionDaemon, and provides CLI-facing lifecycle commands.
 *
 * The manager reads connector configuration from `~/.gbrain/connectors.json`
 * (a registry of active connectors) and instantiates the appropriate
 * subclass for each entry. On daemon startup, every active connector is
 * registered; on shutdown, all are stopped gracefully.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { type IngestionSource, type IngestionSourceContext } from "../types.ts";
import { BaseConnector, type ConnectorConfig, type ConnectorState } from "./base.ts";
import { GoogleDriveConnector } from "./google-drive.ts";
import { GmailConnector } from "./gmail.ts";
import { NotionConnector } from "./notion.ts";
import { GitHubConnector } from "./github.ts";
import { SlackConnector } from "./slack.ts";
import { CalendarConnector } from "./calendar.ts";
import { DropboxConnector } from "./dropbox.ts";
import { AsanaConnector } from "./asana.ts";
import { JiraConnector } from "./jira.ts";
import { LegalJudgementsConnector } from "./legal-judgements.ts";
import { SwissJudgementsConnector } from "./swiss-judgements.ts";
import { BeaImportConnector } from "./bea-import.ts";
import { ErvImportConnector } from "./erv-import.ts";
import { AdvokatImportConnector } from "./advokat-import.ts";
import { OpenAccessCommentaryConnector } from "./open-access-commentaries.ts";
import {
  MicrosoftOneDriveConnector,
  MicrosoftOutlookConnector,
  MicrosoftSharePointConnector,
} from "./microsoft-365.ts";

/** Registry entry: one line per active connector. */
interface ConnectorRegistryEntry {
  service: string;
  enabled: boolean;
  config: ConnectorConfig;
}

/** Maps service name → constructor. Add new connectors here. */
export const CONNECTOR_REGISTRY: Record<string, new (cfg: ConnectorConfig) => BaseConnector> = {
  "google-drive": GoogleDriveConnector,
  gmail: GmailConnector,
  notion: NotionConnector,
  github: GitHubConnector,
  slack: SlackConnector,
  calendar: CalendarConnector,
  dropbox: DropboxConnector,
  asana: AsanaConnector,
  jira: JiraConnector,
  "legal-judgements": LegalJudgementsConnector,
  "swiss-judgements": SwissJudgementsConnector,
  "bea-import": BeaImportConnector,
  "erv-import": ErvImportConnector,
  "advokat-import": AdvokatImportConnector,
  "open-access-commentaries": OpenAccessCommentaryConnector,
  "ms365-outlook": MicrosoftOutlookConnector,
  "ms365-onedrive": MicrosoftOneDriveConnector,
  "ms365-sharepoint": MicrosoftSharePointConnector,
};

export const SUPPORTED_CONNECTORS = Object.keys(CONNECTOR_REGISTRY);

export class ConnectorManager {
  private connectors: Map<string, BaseConnector> = new Map();
  // G21/G22 fix: maintain a service→connectorId index so list()/remove()/
  // syncOne() can look up connectors by service name. Pre-fix, the map was
  // keyed by connector.id but lookups used service name → always missed.
  private serviceToId: Map<string, string> = new Map();

  constructor(private readonly baseDir?: string) {}

  private _registryPath(): string {
    return join(this.baseDir ?? homedir(), ".gbrain", "connectors.json");
  }

  /** Find a connector's ID by service name. */
  private _findConnectorIdByService(service: string): string | undefined {
    // Check the index first (fast path)
    const indexed = this.serviceToId.get(service);
    if (indexed && this.connectors.has(indexed)) return indexed;
    // Fallback: scan the map (covers connectors loaded before index was added)
    for (const [id, conn] of this.connectors) {
      if (conn.service === service || id.startsWith(`${service}-`) || id === service) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Load the connector registry from disk and instantiate all enabled
   * connectors. Returns an array of IngestionSource ready for daemon
   * registration.
   */
  async loadEnabled(): Promise<BaseConnector[]> {
    const entries = await this._loadRegistry();
    const sources: BaseConnector[] = [];
    for (const entry of entries) {
      if (!entry.enabled) continue;
      const ctor = CONNECTOR_REGISTRY[entry.service];
      if (!ctor) {
        console.warn(`[gbrain] Unknown connector service: ${entry.service}`);
        continue;
      }
      try {
        const connector = new ctor(entry.config);
        this.connectors.set(connector.id, connector);
        this.serviceToId.set(entry.service, connector.id);
        sources.push(connector);
      } catch (err) {
        console.warn(
          `[gbrain] Failed to instantiate ${entry.service}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return sources;
  }

  /**
   * Add a new connector to the registry. Does NOT start it — the caller
   * must register the returned source with the daemon.
   */
  async add(service: string, config: ConnectorConfig): Promise<BaseConnector> {
    if (!SUPPORTED_CONNECTORS.includes(service)) {
      throw new Error(
        `Unsupported connector: ${service}. Supported: ${SUPPORTED_CONNECTORS.join(", ")}`
      );
    }
    const ctor = CONNECTOR_REGISTRY[service];
    const connector = new ctor(config);

    // Persist initial state.
    const state: ConnectorState = {
      connector_id: connector.id,
      service,
      access_token: config.api_key ?? "",
      config: config as Record<string, unknown>,
    };
    const statePath = join(homedir(), ".gbrain", "connectors", `${service}.json`);
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(state, null, 2));

    // Add to registry.
    const entries = await this._loadRegistry();
    const existing = entries.findIndex((e) => e.service === service);
    if (existing >= 0) entries[existing] = { service, enabled: true, config };
    else entries.push({ service, enabled: true, config });
    await this._saveRegistry(entries);

    this.connectors.set(connector.id, connector);
    this.serviceToId.set(service, connector.id);
    return connector;
  }

  /** Remove a connector from the registry and delete its state. */
  async remove(service: string): Promise<void> {
    const entries = await this._loadRegistry();
    const idx = entries.findIndex((e) => e.service === service);
    if (idx >= 0) {
      entries.splice(idx, 1);
      await this._saveRegistry(entries);
    }
    // Delete state file.
    const statePath = join(homedir(), ".gbrain", "connectors", `${service}.json`);
    if (existsSync(statePath)) {
      await import("node:fs/promises").then((fs) => fs.unlink(statePath));
    }
    // G22 fix: delete by the actual connector.id, not by service name.
    const connectorId = this._findConnectorIdByService(service);
    if (connectorId) {
      this.connectors.delete(connectorId);
      this.serviceToId.delete(service);
    }
  }

  /** Enable or disable a connector. */
  async setEnabled(service: string, enabled: boolean): Promise<void> {
    const entries = await this._loadRegistry();
    const entry = entries.find((e) => e.service === service);
    if (!entry) throw new Error(`Connector not found: ${service}`);
    entry.enabled = enabled;
    await this._saveRegistry(entries);
  }

  /** List all registered connectors with status. */
  async list(): Promise<
    Array<{ service: string; enabled: boolean; connected: boolean; hasCredentials: boolean }>
  > {
    const entries = await this._loadRegistry();
    return entries.map((e) => ({
      service: e.service,
      enabled: e.enabled,
      // G21 fix: look up by service→id index, not by raw service name.
      connected: this._findConnectorIdByService(e.service) !== undefined,
      hasCredentials: !!(e.config.client_id || e.config.client_secret || e.config.api_key),
    }));
  }

  /** Trigger a one-shot sync for a connector. */
  async syncOne(service: string, ctx: IngestionSourceContext): Promise<void> {
    // G21 fix: look up by service→id index, not by raw service name.
    const connectorId = this._findConnectorIdByService(service);
    const connector = connectorId ? this.connectors.get(connectorId) : undefined;
    if (!connector) throw new Error(`Connector not running: ${service}`);
    const startedAt = Date.now();
    let syncError: string | undefined;
    let itemsRetrieved = 0;
    // G23 fix: add a 5-minute timeout to prevent indefinite hangs.
    // Pre-fix, connector.sync() could hang forever with no abort signal.
    const SYNC_TIMEOUT_MS = 5 * 60 * 1000;
    try {
      const result = await Promise.race([
        connector.sync(ctx),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`sync_timeout_${SYNC_TIMEOUT_MS / 1000}s`)),
            SYNC_TIMEOUT_MS
          )
        ),
      ]);
      if (result && typeof result === "object" && "itemsCount" in result) {
        itemsRetrieved = (result as { itemsCount: number }).itemsCount;
      }
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
      await this._persistSyncMetadata(service, {
        last_sync_at: startedAt,
        last_sync_duration_ms: Date.now() - startedAt,
        last_sync_status: "error",
        last_sync_error: syncError,
        last_items_retrieved: 0,
      });
      throw err;
    }
    await this._persistSyncMetadata(service, {
      last_sync_at: startedAt,
      last_sync_duration_ms: Date.now() - startedAt,
      last_sync_status: "ok",
      last_sync_error: undefined,
      last_items_retrieved: itemsRetrieved,
    });
  }

  /** Persist sync metadata into the connector state file. */
  private async _persistSyncMetadata(
    service: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const statePath = join(this.baseDir ?? homedir(), ".gbrain", "connectors", `${service}.json`);
    let state: Record<string, unknown> = {};
    if (existsSync(statePath)) {
      try {
        const { readFileSync } = await import("node:fs");
        const raw = readFileSync(statePath, "utf-8");
        state = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Corrupt state file — start fresh
      }
    }
    Object.assign(state, metadata);
    try {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(statePath), { recursive: true });
      writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch {
      // Best-effort — don't fail the sync if state persistence fails
    }
  }

  /** Get the raw config for a registered connector. */
  async getConfig(service: string): Promise<Record<string, unknown> | null> {
    const entries = await this._loadRegistry();
    const entry = entries.find((e) => e.service === service);
    return (entry?.config as Record<string, unknown>) ?? null;
  }

  /** Get last successful sync timestamp from the connector state file. */
  async getLastSync(service: string): Promise<number | null> {
    const meta = await this.getSyncMetadata(service);
    return meta.last_sync_at ?? null;
  }

  /** Get full sync metadata (timestamp, status, duration, items, error). */
  async getSyncMetadata(service: string): Promise<{
    last_sync_at?: number;
    last_sync_status?: "ok" | "error";
    last_sync_duration_ms?: number;
    last_items_retrieved?: number;
    last_sync_error?: string;
  }> {
    const statePath = join(this.baseDir ?? homedir(), ".gbrain", "connectors", `${service}.json`);
    if (!existsSync(statePath)) return {};
    try {
      const raw = await readFile(statePath, "utf-8");
      return JSON.parse(raw) as {
        last_sync_at?: number;
        last_sync_status?: "ok" | "error";
        last_sync_duration_ms?: number;
        last_items_retrieved?: number;
        last_sync_error?: string;
      };
    } catch {
      return {};
    }
  }

  // ── Registry I/O ────────────────────────────────────────────────────

  private async _loadRegistry(): Promise<ConnectorRegistryEntry[]> {
    const path = this._registryPath();
    if (!existsSync(path)) return [];
    try {
      const raw = await readFile(path, "utf-8");
      return JSON.parse(raw) as ConnectorRegistryEntry[];
    } catch {
      return [];
    }
  }

  private async _saveRegistry(entries: ConnectorRegistryEntry[]): Promise<void> {
    const path = this._registryPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(entries, null, 2));
  }
}
