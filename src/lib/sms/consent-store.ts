/**
 * SMS Consent Store — File-based (dev) / Postgres (prod).
 *
 * WP-8.53: SMS is a separate channel — a WhatsApp opt-in must NOT authorize
 * SMS sends (different legal basis under DSGVO/TKG). This store mirrors the
 * WhatsApp consent model but persists to its own table/file.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type { OutboundScope } from "@/lib/whatsapp/outbound-gate";

export interface SmsConsent {
  id: string;
  orgId: string;
  subjectType: "lawyer" | "client";
  subjectRef: string;
  phoneHash: string;
  scopes: OutboundScope[];
  optInAt: string;
  optOutAt: string | null;
  consentProof: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function isSmsConsentActive(c: SmsConsent): boolean {
  return !!c.optInAt && !c.optOutAt;
}

/**
 * Consent is recorded per firm: several firms share one instance, and a
 * firm may only rely on (or change) the opt-ins it recorded itself. A record
 * belongs to the firm when its `orgId` is one of the firm's tenant keys —
 * the firm's brain id, or its organisation id (records written by team
 * members carry the organisation id).
 */
export function smsTenantKeys(brainId: string, orgId?: string | null): string[] {
  return [...new Set([brainId, orgId ?? ""].map((k) => k.trim()).filter(Boolean))];
}

export interface SmsConsentStore {
  /** Consents for `phoneHash` recorded by the firm identified by `tenantKeys`. */
  getByPhoneHash(tenantKeys: string[], phoneHash: string): Promise<SmsConsent[]>;
  create(consent: SmsConsent): Promise<SmsConsent>;
  update(id: string, patch: Partial<SmsConsent>): Promise<SmsConsent | null>;
}

export async function hasActiveSmsConsent(
  store: SmsConsentStore,
  tenantKeys: string[],
  phoneHash: string,
  scope: OutboundScope
): Promise<boolean> {
  const rows = await store.getByPhoneHash(tenantKeys, phoneHash);
  return rows.some((c) => isSmsConsentActive(c) && c.scopes.includes(scope));
}

// ── File adapter (dev / self-hosted) ─────────────────────────────────────────

function dataDir(): string {
  return env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
}

class FileSmsConsentStore implements SmsConsentStore {
  private cache: SmsConsent[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly file = path.join(dataDir(), "sms-consent.json");

  private async load(): Promise<SmsConsent[]> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as SmsConsent[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const rows = this.cache ?? [];
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(dataDir(), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
      await fs.rename(tmp, this.file);
    });
    return this.writeQueue;
  }

  async getByPhoneHash(tenantKeys: string[], phoneHash: string) {
    if (tenantKeys.length === 0) return [];
    return (await this.load()).filter(
      (c) => c.phoneHash === phoneHash && tenantKeys.includes(c.orgId)
    );
  }
  async create(consent: SmsConsent) {
    (await this.load()).push(consent);
    await this.persist();
    return consent;
  }
  async update(id: string, patch: Partial<SmsConsent>) {
    const rows = await this.load();
    const idx = rows.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, id, updatedAt: new Date().toISOString() };
    await this.persist();
    return rows[idx];
  }
}

// ── Postgres adapter (prod) ──────────────────────────────────────────────────

const AUTH_DB_URL =
  env("SUBSUMIO_AUTH_DATABASE_URL") ||
  env("DATABASE_URL") ||
  env("POSTGRES_URL") ||
  env("POSTGRES_PRISMA_URL");

class PgSmsConsentStore implements SmsConsentStore {
  private ready: Promise<void> | null = null;

  private pool(): import("pg").Pool {
    if (!globalThis.__subsumioSmsConsentPool) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as typeof import("pg");
      globalThis.__subsumioSmsConsentPool = new Pool({
        connectionString: AUTH_DB_URL,
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
        ...(process.env.NODE_ENV === "production" ? { ssl: { rejectUnauthorized: true } } : {}),
      });
    }
    return globalThis.__subsumioSmsConsentPool;
  }

  private ensureSchema(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool()
        .query(
          `
        CREATE TABLE IF NOT EXISTS subsumio_sms_consent (
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
        CREATE INDEX IF NOT EXISTS idx_sms_consent_phone ON subsumio_sms_consent (phone_hash);
        CREATE INDEX IF NOT EXISTS idx_sms_consent_org_phone
          ON subsumio_sms_consent (org_id, phone_hash);
      `
        )
        .then(() => undefined);
    }
    return this.ready;
  }

  private row(r: Record<string, unknown>): SmsConsent {
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
      subjectType: String(r.subject_type) as SmsConsent["subjectType"],
      subjectRef: String(r.subject_ref),
      phoneHash: String(r.phone_hash),
      scopes,
      optInAt: r.opt_in_at ? new Date(String(r.opt_in_at)).toISOString() : "",
      optOutAt: r.opt_out_at ? new Date(String(r.opt_out_at)).toISOString() : null,
      consentProof,
      createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : "",
      updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : "",
    };
  }

  async getByPhoneHash(tenantKeys: string[], phoneHash: string) {
    if (tenantKeys.length === 0) return [];
    await this.ensureSchema();
    const res = await this.pool().query(
      `SELECT * FROM subsumio_sms_consent WHERE org_id = ANY($1::text[]) AND phone_hash = $2`,
      [tenantKeys, phoneHash]
    );
    return res.rows.map((r: Record<string, unknown>) => this.row(r));
  }

  async create(consent: SmsConsent) {
    await this.ensureSchema();
    await this.pool().query(
      `INSERT INTO subsumio_sms_consent
        (id, org_id, subject_type, subject_ref, phone_hash, scopes, opt_in_at, opt_out_at, consent_proof)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        consent.id,
        consent.orgId,
        consent.subjectType,
        consent.subjectRef,
        consent.phoneHash,
        JSON.stringify(consent.scopes),
        consent.optInAt,
        consent.optOutAt,
        JSON.stringify(consent.consentProof),
      ]
    );
    return consent;
  }

  async update(id: string, patch: Partial<SmsConsent>) {
    await this.ensureSchema();
    const cur = await this.pool().query(`SELECT * FROM subsumio_sms_consent WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return null;
    const merged = { ...this.row(cur.rows[0]), ...patch, id, updatedAt: new Date().toISOString() };
    await this.pool().query(
      `UPDATE subsumio_sms_consent SET
        scopes=$2, opt_in_at=$3, opt_out_at=$4, consent_proof=$5, updated_at=now()
       WHERE id=$1`,
      [
        id,
        JSON.stringify(merged.scopes),
        merged.optInAt,
        merged.optOutAt,
        JSON.stringify(merged.consentProof),
      ]
    );
    return merged;
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

declare global {
  var __subsumioSmsConsentPool: import("pg").Pool | undefined;
  var __subsumioSmsConsentStore: SmsConsentStore | undefined;
}

export function getSmsConsentStore(): SmsConsentStore {
  if (!globalThis.__subsumioSmsConsentStore) {
    const useFile =
      !AUTH_DB_URL ||
      (process.env.NODE_ENV !== "production" &&
        env("SUBSUMIO_ALLOW_FILE_AUTH_IN_PRODUCTION") !== "true");
    globalThis.__subsumioSmsConsentStore = useFile
      ? new FileSmsConsentStore()
      : new PgSmsConsentStore();
  }
  return globalThis.__subsumioSmsConsentStore;
}

export function __resetSmsConsentStoreForTests(): void {
  globalThis.__subsumioSmsConsentStore = undefined;
}
