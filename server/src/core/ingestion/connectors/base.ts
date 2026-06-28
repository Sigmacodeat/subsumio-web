/**
 * BaseConnector — abstract ingestion source for external system integrations.
 *
 * Provides the foundation every connector inherits:
 *   - OAuth2 token management (refresh, storage in ~/.gbrain/connectors/)
 *   - Delta sync with cursor persistence
 *   - Rate limiting (token bucket per API)
 *   - Exponential backoff on API errors
 *   - Content-type detection and routing
 *   - Health check surface
 *
 * Subclasses implement:
 *   - authenticate(): OAuth2 flow or API key setup
 *   - fetchDelta(cursor): fetch only changed items since last sync
 *   - toIngestionEvent(item): convert API item → IngestionEvent
 *   - getApiRateLimit(): return the service's rate limit config
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  type IngestionEvent,
  type IngestionSource,
  type IngestionSourceContext,
  type IngestionSourceHealth,
  type IngestionSourceMode,
  type IngestionContentType,
  computeContentHash,
} from "../types.ts";

/** Stored per-connector state in ~/.gbrain/connectors/ */
export interface ConnectorState {
  /** Connector instance id. */
  connector_id: string;
  /** Service name (google-drive, gmail, notion, github, slack, calendar). */
  service: string;
  /** OAuth2 access token (or API key for PAT-based services). */
  access_token: string;
  /** OAuth2 refresh token. */
  refresh_token?: string;
  /** Token expiry timestamp (ms since epoch). */
  token_expires_at?: number;
  /** Delta sync cursor (service-specific opaque string). */
  sync_cursor?: string;
  /** Last successful sync timestamp. */
  last_sync_at?: number;
  /** Connector-specific config overrides. */
  config?: Record<string, unknown>;
  /** Push webhook channel id (Google Drive changes.watch). */
  webhook_channel_id?: string;
  /** Push webhook resource id (Google Drive). */
  webhook_resource_id?: string;
  /** Push webhook expiration timestamp (Google Drive). */
  webhook_expires_at?: number;
}

/** Per-connector configuration passed at construction. */
export interface ConnectorConfig {
  /** OAuth2 / API credentials. */
  client_id?: string;
  client_secret?: string;
  /** API key for services that use PAT (GitHub, Notion). */
  api_key?: string;
  /** Polling interval in ms. Default: 5 minutes. */
  poll_interval_ms?: number;
  /** Sync mode: trickle (continuous delta) or migration (one-shot bulk). */
  mode?: IngestionSourceMode;
  /** Max items per sync batch. */
  batch_size?: number;
  /** Filters per service (e.g. Gmail label, Drive folder, Notion database). */
  filters?: Record<string, string | string[]>;
  /** OAuth2 redirect URI. */
  redirect_uri?: string;
  /** Public webhook URL for push notifications (e.g. ngrok tunnel). */
  webhook_url?: string;
  /** Base URL for self-hosted or cloud instances (Jira, Confluence). */
  base_url?: string;
}

/** Opaque cursor for delta sync. */
export interface SyncCursor {
  /** Service-specific opaque token. */
  token: string;
  /** UTC timestamp the cursor was saved. */
  saved_at: number;
}

/** Token bucket rate limiter. */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(
    private capacity: number,
    private refillRatePerMs: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefill = now;
    if (this.tokens < 1) {
      const wait = Math.ceil((1 - this.tokens) / this.refillRatePerMs);
      await new Promise((r) => setTimeout(r, wait));
      return this.acquire();
    }
    this.tokens -= 1;
  }
}

/** Abstract base every connector inherits. */
export abstract class BaseConnector implements IngestionSource {
  readonly id: string;
  readonly kind: string;
  readonly mode: IngestionSourceMode;

  protected _ctx?: IngestionSourceContext;
  private _interval?: ReturnType<typeof setInterval>;
  private _running = false;
  private _bucket: TokenBucket;
  protected _state?: ConnectorState;

  /** Subclass MUST call super() with its service name. */
  constructor(
    public readonly service: string,
    protected _config: ConnectorConfig
  ) {
    this.id = _config.filters?.id ? `${service}-${_config.filters.id}` : service;
    this.kind = `connector:${service}`;
    this.mode = _config.mode ?? "trickle";
    // Default: 100 requests per 100s (Google's default). Subclass override via getApiRateLimit().
    const { capacity = 100, windowMs = 100_000 } = this.getApiRateLimit();
    this._bucket = new TokenBucket(capacity, capacity / windowMs);
  }

  // ── Abstract hooks (subclass implements) ───────────────────────────

  /** Return the API's rate limit config. Default is Google-style 100/100s. */
  abstract getApiRateLimit(): { capacity: number; windowMs: number };

  /** Refresh the access token if expired. Subclass implements OAuth2 refresh. */
  abstract refreshToken(): Promise<void>;

  /** Fetch changed items since the given cursor. Returns new items + next cursor. */
  abstract fetchDelta(cursor?: string): Promise<{ items: ConnectorItem[]; nextCursor?: string }>;

  /** Convert a service-specific item into an IngestionEvent. */
  abstract toIngestionEvent(item: ConnectorItem): Promise<IngestionEvent>;

  /** Optional: register a webhook for push notifications. */
  async registerWebhook?(): Promise<void>;

  /** Optional: unregister webhook on shutdown. */
  async unregisterWebhook?(): Promise<void>;

  // ── IngestionSource lifecycle ────────────────────────────────────────

  async start(ctx: IngestionSourceContext): Promise<void> {
    this._ctx = ctx;
    this._running = true;

    // Load persisted state (token + cursor).
    this._state = (await this._loadState()) ?? {
      connector_id: this.id,
      service: this.service,
      access_token: "",
    };

    // Ensure token is valid before first sync.
    await this._ensureTokenValid();

    // Try to register push webhook (if supported by subclass).
    if (this.registerWebhook) {
      try {
        await this.registerWebhook();
        ctx.logger.info(`[${this.id}] Webhook registered for push notifications`);
      } catch {
        ctx.logger.warn(`[${this.id}] Webhook registration failed; falling back to polling`);
      }
    }

    // Immediate first sync.
    await this._syncOnce();

    // Schedule periodic delta sync.
    const interval = this._config.poll_interval_ms ?? 300_000;
    this._interval = setInterval(() => {
      if (!this._running) return;
      this._syncOnce().catch((err) => {
        ctx.logger.error(
          `[${this.id}] Sync error: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, interval);

    ctx.logger.info(`[${this.id}] Connector started (interval: ${interval}ms, mode: ${this.mode})`);
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = undefined;
    }
    if (this.unregisterWebhook) {
      try {
        await this.unregisterWebhook();
      } catch {
        /* non-fatal */
      }
    }
    this._ctx?.logger.info(`[${this.id}] Connector stopped`);
  }

  async healthCheck(): Promise<IngestionSourceHealth> {
    if (!this._running) return { status: "fail", message: "not running" };
    if (!this._state) return { status: "warn", message: "state not loaded" };
    const tokenStale = this._state.token_expires_at && Date.now() > this._state.token_expires_at;
    if (tokenStale) return { status: "warn", message: "token expired or nearing expiry" };
    return { status: "ok" };
  }

  // ── Sync orchestration ───────────────────────────────────────────────

  /**
   * Public one-shot sync entry point. Used by CLI `gbrain connector sync`
   * and by the daemon's periodic timer. Creates a minimal IngestionSourceContext
   * with a no-op logger if none exists (e.g. CLI trigger before daemon start).
   */
  async sync(ctx?: IngestionSourceContext): Promise<void> {
    if (ctx) this._ctx = ctx;
    if (!this._ctx) {
      // CLI-triggered sync without daemon context: create a minimal one.
      const noopLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
      } as any;
      this._ctx = {
        emit: () => {},
        engine: {} as any,
        logger: noopLogger,
        abortSignal: new AbortController().signal,
        config: {},
      };
    }
    // Ensure state is loaded (needed when sync() is called without prior start()).
    if (!this._state) {
      this._state = (await this._loadState()) ?? {
        connector_id: this.id,
        service: this.service,
        access_token: "",
      };
    }
    // _syncOnce checks _running; temporarily set it for one-shot sync.
    const wasRunning = this._running;
    this._running = true;
    try {
      await this._ensureTokenValid();
      return await this._syncOnce();
    } finally {
      this._running = wasRunning;
    }
  }

  private async _syncOnce(): Promise<void> {
    if (!this._ctx || !this._running) return;

    await this._ensureTokenValid();

    let cursor = this._state?.sync_cursor;
    let batchCount = 0;
    const maxBatches = this._config.mode === "migration" ? 1000 : 10;

    while (this._running && batchCount < maxBatches) {
      // Rate limit before API call.
      await this._bucket.acquire();

      let result: { items: ConnectorItem[]; nextCursor?: string };
      try {
        result = await this._withRetry(() => this.fetchDelta(cursor));
      } catch (err) {
        this._ctx.logger.error(
          `[${this.id}] fetchDelta failed after retries: ${err instanceof Error ? err.message : String(err)}`
        );
        break;
      }

      if (result.items.length === 0) break;

      for (const item of result.items) {
        if (!this._running) break;
        try {
          const event = await this.toIngestionEvent(item);
          this._ctx.emit(event);
        } catch (err) {
          this._ctx.logger.warn(
            `[${this.id}] Event conversion failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      cursor = result.nextCursor;
      batchCount++;

      // Persist cursor after each batch.
      if (this._state) {
        this._state.sync_cursor = cursor;
        this._state.last_sync_at = Date.now();
        await this._saveState(this._state);
      }

      if (!cursor) break; // No more pages.
    }

    this._ctx.logger.info(`[${this.id}] Sync complete: ${batchCount} batch(es)`);
  }

  // ── Token management ─────────────────────────────────────────────────

  private async _ensureTokenValid(): Promise<void> {
    if (!this._state) return;
    const nearingExpiry =
      this._state.token_expires_at && Date.now() > this._state.token_expires_at - 60_000;
    if (nearingExpiry && this._state.refresh_token) {
      try {
        await this.refreshToken();
      } catch (err) {
        this._ctx?.logger.error(
          `[${this.id}] Token refresh failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  protected getAccessToken(): string {
    if (!this._state) return "";
    if (this._state.token_expires_at && Date.now() > this._state.token_expires_at) return "";
    return this._state.access_token ?? "";
  }

  protected updateTokens(
    accessToken: string,
    refreshToken?: string,
    expiresInSeconds?: number
  ): void {
    if (!this._state) {
      this._state = {
        connector_id: this.id,
        service: this.service,
        access_token: accessToken,
      };
    } else {
      this._state.access_token = accessToken;
    }
    if (refreshToken) this._state.refresh_token = refreshToken;
    if (expiresInSeconds) this._state.token_expires_at = Date.now() + expiresInSeconds * 1000;
    this._saveState(this._state).catch(() => {
      /* non-fatal */
    });
  }

  // ── Retry logic ──────────────────────────────────────────────────────

  private async _withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const delay = Math.min(1000 * Math.pow(2, i), 30_000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  // ── State persistence ────────────────────────────────────────────────

  private _statePath(): string {
    return join(homedir(), ".gbrain", "connectors", `${this.service}.json`);
  }

  protected async _loadState(): Promise<ConnectorState | undefined> {
    const path = this._statePath();
    if (!existsSync(path)) return undefined;
    try {
      const raw = await readFile(path, "utf-8");
      const parsed = JSON.parse(raw) as ConnectorState;
      // Merge with constructor config (constructor wins for credentials).
      if (this._config.api_key) parsed.access_token = this._config.api_key;
      return parsed;
    } catch {
      return undefined;
    }
  }

  protected async _saveState(state: ConnectorState): Promise<void> {
    const path = this._statePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(state, null, 2));
  }

  // ── Helpers for subclasses ───────────────────────────────────────────

  /** Detect content type from file extension or mime type. */
  protected detectContentType(filename: string, mime?: string): IngestionContentType {
    const lower = filename.toLowerCase();
    if (mime?.startsWith("text/html") || lower.endsWith(".html") || lower.endsWith(".htm"))
      return "text/html";
    if (
      mime?.startsWith("text/") ||
      lower.endsWith(".md") ||
      lower.endsWith(".txt") ||
      lower.endsWith(".markdown")
    )
      return "text/markdown";
    if (mime?.startsWith("application/pdf") || lower.endsWith(".pdf")) return "application/pdf";
    if (mime?.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg)$/.test(lower))
      return "image/*";
    if (mime?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/.test(lower)) return "audio/*";
    if (mime?.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm)$/.test(lower)) return "video/*";
    if (mime?.startsWith("application/json") || lower.endsWith(".json")) return "application/json";
    return "unknown";
  }

  /** Compute a stable content hash for dedup. */
  protected hashContent(content: string): string {
    return computeContentHash(content);
  }
}

/** Generic item shape returned by fetchDelta. Subclass narrows this. */
export interface ConnectorItem {
  /** Unique identifier from the external service. */
  id: string;
  /** Human-readable title/name. */
  title: string;
  /** UTC ISO timestamp the item was created or last modified. */
  modified_at: string;
  /** Content body or path to content. */
  content: string;
  /** MIME type or format hint. */
  content_type?: string;
  /** Original service URL. */
  url?: string;
  /** Service-specific metadata. */
  metadata?: Record<string, unknown>;
}
