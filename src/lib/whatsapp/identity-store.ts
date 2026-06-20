/**
 * Persistent WhatsApp Identity Store — File-based (dev) / Postgres (prod).
 *
 * Paket 33 (P0-SECR-002): replaces the env-only sender binding with a DB-backed,
 * tenant-scoped, lifecycle-managed identity. The raw phone number is never the
 * key or persisted — lookups go through the SHA-256 `phoneHash`.
 *
 * Folgt exakt dem ApiKeyStore-/UserStore-Pattern aus src/lib/api-key-store.ts.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type { WhatsAppIdentity } from "./types";

export interface WhatsAppIdentityStore {
  /** Resolve by phone hash — the hot path for inbound webhook authorization. */
  getByPhoneHash(phoneHash: string): Promise<WhatsAppIdentity | null>;
  getById(id: string): Promise<WhatsAppIdentity | null>;
  listByOrg(orgId: string): Promise<WhatsAppIdentity[]>;
  create(identity: WhatsAppIdentity): Promise<WhatsAppIdentity>;
  update(id: string, patch: Partial<WhatsAppIdentity>): Promise<WhatsAppIdentity | null>;
  delete(id: string): Promise<void>;
}

// ── File adapter (dev / self-hosted) ─────────────────────────────────────────

/** Resolved lazily per store instance so SUBSUMIO_DATA_DIR can vary at runtime/tests. */
function dataDir(): string {
  return env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
}

class FileWhatsAppIdentityStore implements WhatsAppIdentityStore {
  private cache: WhatsAppIdentity[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly dir = dataDir();
  private readonly file = path.join(this.dir, "whatsapp-identities.json");

  private async load(): Promise<WhatsAppIdentity[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.cache = JSON.parse(raw) as WhatsAppIdentity[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const identities = this.cache ?? [];
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(identities, null, 2), "utf8");
      await fs.rename(tmp, this.file);
    });
    return this.writeQueue;
  }

  async getByPhoneHash(phoneHash: string) {
    return (await this.load()).find((i) => i.phoneHash === phoneHash) ?? null;
  }

  async getById(id: string) {
    return (await this.load()).find((i) => i.id === id) ?? null;
  }

  async listByOrg(orgId: string) {
    return (await this.load()).filter((i) => i.orgId === orgId);
  }

  async create(identity: WhatsAppIdentity) {
    const identities = await this.load();
    identities.push(identity);
    await this.persist();
    return identity;
  }

  async update(id: string, patch: Partial<WhatsAppIdentity>) {
    const identities = await this.load();
    const idx = identities.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    identities[idx] = {
      ...identities[idx],
      ...patch,
      id: identities[idx].id,
      updatedAt: new Date().toISOString(),
    };
    await this.persist();
    return identities[idx];
  }

  async delete(id: string) {
    const identities = await this.load();
    const idx = identities.findIndex((i) => i.id === id);
    if (idx !== -1) {
      identities.splice(idx, 1);
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

class PgWhatsAppIdentityStore implements WhatsAppIdentityStore {
  private ready: Promise<void> | null = null;

  private pool(): import("pg").Pool {
    if (!globalThis.__subsumioWhatsAppIdentityPool) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as typeof import("pg");
      globalThis.__subsumioWhatsAppIdentityPool = new Pool({
        connectionString: AUTH_DB_URL,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ...(process.env.NODE_ENV === "production" ? { ssl: { rejectUnauthorized: true } } : {}),
      });
    }
    return globalThis.__subsumioWhatsAppIdentityPool as import("pg").Pool;
  }

  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool()
        .query(
          `
        CREATE TABLE IF NOT EXISTS subsumio_whatsapp_identities (
          id text PRIMARY KEY,
          org_id text NOT NULL,
          brain_id text NOT NULL,
          phone_hash text NOT NULL UNIQUE,
          user_id text,
          name text,
          role text NOT NULL DEFAULT 'lawyer',
          matter_scope jsonb NOT NULL DEFAULT '"all"',
          status text NOT NULL DEFAULT 'active',
          verified_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `
        )
        .then(() => undefined);
    }
    return this.ready;
  }

  private row(r: Record<string, unknown>): WhatsAppIdentity {
    const rawScope = r.matter_scope;
    const matterScope: string[] | "all" = Array.isArray(rawScope)
      ? (rawScope as string[])
      : rawScope === "all" || rawScope == null
        ? "all"
        : (JSON.parse(String(rawScope)) as string[] | "all");
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      brainId: String(r.brain_id),
      phone: "", // never read back from storage — phone is hashed
      phoneHash: String(r.phone_hash),
      userId: r.user_id ? String(r.user_id) : undefined,
      name: r.name ? String(r.name) : undefined,
      role: (r.role ? String(r.role) : "lawyer") as WhatsAppIdentity["role"],
      matterScope,
      status: String(r.status) as WhatsAppIdentity["status"],
      verifiedAt: r.verified_at ? String(r.verified_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async getByPhoneHash(phoneHash: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query(
      `SELECT * FROM subsumio_whatsapp_identities WHERE phone_hash = $1`,
      [phoneHash]
    );
    return rows[0] ? this.row(rows[0]) : null;
  }

  async getById(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query(
      `SELECT * FROM subsumio_whatsapp_identities WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.row(rows[0]) : null;
  }

  async listByOrg(orgId: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query(
      `SELECT * FROM subsumio_whatsapp_identities WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    return rows.map((r) => this.row(r));
  }

  async create(identity: WhatsAppIdentity) {
    await this.ensureSchema();
    await this.pool().query(
      `INSERT INTO subsumio_whatsapp_identities
         (id, org_id, brain_id, phone_hash, user_id, name, role, matter_scope, status, verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        identity.id,
        identity.orgId,
        identity.brainId,
        identity.phoneHash,
        identity.userId ?? null,
        identity.name ?? null,
        identity.role ?? "lawyer",
        JSON.stringify(identity.matterScope),
        identity.status,
        identity.verifiedAt,
        identity.createdAt,
        identity.updatedAt,
      ]
    );
    return identity;
  }

  async update(id: string, patch: Partial<WhatsAppIdentity>) {
    await this.ensureSchema();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (patch.name !== undefined) {
      sets.push(`name = $${i++}`);
      vals.push(patch.name);
    }
    if (patch.role !== undefined) {
      sets.push(`role = $${i++}`);
      vals.push(patch.role);
    }
    if (patch.matterScope !== undefined) {
      sets.push(`matter_scope = $${i++}`);
      vals.push(JSON.stringify(patch.matterScope));
    }
    if (patch.status !== undefined) {
      sets.push(`status = $${i++}`);
      vals.push(patch.status);
    }
    if (patch.verifiedAt !== undefined) {
      sets.push(`verified_at = $${i++}`);
      vals.push(patch.verifiedAt);
    }
    sets.push(`updated_at = now()`);
    if (sets.length === 1) return this.getById(id); // only updated_at → nothing meaningful
    vals.push(id);
    await this.pool().query(
      `UPDATE subsumio_whatsapp_identities SET ${sets.join(", ")} WHERE id = $${i}`,
      vals
    );
    return this.getById(id);
  }

  async delete(id: string) {
    await this.ensureSchema();
    await this.pool().query(`DELETE FROM subsumio_whatsapp_identities WHERE id = $1`, [id]);
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

declare global {
  var __subsumioWhatsAppIdentityPool: InstanceType<typeof import("pg").Pool> | undefined;
  var __subsumioWhatsAppIdentityStore: WhatsAppIdentityStore | undefined;
}

export function getWhatsAppIdentityStore(): WhatsAppIdentityStore {
  if (!globalThis.__subsumioWhatsAppIdentityStore) {
    const useFile =
      !AUTH_DB_URL ||
      (process.env.NODE_ENV !== "production" &&
        env("SUBSUMIO_ALLOW_FILE_AUTH_IN_PRODUCTION") !== "true");
    globalThis.__subsumioWhatsAppIdentityStore = useFile
      ? new FileWhatsAppIdentityStore()
      : new PgWhatsAppIdentityStore();
  }
  return globalThis.__subsumioWhatsAppIdentityStore as WhatsAppIdentityStore;
}

/** Test-only: reset the cached singleton so a fresh adapter is created. */
export function __resetWhatsAppIdentityStoreForTests(): void {
  globalThis.__subsumioWhatsAppIdentityStore = undefined;
}
