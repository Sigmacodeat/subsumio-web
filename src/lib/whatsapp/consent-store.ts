/**
 * WhatsApp Consent Store — File-based (dev) / Postgres (prod).
 *
 * Paket 33 (P1-SECR-003): records opt-in/opt-out for business-initiated WhatsApp
 * messaging, per subject (lawyer or client) and per scope. The outbound gate
 * refuses any proactive message without an active consent for its scope.
 *
 * DSGVO: `consentProof` captures when/where/how the opt-in was given. The raw
 * phone is never the key — `phoneHash` is. Folgt dem identity-store.ts-Muster.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type { OutboundScope } from "./outbound-gate";

export interface WhatsAppConsent {
  id: string;
  orgId: string;
  /** Two trust tiers: a lawyer/staff member, or an external client. */
  subjectType: "lawyer" | "client";
  /** userId for lawyers, clientId for clients. */
  subjectRef: string;
  phoneHash: string;
  /** Scopes this subject opted into. */
  scopes: OutboundScope[];
  optInAt: string;
  /** Set when consent is withdrawn — withdrawal wins over opt-in. */
  optOutAt: string | null;
  /** DSGVO proof: source, timestamp, wording of the opt-in. */
  consentProof: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Is this consent currently active (opted in, not withdrawn)? */
export function isConsentActive(c: WhatsAppConsent): boolean {
  return !!c.optInAt && !c.optOutAt;
}

export interface WhatsAppConsentStore {
  getByPhoneHash(phoneHash: string): Promise<WhatsAppConsent[]>;
  getById(id: string): Promise<WhatsAppConsent | null>;
  create(consent: WhatsAppConsent): Promise<WhatsAppConsent>;
  update(id: string, patch: Partial<WhatsAppConsent>): Promise<WhatsAppConsent | null>;
  delete(id: string): Promise<void>;
}

/**
 * Does an active consent for `scope` exist among this recipient's consent rows?
 * The hot-path helper the outbound gate calls.
 */
export async function hasActiveConsent(
  store: WhatsAppConsentStore,
  phoneHash: string,
  scope: OutboundScope
): Promise<boolean> {
  const rows = await store.getByPhoneHash(phoneHash);
  return rows.some((c) => isConsentActive(c) && c.scopes.includes(scope));
}

// ── File adapter (dev / self-hosted) ─────────────────────────────────────────

function dataDir(): string {
  return env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
}

class FileWhatsAppConsentStore implements WhatsAppConsentStore {
  private cache: WhatsAppConsent[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly dir = dataDir();
  private readonly file = path.join(this.dir, "whatsapp-consent.json");

  private async load(): Promise<WhatsAppConsent[]> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as WhatsAppConsent[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const rows = this.cache ?? [];
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
      await fs.rename(tmp, this.file);
    });
    return this.writeQueue;
  }

  async getByPhoneHash(phoneHash: string) {
    return (await this.load()).filter((c) => c.phoneHash === phoneHash);
  }

  async getById(id: string) {
    return (await this.load()).find((c) => c.id === id) ?? null;
  }

  async create(consent: WhatsAppConsent) {
    const rows = await this.load();
    rows.push(consent);
    await this.persist();
    return consent;
  }

  async update(id: string, patch: Partial<WhatsAppConsent>) {
    const rows = await this.load();
    const idx = rows.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, id: rows[idx].id, updatedAt: new Date().toISOString() };
    await this.persist();
    return rows[idx];
  }

  async delete(id: string) {
    const rows = await this.load();
    const idx = rows.findIndex((c) => c.id === id);
    if (idx !== -1) {
      rows.splice(idx, 1);
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

class PgWhatsAppConsentStore implements WhatsAppConsentStore {
  private ready: Promise<void> | null = null;

  private pool(): import("pg").Pool {
    if (!globalThis.__subsumioWhatsAppConsentPool) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as typeof import("pg");
      globalThis.__subsumioWhatsAppConsentPool = new Pool({
        connectionString: AUTH_DB_URL,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ...(process.env.NODE_ENV === "production" ? { ssl: { rejectUnauthorized: true } } : {}),
      });
    }
    return globalThis.__subsumioWhatsAppConsentPool as import("pg").Pool;
  }

  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool()
        .query(
          `
        CREATE TABLE IF NOT EXISTS subsumio_whatsapp_consent (
          id text PRIMARY KEY,
          org_id text NOT NULL,
          subject_type text NOT NULL,
          subject_ref text NOT NULL,
          phone_hash text NOT NULL,
          scopes jsonb NOT NULL DEFAULT '[]',
          opt_in_at timestamptz,
          opt_out_at timestamptz,
          consent_proof jsonb NOT NULL DEFAULT '{}',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_wa_consent_phone ON subsumio_whatsapp_consent (phone_hash);
      `
        )
        .then(() => undefined);
    }
    return this.ready;
  }

  private row(r: Record<string, unknown>): WhatsAppConsent {
    const rawScopes = r.scopes;
    const scopes = Array.isArray(rawScopes)
      ? (rawScopes as OutboundScope[])
      : (JSON.parse(String(rawScopes ?? "[]")) as OutboundScope[]);
    const rawProof = r.consent_proof;
    const consentProof =
      rawProof && typeof rawProof === "object"
        ? (rawProof as Record<string, unknown>)
        : (JSON.parse(String(rawProof ?? "{}")) as Record<string, unknown>);
    return {
      id: String(r.id),
      orgId: String(r.org_id),
      subjectType: String(r.subject_type) as WhatsAppConsent["subjectType"],
      subjectRef: String(r.subject_ref),
      phoneHash: String(r.phone_hash),
      scopes,
      optInAt: r.opt_in_at ? String(r.opt_in_at) : "",
      optOutAt: r.opt_out_at ? String(r.opt_out_at) : null,
      consentProof,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  async getByPhoneHash(phoneHash: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query(
      `SELECT * FROM subsumio_whatsapp_consent WHERE phone_hash = $1`,
      [phoneHash]
    );
    return rows.map((r) => this.row(r));
  }

  async getById(id: string) {
    await this.ensureSchema();
    const { rows } = await this.pool().query(
      `SELECT * FROM subsumio_whatsapp_consent WHERE id = $1`,
      [id]
    );
    return rows[0] ? this.row(rows[0]) : null;
  }

  async create(consent: WhatsAppConsent) {
    await this.ensureSchema();
    await this.pool().query(
      `INSERT INTO subsumio_whatsapp_consent
         (id, org_id, subject_type, subject_ref, phone_hash, scopes, opt_in_at, opt_out_at, consent_proof, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        consent.id,
        consent.orgId,
        consent.subjectType,
        consent.subjectRef,
        consent.phoneHash,
        JSON.stringify(consent.scopes),
        consent.optInAt || null,
        consent.optOutAt,
        JSON.stringify(consent.consentProof),
        consent.createdAt,
        consent.updatedAt,
      ]
    );
    return consent;
  }

  async update(id: string, patch: Partial<WhatsAppConsent>) {
    await this.ensureSchema();
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (patch.scopes !== undefined) {
      sets.push(`scopes = $${i++}`);
      vals.push(JSON.stringify(patch.scopes));
    }
    if (patch.optInAt !== undefined) {
      sets.push(`opt_in_at = $${i++}`);
      vals.push(patch.optInAt || null);
    }
    if (patch.optOutAt !== undefined) {
      sets.push(`opt_out_at = $${i++}`);
      vals.push(patch.optOutAt);
    }
    if (patch.consentProof !== undefined) {
      sets.push(`consent_proof = $${i++}`);
      vals.push(JSON.stringify(patch.consentProof));
    }
    sets.push(`updated_at = now()`);
    if (sets.length === 1) return this.getById(id);
    vals.push(id);
    await this.pool().query(
      `UPDATE subsumio_whatsapp_consent SET ${sets.join(", ")} WHERE id = $${i}`,
      vals
    );
    return this.getById(id);
  }

  async delete(id: string) {
    await this.ensureSchema();
    await this.pool().query(`DELETE FROM subsumio_whatsapp_consent WHERE id = $1`, [id]);
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

declare global {
  var __subsumioWhatsAppConsentPool: InstanceType<typeof import("pg").Pool> | undefined;
  var __subsumioWhatsAppConsentStore: WhatsAppConsentStore | undefined;
}

export function getWhatsAppConsentStore(): WhatsAppConsentStore {
  if (!globalThis.__subsumioWhatsAppConsentStore) {
    const useFile =
      !AUTH_DB_URL ||
      (process.env.NODE_ENV !== "production" &&
        env("SUBSUMIO_ALLOW_FILE_AUTH_IN_PRODUCTION") !== "true");
    globalThis.__subsumioWhatsAppConsentStore = useFile
      ? new FileWhatsAppConsentStore()
      : new PgWhatsAppConsentStore();
  }
  return globalThis.__subsumioWhatsAppConsentStore as WhatsAppConsentStore;
}

/** Test-only: reset the cached singleton so a fresh adapter is created. */
export function __resetWhatsAppConsentStoreForTests(): void {
  globalThis.__subsumioWhatsAppConsentStore = undefined;
}
