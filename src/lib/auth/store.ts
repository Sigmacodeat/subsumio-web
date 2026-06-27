// User store with a swappable adapter. Dev/self-hosted defaults to JSON files.
// Serverless production uses Postgres when SUBSUMIO_AUTH_DATABASE_URL,
// DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL is set.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import { AuthError } from "@/lib/errors";

export type Plan = "free" | "pro" | "team" | "enterprise";

export type KanzleiRole = "admin" | "lawyer" | "assistant" | "client_viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: KanzleiRole;
  plan: Plan;
  locale: "en" | "de";
  /** This user's own referral code (subsum.eu/?ref=CODE). */
  referralCode: string;
  /** Referral code of the user who referred this one, if any. */
  referredBy: string | null;
  /** Brain identifier for multi-tenant provisioning against the Subsumio Engine. */
  brainId: string;
  stripeCustomerId: string | null;
  /** ISO timestamp once the verification link was clicked; null until then. */
  emailVerifiedAt?: string | null;
  /** Org membership: when set, the org's shared brain replaces the personal one. */
  orgId?: string | null;
  /** Industry chosen at signup — drives dashboard personalization (verticals). */
  industry?: string | null;
  /** TOTP secret (Base32), encrypted at rest in production. */
  twoFactorSecret?: string | null;
  /** Whether 2FA is actively enforced for this user. */
  twoFactorEnabled?: boolean;
  /** Pending TOTP secret during setup flow (server-side only, never sent to client). */
  pendingTwoFactorSecret?: string | null;
  /** ISO timestamp when the pending secret expires (typically 10 minutes). */
  pendingTwoFactorExpiresAt?: string | null;
  /** Hashed 2FA backup/recovery codes (SHA-256 hex). Consumed on use. */
  twoFactorBackupCodes?: string[] | null;
  /** Docusign OAuth tokens (server-persisted, encrypt-at-rest in production). */
  docusignAccessToken?: string | null;
  docusignRefreshToken?: string | null;
  docusignTokenExpiresAt?: string | null;
  /** SSO identity link (WorkOS). */
  workosUserId?: string | null;
  ssoProvider?: string | null;
  /** SCIM external ID from IdP directory sync. */
  scimExternalId?: string | null;
  /** ISO timestamp when user was deactivated via SCIM (null = active). Not deleted for audit-trail. */
  deactivatedAt?: string | null;
  /** API keys (server-persisted, encrypt-at-rest in production). */
  openaiKey?: string | null;
  anthropicKey?: string | null;
  zeroEntropyKey?: string | null;
  /** Preferred AI model ID (brain-scoped setting, see model-config.ts). */
  preferredModel?: string | null;
  /** ISO timestamp when the guided onboarding wizard was completed. null = not yet done. */
  onboardingCompletedAt?: string | null;
  createdAt: string;
}

/** A team workspace: members share ONE brain; seats are gated by the owner's plan. */
export interface Org {
  id: string;
  name: string;
  /** The shared brain every member's engine calls scope to. */
  brainId: string;
  ownerId: string;
  createdAt: string;
  /**
   * "eu_only" technically enforces the "Keine US-Cloud, kein US-Modell"
   * marketing claim (src/content/solutions.ts) — every member's model
   * selection is restricted to EU-hosted entries (see
   * src/lib/model-config.ts's isModelAllowedForPolicy). Owner-only setting.
   * undefined = "any" (no restriction, prior behavior for every existing org).
   */
  modelPolicy?: "any" | "eu_only";
}

export interface OrgStore {
  getById(id: string): Promise<Org | null>;
  create(org: Org): Promise<Org>;
  update(id: string, patch: Partial<Org>): Promise<Org | null>;
  delete(id: string): Promise<void>;
  list(): Promise<Org[]>;
}

export interface UserStore {
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  getByReferralCode(code: string): Promise<User | null>;
  getByScimExternalId(externalId: string): Promise<User | null>;
  /** Find a user by their Stripe customer ID — avoids full-table scan in billing webhooks. */
  getByStripeCustomerId(customerId: string): Promise<User | null>;
  /** List users in a specific org — pushes the filter to SQL instead of JS. */
  listByOrg(orgId: string): Promise<User[]>;
  create(user: User): Promise<User>;
  update(id: string, patch: Partial<User>): Promise<User | null>;
  list(): Promise<User[]>;
  /** Count how many users were referred by the given code. */
  countReferrals(code: string): Promise<number>;
}

// --- File adapter -----------------------------------------------------------

import { env } from "@/lib/env";
import { encryptFields, decryptFields } from "@/lib/encryption";

/** Fields that must be encrypted at rest in production. */
export const SENSITIVE_USER_FIELDS = [
  "twoFactorSecret",
  "pendingTwoFactorSecret",
  "docusignAccessToken",
  "docusignRefreshToken",
  "openaiKey",
  "anthropicKey",
  "zeroEntropyKey",
] as const;

/** Encrypt sensitive fields before persisting to storage. */
async function encryptUser(user: User): Promise<User> {
  return (await encryptFields(user as unknown as Record<string, unknown>, [
    ...SENSITIVE_USER_FIELDS,
  ])) as unknown as User;
}

/** Decrypt sensitive fields after loading from storage. */
async function decryptUser(user: User): Promise<User> {
  return (await decryptFields(user as unknown as Record<string, unknown>, [
    ...SENSITIVE_USER_FIELDS,
  ])) as unknown as User;
}

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

class FileUserStore implements UserStore {
  private cache: User[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private async load(): Promise<User[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(USERS_FILE, "utf8");
      const users = JSON.parse(raw) as User[];
      // Decrypt sensitive fields on load
      this.cache = await Promise.all(users.map(decryptUser));
    } catch (err) {
      console.error(
        "[auth] failed to load users file:",
        err instanceof Error ? err.message : String(err)
      );
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const users = this.cache ?? [];
    // Encrypt sensitive fields before writing to disk
    const encrypted = await Promise.all(users.map(encryptUser));
    // serialize writes to avoid interleaving
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${USERS_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(encrypted, null, 2), "utf8");
      await fs.rename(tmp, USERS_FILE);
    });
    return this.writeQueue;
  }

  async getById(id: string) {
    return (await this.load()).find((u) => u.id === id) ?? null;
  }
  async getByEmail(email: string) {
    const norm = email.trim().toLowerCase();
    return (await this.load()).find((u) => u.email === norm) ?? null;
  }
  async getByReferralCode(code: string) {
    return (await this.load()).find((u) => u.referralCode === code) ?? null;
  }
  async getByScimExternalId(externalId: string) {
    return (await this.load()).find((u) => u.scimExternalId === externalId) ?? null;
  }
  async getByStripeCustomerId(customerId: string) {
    return (await this.load()).find((u) => u.stripeCustomerId === customerId) ?? null;
  }
  async listByOrg(orgId: string) {
    return (await this.load()).filter((u) => u.orgId === orgId);
  }
  async create(user: User) {
    const users = await this.load();
    users.push(user);
    await this.persist();
    return user;
  }
  async update(id: string, patch: Partial<User>) {
    const users = await this.load();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...patch, id: users[idx].id };
    await this.persist();
    return users[idx];
  }
  async list() {
    return [...(await this.load())];
  }
  async countReferrals(code: string) {
    return (await this.load()).filter((u) => u.referredBy === code).length;
  }
}

let store: UserStore | null = null;
export function getStore(): UserStore {
  if (!store) store = createUserStore();
  return store;
}

// --- Org adapter (same file-based pattern as users) --------------------------

const ORGS_FILE = path.join(DATA_DIR, "orgs.json");

class FileOrgStore implements OrgStore {
  private cache: Org[] | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  private async load(): Promise<Org[]> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(ORGS_FILE, "utf8")) as Org[];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(): Promise<void> {
    const orgs = this.cache ?? [];
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tmp = `${ORGS_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(orgs, null, 2), "utf8");
      await fs.rename(tmp, ORGS_FILE);
    });
    return this.writeQueue;
  }

  async getById(id: string) {
    return (await this.load()).find((o) => o.id === id) ?? null;
  }
  async create(org: Org) {
    const orgs = await this.load();
    orgs.push(org);
    await this.persist();
    return org;
  }
  async update(id: string, patch: Partial<Org>) {
    const orgs = await this.load();
    const idx = orgs.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    orgs[idx] = { ...orgs[idx], ...patch, id: orgs[idx].id };
    await this.persist();
    return orgs[idx];
  }
  async delete(id: string) {
    const orgs = await this.load();
    const idx = orgs.findIndex((o) => o.id === id);
    if (idx !== -1) {
      orgs.splice(idx, 1);
      await this.persist();
    }
  }
  async list() {
    return [...(await this.load())];
  }
}

let orgStore: OrgStore | null = null;
export function getOrgStore(): OrgStore {
  if (!orgStore) orgStore = createOrgStore();
  return orgStore;
}

// --- Postgres adapter -------------------------------------------------------

const AUTH_DB_URL =
  env("SUBSUMIO_AUTH_DATABASE_URL") ||
  env("DATABASE_URL") ||
  env("POSTGRES_URL") ||
  env("POSTGRES_PRISMA_URL");

declare global {
  var __subsumioAuthPool: Pool | undefined;
}

function authPool(): Pool {
  if (!AUTH_DB_URL) {
    throw new AuthError("A Postgres URL is required for the production auth store.", {
      code: "AUTH_DB_URL_MISSING",
    });
  }
  if (!globalThis.__subsumioAuthPool) {
    const config: PoolConfig = {
      connectionString: AUTH_DB_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };
    // Only disable cert verification for explicitly self-signed setups.
    // Never blanket-disable in production — that's a MitM vector.
    if (AUTH_DB_URL.includes("sslmode=disable")) {
      // Explicit opt-out: internal Docker Compose Postgres has no TLS.
      config.ssl = false;
    } else if (AUTH_DB_URL.includes("sslmode=require") && AUTH_DB_URL.includes("sslrootcert=")) {
      config.ssl = { rejectUnauthorized: true };
    } else if (AUTH_DB_URL.includes("sslmode=require")) {
      config.ssl = { rejectUnauthorized: false };
    } else if (env("NODE_ENV") === "production") {
      config.ssl = { rejectUnauthorized: true };
    }
    globalThis.__subsumioAuthPool = new Pool(config);
  }
  return globalThis.__subsumioAuthPool;
}

let schemaReady: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const pool = authPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS subsumio_users (
          id text PRIMARY KEY,
          email text NOT NULL UNIQUE,
          referral_code text NOT NULL UNIQUE,
          password_hash text NOT NULL,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS subsumio_orgs (
          id text PRIMARY KEY,
          owner_id text NOT NULL,
          data jsonb NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await pool.query(
        "CREATE INDEX IF NOT EXISTS subsumio_users_org_id_idx ON subsumio_users ((data->>'orgId'))"
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS subsumio_users_stripe_customer_id_idx ON subsumio_users ((data->>'stripeCustomerId'))"
      );
      await pool.query(
        "CREATE INDEX IF NOT EXISTS subsumio_orgs_owner_id_idx ON subsumio_orgs (owner_id)"
      );
    })();
  }
  return schemaReady;
}

function rowToUser(row: { data: User | string }): User {
  return typeof row.data === "string" ? (JSON.parse(row.data) as User) : row.data;
}

/** Decrypt sensitive fields after loading from a DB row. */
async function rowToUserDecrypted(row: { data: User | string }): Promise<User> {
  return decryptUser(rowToUser(row));
}

function rowToOrg(row: { data: Org | string }): Org {
  return typeof row.data === "string" ? (JSON.parse(row.data) as Org) : row.data;
}

class PostgresUserStore implements UserStore {
  private async ready() {
    await ensureSchema();
    return authPool();
  }

  async getById(id: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: User }>(
      "SELECT data FROM subsumio_users WHERE id = $1",
      [id]
    );
    return rows[0] ? await rowToUserDecrypted(rows[0]) : null;
  }

  async getByEmail(email: string) {
    const pool = await this.ready();
    const norm = email.trim().toLowerCase();
    const { rows } = await pool.query<{ data: User }>(
      "SELECT data FROM subsumio_users WHERE email = $1",
      [norm]
    );
    return rows[0] ? await rowToUserDecrypted(rows[0]) : null;
  }

  async getByReferralCode(code: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: User }>(
      "SELECT data FROM subsumio_users WHERE referral_code = $1",
      [code]
    );
    return rows[0] ? await rowToUserDecrypted(rows[0]) : null;
  }

  async getByScimExternalId(externalId: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: User }>(
      "SELECT data FROM subsumio_users WHERE data->>'scimExternalId' = $1",
      [externalId]
    );
    return rows[0] ? await rowToUserDecrypted(rows[0]) : null;
  }

  async create(user: User) {
    const pool = await this.ready();
    const normalized: User = { ...user, email: user.email.trim().toLowerCase() };
    const encrypted = await encryptUser(normalized);
    await pool.query(
      `INSERT INTO subsumio_users (id, email, referral_code, password_hash, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, now())`,
      [
        encrypted.id,
        encrypted.email,
        encrypted.referralCode,
        encrypted.passwordHash,
        JSON.stringify(encrypted),
        encrypted.createdAt,
      ]
    );
    return normalized;
  }

  async update(id: string, patch: Partial<User>) {
    const pool = await this.ready();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ data: User }>(
        "SELECT data FROM subsumio_users WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const current = await rowToUserDecrypted(rows[0]);
      const next: User = {
        ...current,
        ...patch,
        id: current.id,
        email: (patch.email ?? current.email).trim().toLowerCase(),
      };
      const encrypted = await encryptUser(next);
      await client.query(
        `UPDATE subsumio_users
            SET email = $2,
                referral_code = $3,
                password_hash = $4,
                data = $5::jsonb,
                updated_at = now()
          WHERE id = $1`,
        [
          id,
          encrypted.email,
          encrypted.referralCode,
          encrypted.passwordHash,
          JSON.stringify(encrypted),
        ]
      );
      await client.query("COMMIT");
      return next;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async list() {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: User }>(
      "SELECT data FROM subsumio_users ORDER BY created_at ASC"
    );
    return Promise.all(rows.map(rowToUserDecrypted));
  }
  async getByStripeCustomerId(customerId: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: User }>(
      "SELECT data FROM subsumio_users WHERE data->>'stripeCustomerId' = $1 LIMIT 1",
      [customerId]
    );
    return rows[0] ? await rowToUserDecrypted(rows[0]) : null;
  }
  async listByOrg(orgId: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: User }>(
      "SELECT data FROM subsumio_users WHERE data->>'orgId' = $1 ORDER BY created_at ASC",
      [orgId]
    );
    return Promise.all(rows.map(rowToUserDecrypted));
  }
  async countReferrals(code: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM subsumio_users WHERE data->>'referredBy' = $1",
      [code]
    );
    return parseInt(rows[0]?.count ?? "0", 10);
  }
}

class PostgresOrgStore implements OrgStore {
  private async ready() {
    await ensureSchema();
    return authPool();
  }

  async getById(id: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: Org }>(
      "SELECT data FROM subsumio_orgs WHERE id = $1",
      [id]
    );
    return rows[0] ? rowToOrg(rows[0]) : null;
  }

  async create(org: Org) {
    const pool = await this.ready();
    await pool.query(
      `INSERT INTO subsumio_orgs (id, owner_id, data, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, now())`,
      [org.id, org.ownerId, JSON.stringify(org), org.createdAt]
    );
    return org;
  }

  async update(id: string, patch: Partial<Org>) {
    const pool = await this.ready();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ data: Org }>(
        "SELECT data FROM subsumio_orgs WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (!rows[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const current = rowToOrg(rows[0]);
      const next: Org = { ...current, ...patch, id: current.id };
      await client.query(
        `UPDATE subsumio_orgs
            SET owner_id = $2,
                data = $3::jsonb,
                updated_at = now()
          WHERE id = $1`,
        [id, next.ownerId, JSON.stringify(next)]
      );
      await client.query("COMMIT");
      return next;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(id: string) {
    const pool = await this.ready();
    await pool.query("DELETE FROM subsumio_orgs WHERE id = $1", [id]);
  }

  async list() {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: Org }>(
      "SELECT data FROM subsumio_orgs ORDER BY created_at ASC"
    );
    return rows.map(rowToOrg);
  }
}

/**
 * Shared Postgres pool for other serverless-safe stores (usage metering,
 * …). Null when no database is configured (file-based dev mode).
 */
export function getSharedPgPool(): Pool | null {
  if (!AUTH_DB_URL) return null;
  return authPool();
}

function createUserStore(): UserStore {
  if (AUTH_DB_URL) return new PostgresUserStore();
  if (env("NODE_ENV") === "production") {
    throw new AuthError(
      "Production auth requires SUBSUMIO_AUTH_DATABASE_URL, DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL.",
      { code: "AUTH_DB_URL_MISSING" }
    );
  }
  return new FileUserStore();
}

function createOrgStore(): OrgStore {
  if (AUTH_DB_URL) return new PostgresOrgStore();
  if (env("NODE_ENV") === "production") {
    throw new AuthError(
      "Production org storage requires SUBSUMIO_AUTH_DATABASE_URL, DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL.",
      { code: "AUTH_DB_URL_MISSING" }
    );
  }
  return new FileOrgStore();
}

export function buildNewOrg(opts: { name: string; ownerId: string }): Org {
  return {
    id: randomUUID(),
    name: opts.name.trim(),
    brainId: `org_${randomUUID().slice(0, 8)}`,
    ownerId: opts.ownerId,
    createdAt: new Date().toISOString(),
  };
}

// --- Helpers ----------------------------------------------------------------

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars

export function generateReferralCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export async function buildNewUser(opts: {
  email: string;
  name: string;
  passwordHash: string;
  locale?: "en" | "de";
  referredBy?: string | null;
  industry?: string | null;
}): Promise<User> {
  const s = getStore();
  // first user ever becomes admin — sensible bootstrap for a fresh install
  const isFirst = (await s.list()).length === 0;
  let referralCode = generateReferralCode();
  // collision check (8 chars over 31-alphabet makes this near-impossible, but cheap to verify)
  while (await s.getByReferralCode(referralCode)) referralCode = generateReferralCode();
  return {
    id: randomUUID(),
    email: opts.email.trim().toLowerCase(),
    name: opts.name.trim(),
    passwordHash: opts.passwordHash,
    role: isFirst ? "admin" : "lawyer",
    plan: "free",
    locale: opts.locale ?? "en",
    referralCode,
    referredBy: opts.referredBy ?? null,
    brainId: `brain_${randomUUID().slice(0, 8)}`,
    stripeCustomerId: null,
    emailVerifiedAt: null,
    orgId: null,
    industry: opts.industry ?? null,
    onboardingCompletedAt: null,
    createdAt: new Date().toISOString(),
  };
}

/** Public projection — never leaks secrets (password hash, 2FA secrets, OAuth tokens, backup codes, API keys). */
export type PublicUser = Omit<
  User,
  | "passwordHash"
  | "twoFactorSecret"
  | "pendingTwoFactorSecret"
  | "twoFactorBackupCodes"
  | "docusignAccessToken"
  | "docusignRefreshToken"
  | "docusignTokenExpiresAt"
  | "openaiKey"
  | "anthropicKey"
  | "zeroEntropyKey"
>;
export function toPublic(user: User): PublicUser {
  const {
    passwordHash: _ph,
    twoFactorSecret: _tfs,
    pendingTwoFactorSecret: _ptfs,
    twoFactorBackupCodes: _tbc,
    docusignAccessToken: _dat,
    docusignRefreshToken: _drt,
    docusignTokenExpiresAt: _dte,
    openaiKey: _oak,
    anthropicKey: _aak,
    zeroEntropyKey: _zek,
    ...pub
  } = user;
  void _ph;
  void _tfs;
  void _ptfs;
  void _tbc;
  void _dat;
  void _drt;
  void _dte;
  void _oak;
  void _aak;
  void _zek;
  return pub;
}
