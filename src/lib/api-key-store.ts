/**
 * Persistent API Key Store — File-based (dev) / Postgres (prod).
 *
 * Folgt exakt dem UserStore-Pattern aus src/lib/auth/store.ts.
 * Keys werden als { id, name, prefix, secretHash, scopes, active, ... }
 * gespeichert — das Plaintext-Secret verlässt den Server nie nach der Ausgabe.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export interface StoredApiKey {
  id: string;
  name: string;
  /** First 16 chars of the key — shown in UI for identification. */
  prefix: string;
  /** SHA-256 of the full key — for verification; never stored in full. */
  secretHash: string;
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
  createdBy: string;
  /** userId that owns this key */
  ownerId: string;
}

export interface ApiKeyStore {
  getById(id: string): Promise<StoredApiKey | null>;
  listByOwner(ownerId: string): Promise<StoredApiKey[]>;
  create(key: StoredApiKey): Promise<StoredApiKey>;
  update(id: string, patch: Partial<StoredApiKey>): Promise<StoredApiKey | null>;
  delete(id: string): Promise<void>;
}

// ── File adapter (dev / self-hosted) ─────────────────────────────────────────

import { env } from "@/lib/env";

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const KEYS_FILE = path.join(DATA_DIR, "api-keys.json");

class FileApiKeyStore implements ApiKeyStore {
  private cache: StoredApiKey[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private async load(): Promise<StoredApiKey[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(KEYS_FILE, "utf8");
      this.cache = JSON.parse(raw) as StoredApiKey[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const keys = this.cache ?? [];
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${KEYS_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(keys, null, 2), "utf8");
      await fs.rename(tmp, KEYS_FILE);
    });
    return this.writeQueue;
  }

  async getById(id: string) {
    return (await this.load()).find((k) => k.id === id) ?? null;
  }

  async listByOwner(ownerId: string) {
    return (await this.load()).filter((k) => k.ownerId === ownerId);
  }

  async create(key: StoredApiKey) {
    const keys = await this.load();
    keys.push(key);
    await this.persist();
    return key;
  }

  async update(id: string, patch: Partial<StoredApiKey>) {
    const keys = await this.load();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return null;
    keys[idx] = { ...keys[idx], ...patch, id: keys[idx].id };
    await this.persist();
    return keys[idx];
  }

  async delete(id: string) {
    const keys = await this.load();
    const idx = keys.findIndex((k) => k.id === id);
    if (idx !== -1) {
      keys.splice(idx, 1);
      await this.persist();
    }
  }
}

// ── Postgres adapter (production) ────────────────────────────────────────────

const AUTH_DB_URL =
  env("SUBSUMIO_AUTH_DATABASE_URL") ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

class PgApiKeyStore implements ApiKeyStore {
  private ready: Promise<void> | null = null;

  private pool(): import("pg").Pool {
    if (!globalThis.__subsumioApiKeyPool) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as typeof import("pg");
      globalThis.__subsumioApiKeyPool = new Pool({
        connectionString: AUTH_DB_URL,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ...(process.env.NODE_ENV === "production" ? { ssl: { rejectUnauthorized: true } } : {}),
      });
    }
    return globalThis.__subsumioApiKeyPool as import("pg").Pool;
  }

  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool()
        .query(
          `
        CREATE TABLE IF NOT EXISTS subsumio_api_keys (
          id text PRIMARY KEY,
          owner_id text NOT NULL,
          name text NOT NULL,
          prefix text NOT NULL,
          secret_hash text NOT NULL,
          scopes jsonb NOT NULL DEFAULT '[]',
          active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          last_used_at timestamptz,
          created_by text NOT NULL DEFAULT ''
        )
      `
        )
        .then(() => undefined);
    }
    return this.ready;
  }

  private row(r: Record<string, unknown>): StoredApiKey {
    return {
      id: String(r.id),
      ownerId: String(r.owner_id),
      name: String(r.name),
      prefix: String(r.prefix),
      secretHash: String(r.secret_hash),
      scopes: Array.isArray(r.scopes)
        ? (r.scopes as string[])
        : JSON.parse(String(r.scopes ?? "[]")),
      active: Boolean(r.active),
      createdAt: String(r.created_at),
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : undefined,
      createdBy: String(r.created_by ?? ""),
    };
  }

  async getById(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query(`SELECT * FROM subsumio_api_keys WHERE id = $1`, [id]);
    return rows[0] ? this.row(rows[0]) : null;
  }

  async listByOwner(ownerId: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query(
      `SELECT * FROM subsumio_api_keys WHERE owner_id = $1 ORDER BY created_at DESC`,
      [ownerId]
    );
    return rows.map((r) => this.row(r));
  }

  async create(key: StoredApiKey) {
    await this.ensureSchema();
    await this.pool().query(
      `INSERT INTO subsumio_api_keys
         (id, owner_id, name, prefix, secret_hash, scopes, active, created_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        key.id,
        key.ownerId,
        key.name,
        key.prefix,
        key.secretHash,
        JSON.stringify(key.scopes),
        key.active,
        key.createdAt,
        key.createdBy,
      ]
    );
    return key;
  }

  async update(id: string, patch: Partial<StoredApiKey>) {
    await this.ensureSchema();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (patch.name !== undefined) {
      sets.push(`name = $${i++}`);
      vals.push(patch.name);
    }
    if (patch.active !== undefined) {
      sets.push(`active = $${i++}`);
      vals.push(patch.active);
    }
    if (patch.scopes !== undefined) {
      sets.push(`scopes = $${i++}`);
      vals.push(JSON.stringify(patch.scopes));
    }
    if (patch.lastUsedAt !== undefined) {
      sets.push(`last_used_at = $${i++}`);
      vals.push(patch.lastUsedAt);
    }
    if (sets.length === 0) return this.getById(id);
    vals.push(id);
    await this.pool().query(
      `UPDATE subsumio_api_keys SET ${sets.join(", ")} WHERE id = $${i}`,
      vals
    );
    return this.getById(id);
  }

  async delete(id: string) {
    await this.ensureSchema();
    await this.pool().query(`DELETE FROM subsumio_api_keys WHERE id = $1`, [id]);
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

declare global {
  var __subsumioApiKeyPool: InstanceType<typeof import("pg").Pool> | undefined;
  var __subsumioApiKeyStore: ApiKeyStore | undefined;
}

export function getApiKeyStore(): ApiKeyStore {
  if (!globalThis.__subsumioApiKeyStore) {
    const useFile =
      !AUTH_DB_URL ||
      (process.env.NODE_ENV !== "production" &&
        env("SUBSUMIO_ALLOW_FILE_AUTH_IN_PRODUCTION") !== "true");
    globalThis.__subsumioApiKeyStore = useFile ? new FileApiKeyStore() : new PgApiKeyStore();
  }
  return globalThis.__subsumioApiKeyStore as ApiKeyStore;
}
