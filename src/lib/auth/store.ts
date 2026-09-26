// User store with a swappable adapter. Dev/self-hosted defaults to JSON files.
// Serverless production uses Postgres when SUBSUMIO_AUTH_DATABASE_URL,
// DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL is set.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool, type PoolConfig } from "pg";
import { AuthError } from "@/lib/errors";
import type { OnboardingProgress } from "@/lib/types";
import { trialEndsAtFrom } from "@/lib/billing/trial";
import type { LegalAcceptance } from "@/lib/auth/legal-acceptance";

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
  /** This user's own referral code (subsum.io/?ref=CODE). */
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
  /** Jurisdiction chosen at onboarding — scopes law corpus search to the attorney's country.
   *  "DE" → DE_LAW_SOURCES_ALL, "AT" → AT_LAW_SOURCES_ALL,
   *  "CH" → CH_LAW_SOURCES_ALL (Statutes + eigene Judikatur-Source + law-eu).
   *  Prevents cross-jurisdiction contamination (e.g. AT attorney getting DE StPO results). */
  jurisdiction?: "DE" | "AT" | "CH" | null;
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
  /** Last accepted TOTP time step (unix/30) — a code is never accepted twice. */
  twoFactorLastStep?: number | null;
  /** Docusign OAuth tokens (server-persisted, encrypt-at-rest in production). */
  docusignAccessToken?: string | null;
  docusignRefreshToken?: string | null;
  docusignTokenExpiresAt?: string | null;
  /** Microsoft 365 delegated OAuth (per-user Kalender, WP-4.19). */
  ms365AccessToken?: string | null;
  ms365RefreshToken?: string | null;
  ms365TokenExpiresAt?: string | null;
  /** UPN/E-Mail des verbundenen M365-Accounts (für die UI, nicht sensitiv). */
  ms365UserEmail?: string | null;
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
  /** Per-step setup progress for the dashboard guide / checklist. */
  onboardingProgress?: OnboardingProgress;
  /**
   * "Kanzlei-Gehirn lernt mit" for a lawyer working alone (no org). The org's
   * value applies to team members instead. undefined = on (default).
   * See src/lib/brain-learning.ts.
   */
  brainLearning?: boolean;
  /** End of the free self-service trial (ISO). Resolve limits through
   *  `effectivePlan` in src/lib/billing/trial.ts, never `plan` alone. */
  trialEndsAt?: string | null;
  /** Set when the "your trial ends soon" mail went out, so it goes out once. */
  trialReminderSentAt?: string | null;
  /** SHA-256 of the secret in the personal calendar feed URL (never the secret
   *  itself). Set while a subscription link exists, null once revoked. */
  calendarFeedTokenHash?: string | null;
  /** When the current calendar feed link was created (ISO). */
  calendarFeedCreatedAt?: string | null;
  /** Last time a calendar client fetched the feed (ISO). */
  calendarFeedLastUsedAt?: string | null;
  /** SHA-256 of the secret of the separate WebDAV/CalDAV access token
   *  (read-only drive + deadlines via scripts/dav-server.ts). Unlike the
   *  calendar link it opens documents; see src/lib/feed-auth.ts. */
  davTokenHash?: string | null;
  /** When the current DAV access token was created (ISO). */
  davTokenCreatedAt?: string | null;
  /** Last time a DAV client used the token (ISO). */
  davTokenLastUsedAt?: string | null;
  /** Current acceptance of AGB / Datenschutzerklärung / AVV (versions + time).
   *  See src/lib/auth/legal-acceptance.ts. */
  legalAcceptance?: LegalAcceptance | null;
  /** Every acceptance ever recorded for this account (append-only). */
  legalAcceptanceHistory?: LegalAcceptance[] | null;
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
  /**
   * Firm-wide "Kanzlei-Gehirn lernt mit". false = the firm's brain is not
   * extended automatically (no derived facts/takes, no auto-captured
   * assistant memories, no auto-playbook updates). undefined = on (default).
   * Admin-only setting, audit-logged; see src/lib/brain-learning.ts.
   */
  brainLearning?: boolean;
  /** The user who holds the subscription and whose credits the team uses.
   *  Defaults to ownerId; stays put when ownership is handed over. */
  billingUserId?: string | null;
  /** Set by the platform operator; every member is signed out and blocked. */
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  suspendedBy?: string | null;
  /** Members the suspension deactivated — reactivation restores exactly these. */
  suspendedMemberIds?: string[] | null;
  /**
   * The WorkOS organization (org_…) that is this firm's SSO tenant. When set,
   * a WorkOS login only signs into an existing member account if WorkOS
   * authenticated the user within THIS organization (see
   * src/lib/auth/sso-account-link.ts). Set by the platform operator when the
   * firm's SSO connection is configured in WorkOS. null/undefined = the firm
   * has no SSO tenant: WorkOS can only sign into accounts that were created
   * through, and are already bound to, that exact WorkOS identity.
   */
  workosOrganizationId?: string | null;
  /**
   * Per-email cutoff for org invites: when a member is removed (or leaves),
   * invites minted before this timestamp must not be usable to (re-)join —
   * invite tokens are stateless, so removal alone would not stop a still-
   * valid link from re-entering the firm. A fresh invite always works: its
   * iat is after the cutoff. Key: lowercase email, value: ISO timestamp.
   */
  inviteRevokedAt?: Record<string, string>;
}

/**
 * Returns the inviteRevokedAt map with `email` cut off at `now`, pruning
 * entries older than the invite token TTL (7 days): once every outstanding
 * token has expired anyway, the cutoff is dead weight and would grow the
 * org record unboundedly over the firm's lifetime.
 */
export function withInviteRevoked(
  existing: Record<string, string> | undefined,
  email: string,
  now: Date = new Date()
): Record<string, string> {
  const ttlMs = 7 * 24 * 3600 * 1000; // INVITE_TOKEN_TTL_SECONDS — kept local to keep store.ts dependency-free
  const floor = now.getTime() - ttlMs;
  const next: Record<string, string> = {};
  for (const [key, ts] of Object.entries(existing ?? {})) {
    const t = Date.parse(ts);
    if (Number.isFinite(t) && t > floor) next[key] = ts;
  }
  next[email.trim().toLowerCase()] = now.toISOString();
  return next;
}

export interface OrgStore {
  getById(id: string): Promise<Org | null>;
  /** The firm whose shared brain this is, if any. */
  getByBrainId(brainId: string): Promise<Org | null>;
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

import { logger } from "@/lib/logger";
const log = logger("lib/auth/store");

/** Fields that must be encrypted at rest in production. */
export const SENSITIVE_USER_FIELDS = [
  "twoFactorSecret",
  "pendingTwoFactorSecret",
  "docusignAccessToken",
  "docusignRefreshToken",
  "ms365AccessToken",
  "ms365RefreshToken",
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
      log.error(
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
  async getByBrainId(brainId: string) {
    return (await this.load()).find((o) => o.brainId === brainId) ?? null;
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
    // Serves every request's session/revocation check, logins, audit rows and
    // rate limits. Keyed locks use a pool of their own (src/lib/keyed-lock.ts).
    const max = parseInt(env("SUBSUMIO_AUTH_DB_POOL_MAX") ?? "", 10);
    const config: PoolConfig = {
      connectionString: AUTH_DB_URL,
      max: Number.isFinite(max) && max > 0 ? max : 10,
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

  async getByBrainId(brainId: string) {
    const pool = await this.ready();
    const { rows } = await pool.query<{ data: Org }>(
      "SELECT data FROM subsumio_orgs WHERE data->>'brainId' = $1 ORDER BY created_at ASC LIMIT 1",
      [brainId]
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

export function buildNewOrg(opts: { name: string; ownerId: string; brainId?: string }): Org {
  return {
    id: randomUUID(),
    name: opts.name.trim(),
    // The founder's subscription and credits carry the team.
    billingUserId: opts.ownerId,
    // A founder who already worked alone keeps their data: the firm adopts the
    // founder's brain instead of starting on an empty one.
    brainId: opts.brainId?.trim() || `org_${randomUUID().slice(0, 8)}`,
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
  jurisdiction?: "DE" | "AT" | "CH" | null;
  /** Self-service signup: start the free trial. SSO/SCIM accounts join a firm
   *  that already has a contract and get none. */
  startTrial?: boolean;
}): Promise<User> {
  const s = getStore();
  let referralCode = generateReferralCode();
  // collision check (8 chars over 31-alphabet makes this near-impossible, but cheap to verify)
  while (await s.getByReferralCode(referralCode)) referralCode = generateReferralCode();
  return {
    id: randomUUID(),
    email: opts.email.trim().toLowerCase(),
    name: opts.name.trim(),
    passwordHash: opts.passwordHash,
    // Every signup creates its own firm (own brainId below), so the person who
    // signs up administers it: team, security, mailbox, export. Platform-wide
    // functions are NOT behind this role — they require a platform operator
    // (src/lib/auth/platform-operator.ts). Members who join a firm via invite
    // are downgraded on join (src/app/api/org/join).
    role: "admin",
    plan: "free",
    locale: opts.locale ?? "en",
    referralCode,
    referredBy: opts.referredBy ?? null,
    brainId: `brain_${randomUUID().slice(0, 8)}`,
    stripeCustomerId: null,
    emailVerifiedAt: null,
    orgId: null,
    industry: opts.industry ?? null,
    jurisdiction: opts.jurisdiction ?? null,
    onboardingCompletedAt: null,
    onboardingProgress: {
      firm: false,
      firstCase: false,
      firstDeadline: false,
      teamInvited: false,
      firstQuery: false,
    },
    trialEndsAt: opts.startTrial ? trialEndsAtFrom() : null,
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
  | "ms365AccessToken"
  | "ms365RefreshToken"
  | "ms365TokenExpiresAt"
  | "openaiKey"
  | "anthropicKey"
  | "zeroEntropyKey"
  | "calendarFeedTokenHash"
  | "davTokenHash"
  | "legalAcceptanceHistory"
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
    ms365AccessToken: _mat,
    ms365RefreshToken: _mrt,
    ms365TokenExpiresAt: _mte,
    openaiKey: _oak,
    anthropicKey: _aak,
    zeroEntropyKey: _zek,
    // Feed/DAV credential hashes never leave the server.
    calendarFeedTokenHash: _cfh,
    davTokenHash: _dth,
    // Acceptance history stays server-side; the current record is public.
    legalAcceptanceHistory: _lah,
    ...pub
  } = user;
  void _ph;
  void _tfs;
  void _ptfs;
  void _tbc;
  void _dat;
  void _drt;
  void _dte;
  void _mat;
  void _mrt;
  void _mte;
  void _oak;
  void _aak;
  void _zek;
  void _cfh;
  void _dth;
  void _lah;
  return pub;
}

const DEFAULT_ONBOARDING_PROGRESS: OnboardingProgress = {
  firm: false,
  firstCase: false,
  firstDeadline: false,
  teamInvited: false,
  firstQuery: false,
};

export async function markOnboardingProgress(
  userId: string,
  patch: Partial<OnboardingProgress>
): Promise<void> {
  const store = getStore();
  const user = await store.getById(userId);
  if (!user) return;
  const next: OnboardingProgress = {
    ...DEFAULT_ONBOARDING_PROGRESS,
    ...user.onboardingProgress,
    ...patch,
  };
  await store.update(userId, { onboardingProgress: next });
}
