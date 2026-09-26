/**
 * Shared utilities for cron route handlers — eliminates duplicated
 * EnginePage type, fetchPages helper, recipientsByBrain mapping,
 * and alreadyNotifiedToday dedup pattern across all cron routes.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getStore, getOrgStore, getSharedPgPool, type User } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { billingUserOf } from "@/lib/billing/billing-account";
import { effectivePlan } from "@/lib/billing/trial";
import { listEnginePages } from "@/lib/engine-pages";
import { matterAccessLevel, type MatterPermissions } from "@/lib/matter-access";

/**
 * Map an async worker over items with a bounded concurrency (default 8), never
 * rejecting: each result is settled independently. Used by cron routes that fan
 * out per-brain work — a sequential for-loop over 100 tenants, each with its own
 * timeout, can blow past the cron's maxDuration if a handful of engines are
 * slow. Bounded parallelism keeps the wall-clock low without stampeding the
 * engine. Order is preserved.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 8
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  async function runner(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => runner()));
  return results;
}

export interface EnginePage {
  slug: string;
  title: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
  updated_at?: string;
  created_at?: string;
}

/**
 * Up to `limit` pages of a type for a tenant, read in batches of 100, without
 * deleted records unless asked for. See listEnginePages.
 */
export async function fetchPages(
  brainId: string,
  type: string,
  limit: number,
  opts: { includeTombstoned?: boolean } = {}
): Promise<EnginePage[]> {
  return listEnginePages(engineHeadersForBrain(brainId), type, limit, opts);
}

/**
 * Upper bound for a "read every page of a type" listing — a safety stop, not
 * a working limit (one firm with this many deadlines is far beyond any real
 * workload; the engine would page through it in 100-row batches).
 */
export const CRON_FULL_READ_CAP = 100_000;

/**
 * EVERY page of a type for a tenant (up to CRON_FULL_READ_CAP), read in
 * batches of 100. STRICT: a failed batch throws instead of returning a
 * partial list — for the Fristen crons, where a silently truncated read means
 * a deadline that is never reminded about.
 */
export async function fetchAllPagesStrict(brainId: string, type: string): Promise<EnginePage[]> {
  return listEnginePages(engineHeadersForBrain(brainId), type, CRON_FULL_READ_CAP, {
    strict: true,
  });
}

/**
 * The fictional demo matter seeded for every new firm (every page carries
 * `demo: true`) stays visible in the dashboard, but must never trigger
 * reminders, escalations or briefings.
 */
export function excludeDemoPages<T extends { frontmatter?: Record<string, unknown> | null }>(
  pages: T[]
): T[] {
  return pages.filter((p) => p.frontmatter?.demo !== true);
}

/**
 * Fetch pages of multiple types in parallel. Returns a map keyed by type.
 * Each type fetch is independent — a failure for one type returns [] for that key.
 */
export async function batchFetchPages(
  brainId: string,
  types: string[],
  limit: number
): Promise<Record<string, EnginePage[]>> {
  const entries = await Promise.all(
    types.map(async (type) => [type, await fetchPages(brainId, type, limit)] as const)
  );
  return Object.fromEntries(entries);
}

/** brainId → firm id for every firm's shared brain. */
async function firmBrainOwners(): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  for (const org of await getOrgStore().list()) owners.set(org.brainId, org.id);
  return owners;
}

/**
 * Build a brainId → User[] mapping from the user store.
 * Org members share the org's brain. Used by all cron routes.
 */
export async function getRecipientsByBrain(): Promise<Map<string, User[]>> {
  const users = await getStore().list();
  const orgStore = getOrgStore();
  const orgCache = new Map<string, string>();
  const firmBrains = await firmBrainOwners();
  const recipientsByBrain = new Map<string, User[]>();
  for (const user of users) {
    let brainId = user.brainId;
    let viaFirm = false;
    if (user.orgId) {
      let cachedBrainId = orgCache.get(user.orgId);
      if (!cachedBrainId) {
        const org = await orgStore.getById(user.orgId);
        cachedBrainId = org?.brainId;
        if (cachedBrainId) orgCache.set(user.orgId, cachedBrainId);
      }
      if (cachedBrainId) {
        brainId = cachedBrainId;
        viaFirm = true;
      }
    }
    // Someone who left a firm is not a recipient of its brain (auth/firm-brain.ts).
    if (!viaFirm && firmBrains.has(brainId)) continue;
    const list = recipientsByBrain.get(brainId) ?? [];
    list.push(user);
    recipientsByBrain.set(brainId, list);
  }
  return recipientsByBrain;
}

/**
 * Brains whose firm currently pays or is on its free trial, with their active
 * members. For jobs that spend model tokens on every firm each day (the
 * morning rundown): a lapsed free account, a suspended firm or a deactivated
 * member must not cost us an agent run per day.
 */
export async function billableRecipientsByBrain(): Promise<Map<string, User[]>> {
  const store = getStore();
  const orgStore = getOrgStore();
  const users = (await store.list()).filter((u) => !u.deactivatedAt);
  const byId = new Map(users.map((u) => [u.id, u]));
  const result = new Map<string, User[]>();
  const brainPaid = new Map<string, boolean>();

  const firmBrains = await firmBrainOwners();

  for (const user of users) {
    let brainId = user.brainId;
    let payer: User | undefined = user;
    if (user.orgId) {
      const org = await orgStore.getById(user.orgId);
      if (!org || org.suspendedAt) continue;
      brainId = org.brainId;
      const payerId = billingUserOf(org);
      payer = byId.get(payerId) ?? (await store.getById(payerId)) ?? undefined;
    } else if (firmBrains.has(brainId)) {
      // Left a firm whose brain was their own — not a member of it any more.
      continue;
    }
    let paid = brainPaid.get(brainId);
    if (paid === undefined) {
      paid = Boolean(payer && !payer.deactivatedAt && effectivePlan(payer) !== "free");
      brainPaid.set(brainId, paid);
    }
    if (!paid) continue;
    const list = result.get(brainId) ?? [];
    list.push(user);
    result.set(brainId, list);
  }
  return result;
}

// ── Matter-aware notification recipients ─────────────────────────────────

const STAFF_ROLES = new Set(["admin", "lawyer", "assistant"]);

/** Active firm staff only — never client accounts, deactivated or role-less users. */
export function activeStaffRecipients(users: readonly User[]): User[] {
  return users.filter((u) => !u.deactivatedAt && Boolean(u.role) && STAFF_ROLES.has(u.role));
}

/** `permissions` of every matter, keyed by slug (from a full legal_case read). */
export function matterPermissionsBySlug(
  cases: readonly EnginePage[]
): Map<string, MatterPermissions> {
  const map = new Map<string, MatterPermissions>();
  for (const page of cases) {
    const raw = page.frontmatter?.permissions;
    map.set(page.slug, raw && typeof raw === "object" ? (raw as MatterPermissions) : {});
  }
  return map;
}

/**
 * Access rules of ONE matter, for notices outside the batch crons (webhooks,
 * the task queue) that must not read every matter of the firm. A matter that
 * cannot be read yields an empty lookup — admins only (see
 * mayReceiveMatterNotice).
 */
export async function matterPermissionsForSlug(
  brainId: string,
  caseSlug: string
): Promise<Map<string, MatterPermissions>> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${caseSlug.split("/").map(encodeURIComponent).join("/")}`,
      { headers: engineHeadersForBrain(brainId), signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return new Map();
    const page = (await res.json()) as { slug?: unknown; frontmatter?: Record<string, unknown> };
    // A different page (e.g. a redirect to another slug) is not this matter.
    if (page.slug !== undefined && page.slug !== caseSlug) return new Map();
    return matterPermissionsBySlug([{ slug: caseSlug, title: "", frontmatter: page.frontmatter }]);
  } catch {
    return new Map();
  }
}

/**
 * May this person be told about something of this matter (deadline title,
 * matter name)? Active staff only; the matter's visibility, team, grants and
 * ethical wall apply exactly as when opening the matter. Notices without a
 * matter go to all active staff. A matter that is not in the lookup (deleted,
 * unreadable) is known to firm admins only — fail-closed for everybody else.
 */
export function mayReceiveMatterNotice(
  user: User,
  caseSlug: string | null | undefined,
  permissions: ReadonlyMap<string, MatterPermissions>
): boolean {
  if (activeStaffRecipients([user]).length === 0) return false;
  if (!caseSlug) return true;
  const perms = permissions.get(caseSlug);
  if (!perms) return user.role === "admin";
  return matterAccessLevel({ userId: user.id, role: user.role }, perms) !== "none";
}

/** Recipients of a matter notice among the firm's users (see mayReceiveMatterNotice). */
export function recipientsForMatter(
  users: readonly User[],
  caseSlug: string | null | undefined,
  permissions: ReadonlyMap<string, MatterPermissions>
): User[] {
  return users.filter((u) => mayReceiveMatterNotice(u, caseSlug, permissions));
}

/**
 * Recipients of a firm-wide notice whose content spans ALL matters (e.g. an
 * AI-written briefing that may name any matter): active staff with access to
 * every matter of the firm — nobody behind a wall, outside a restricted team
 * or without a grant on a confidential matter. If the matters cannot be read
 * completely, firm admins only (fail-closed).
 */
export async function recipientsForAllMatters(
  brainId: string,
  users: readonly User[]
): Promise<User[]> {
  const staff = activeStaffRecipients(users);
  if (staff.length === 0) return [];
  let cases: EnginePage[];
  try {
    cases = await fetchAllPagesStrict(brainId, "legal_case");
  } catch {
    return staff.filter((u) => u.role === "admin");
  }
  const permissions = matterPermissionsBySlug(cases);
  return staff.filter((u) => cases.every((c) => mayReceiveMatterNotice(u, c.slug, permissions)));
}

/**
 * Matter notice for a recipient whose person is not known (e.g. a shared
 * WhatsApp number bound to a role only): only matters without any access
 * restriction — no wall, no team list, no restricted visibility, no grants.
 */
export function mayReceiveMatterNoticeAnonymously(
  role: string | null | undefined,
  caseSlug: string | null | undefined,
  permissions: ReadonlyMap<string, MatterPermissions>
): boolean {
  if (!role || !STAFF_ROLES.has(role)) return false;
  if (!caseSlug) return true;
  const perms = permissions.get(caseSlug);
  if (!perms) return false;
  const restricted =
    (perms.blocked_users ?? []).length > 0 ||
    (perms.allowed_users ?? []).length > 0 ||
    (perms.grants ?? []).length > 0 ||
    (perms.visibility ?? "full") !== "full";
  return !restricted;
}

/**
 * Create a daily-dedup "already notified today" checker.
 * Uses a Postgres table with (brain_id, day) primary key.
 * In dev mode (no pool), always returns false (no dedup).
 */
export function createDailyDedup(tableName: string) {
  const ensureSchema = createSchemaInit(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      brain_id text NOT NULL,
      day text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (brain_id, day)
    )
  `);

  return async function alreadyNotifiedToday(brainId: string): Promise<boolean> {
    const pool = getSharedPgPool();
    if (!pool) return false;
    await ensureSchema();
    const day = new Date().toISOString().slice(0, 10);
    const { rowCount } = await pool.query(
      `INSERT INTO ${tableName} (brain_id, day) VALUES ($1, $2)
       ON CONFLICT (brain_id, day) DO NOTHING`,
      [brainId, day]
    );
    return rowCount === 0;
  };
}

/**
 * Permanent per-item dedup — unlike createDailyDedup the key is not a day but
 * a caller-chosen item identity (e.g. an overdue Notfrist), so "seen once"
 * stays seen forever. isNew and mark are separate: the caller marks only
 * after a successful send, so a failed notification retries on the next run.
 * In dev mode (no pool) isNew always returns true (no dedup).
 */
export function createKeyedDedup(tableName: string) {
  const ensureSchema = createSchemaInit(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      brain_id text NOT NULL,
      item_key text NOT NULL,
      sent_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (brain_id, item_key)
    )
  `);

  return {
    async isNew(brainId: string, itemKey: string): Promise<boolean> {
      const pool = getSharedPgPool();
      if (!pool) return true;
      await ensureSchema();
      const { rowCount } = await pool.query(
        `SELECT 1 FROM ${tableName} WHERE brain_id = $1 AND item_key = $2`,
        [brainId, itemKey]
      );
      return rowCount === 0;
    },
    async mark(brainId: string, itemKey: string): Promise<void> {
      const pool = getSharedPgPool();
      if (!pool) return;
      await ensureSchema();
      await pool.query(
        `INSERT INTO ${tableName} (brain_id, item_key) VALUES ($1, $2)
         ON CONFLICT (brain_id, item_key) DO NOTHING`,
        [brainId, itemKey]
      );
    },
  };
}

/**
 * Fetch pending agent_action pages from the engine.
 * These are approvals awaiting the lawyer's decision.
 * Returns [] on any error.
 */
export async function fetchPendingApprovals(brainId: string, limit = 50): Promise<EnginePage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=agent_action&limit=${limit}`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return (data as EnginePage[]).filter((p) => {
      const fm = p.frontmatter ?? {};
      return fm.status === "pending";
    });
  } catch {
    return [];
  }
}

/**
 * Fetch legal_case pages that were updated in the last 24 hours.
 * Returns [] on any error.
 */
export async function fetchRecentCaseActivity(brainId: string, limit = 20): Promise<EnginePage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_case&limit=${limit}`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return (data as EnginePage[]).filter((p) => {
      const updated = p.updated_at ?? (p.frontmatter?.updated_at as string | undefined);
      return updated && updated >= cutoff;
    });
  } catch {
    return [];
  }
}

export async function fetchRecentDocuments(brainId: string, limit = 20): Promise<EnginePage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=document&limit=${limit}`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    return (data as EnginePage[]).filter((p) => {
      const created = p.created_at ?? (p.frontmatter?.created_at as string | undefined);
      return created && created >= cutoff;
    });
  } catch {
    return [];
  }
}

/**
 * Fetch executed contracts that have not yet been processed by the auto-playbook cron.
 * Returns the count of pending contracts for dashboard badge display.
 */
export async function fetchPendingPlaybookUpdates(
  brainId: string,
  limit = 50
): Promise<EnginePage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_contract&limit=${limit}`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    return (data as EnginePage[]).filter((p) => {
      const fm = p.frontmatter ?? {};
      return fm.status === "executed" && !fm.playbook_processed;
    });
  } catch {
    return [];
  }
}

export interface ContradictionFinding {
  case_slug: string;
  severity: "high" | "medium" | "low" | "info";
  chunk_a: string;
  chunk_b: string;
  explanation?: string;
  detected_at: string;
}

/**
 * Fetch contradiction findings from the engine's latest probe run
 * (GET /api/legal/contradictions/latest, source-scoped to this brain).
 * Returns [] on any error (best-effort, don't block the briefing).
 */
export async function fetchContradictions(
  brainId: string,
  limit = 10
): Promise<ContradictionFinding[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/legal/contradictions/latest?limit=50`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      findings?: Array<Record<string, unknown>>;
      last_run?: { ran_at?: string | null } | null;
    };
    const ranAt = data.last_run?.ran_at ?? new Date().toISOString();
    return (Array.isArray(data.findings) ? data.findings : [])
      .filter((f) => f.severity === "high" || f.severity === "medium")
      .slice(0, limit)
      .map((f) => mapContradictionFinding(f, ranAt));
  } catch {
    return [];
  }
}

/** Engine finding `{severity, axis, a:{slug}, b:{slug}}` → briefing shape. */
export function mapContradictionFinding(
  f: Record<string, unknown>,
  ranAt: string
): ContradictionFinding {
  const side = (v: unknown): string =>
    v && typeof v === "object" ? String((v as { slug?: unknown }).slug ?? "") : String(v ?? "");
  const sev = f.severity;
  return {
    case_slug: side(f.a) || String(f.slug ?? ""),
    severity: sev === "high" || sev === "medium" || sev === "low" ? sev : "medium",
    chunk_a: side(f.a),
    chunk_b: side(f.b),
    explanation: typeof f.axis === "string" && f.axis ? f.axis : undefined,
    detected_at: ranAt,
  };
}
