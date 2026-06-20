/**
 * WhatsApp 24h Customer-Service Window Store — File (dev) / Postgres (prod).
 *
 * Paket 33 (P1-SECR-003): tracks the last inbound message timestamp per recipient
 * so the outbound gate can tell whether the 24h window is open (free-form allowed)
 * or closed (approved template required). One row per phone hash, upserted on
 * every inbound message. Raw phone is never stored — `phoneHash` is the key.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export interface WhatsAppWindowStore {
  /** Record that an inbound message just arrived from this recipient. */
  touch(phoneHash: string, at?: Date): Promise<void>;
  /** Last inbound timestamp for this recipient, or null if none on record. */
  getLastInbound(phoneHash: string): Promise<Date | null>;
}

// ── File adapter (dev / self-hosted) ─────────────────────────────────────────

function dataDir(): string {
  return env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
}

class FileWhatsAppWindowStore implements WhatsAppWindowStore {
  private cache: Record<string, string> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly dir = dataDir();
  private readonly file = path.join(this.dir, "whatsapp-windows.json");

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as Record<string, string>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const map = this.cache ?? {};
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf8");
      await fs.rename(tmp, this.file);
    });
    return this.writeQueue;
  }

  async touch(phoneHash: string, at: Date = new Date()) {
    const map = await this.load();
    map[phoneHash] = at.toISOString();
    await this.persist();
  }

  async getLastInbound(phoneHash: string) {
    const map = await this.load();
    const iso = map[phoneHash];
    return iso ? new Date(iso) : null;
  }
}

// ── Postgres adapter (production) ────────────────────────────────────────────

const AUTH_DB_URL =
  env("SUBSUMIO_AUTH_DATABASE_URL") ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

class PgWhatsAppWindowStore implements WhatsAppWindowStore {
  private ready: Promise<void> | null = null;

  private pool(): import("pg").Pool {
    if (!globalThis.__subsumioWhatsAppWindowPool) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as typeof import("pg");
      globalThis.__subsumioWhatsAppWindowPool = new Pool({
        connectionString: AUTH_DB_URL,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ...(process.env.NODE_ENV === "production" ? { ssl: { rejectUnauthorized: true } } : {}),
      });
    }
    return globalThis.__subsumioWhatsAppWindowPool as import("pg").Pool;
  }

  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool()
        .query(
          `
        CREATE TABLE IF NOT EXISTS subsumio_whatsapp_windows (
          phone_hash text PRIMARY KEY,
          last_inbound_at timestamptz NOT NULL
        )
      `
        )
        .then(() => undefined);
    }
    return this.ready;
  }

  async touch(phoneHash: string, at: Date = new Date()) {
    await this.ensureSchema();
    await this.pool().query(
      `INSERT INTO subsumio_whatsapp_windows (phone_hash, last_inbound_at)
       VALUES ($1, $2)
       ON CONFLICT (phone_hash) DO UPDATE SET last_inbound_at = EXCLUDED.last_inbound_at`,
      [phoneHash, at.toISOString()]
    );
  }

  async getLastInbound(phoneHash: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query<{ last_inbound_at: string }>(
      `SELECT last_inbound_at FROM subsumio_whatsapp_windows WHERE phone_hash = $1`,
      [phoneHash]
    );
    return rows[0] ? new Date(rows[0].last_inbound_at) : null;
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

declare global {
  var __subsumioWhatsAppWindowPool: InstanceType<typeof import("pg").Pool> | undefined;
  var __subsumioWhatsAppWindowStore: WhatsAppWindowStore | undefined;
}

export function getWhatsAppWindowStore(): WhatsAppWindowStore {
  if (!globalThis.__subsumioWhatsAppWindowStore) {
    const useFile =
      !AUTH_DB_URL ||
      (process.env.NODE_ENV !== "production" &&
        env("SUBSUMIO_ALLOW_FILE_AUTH_IN_PRODUCTION") !== "true");
    globalThis.__subsumioWhatsAppWindowStore = useFile
      ? new FileWhatsAppWindowStore()
      : new PgWhatsAppWindowStore();
  }
  return globalThis.__subsumioWhatsAppWindowStore as WhatsAppWindowStore;
}

/** Test-only: reset the cached singleton so a fresh adapter is created. */
export function __resetWhatsAppWindowStoreForTests(): void {
  globalThis.__subsumioWhatsAppWindowStore = undefined;
}
