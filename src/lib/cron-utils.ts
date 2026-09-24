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

/**
 * Build a brainId → User[] mapping from the user store.
 * Org members share the org's brain. Used by all cron routes.
 */
export async function getRecipientsByBrain(): Promise<Map<string, User[]>> {
  const users = await getStore().list();
  const orgStore = getOrgStore();
  const orgCache = new Map<string, string>();
  const recipientsByBrain = new Map<string, User[]>();
  for (const user of users) {
    let brainId = user.brainId;
    if (user.orgId) {
      let cachedBrainId = orgCache.get(user.orgId);
      if (!cachedBrainId) {
        const org = await orgStore.getById(user.orgId);
        cachedBrainId = org?.brainId;
        if (cachedBrainId) orgCache.set(user.orgId, cachedBrainId);
      }
      if (cachedBrainId) brainId = cachedBrainId;
    }
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

  for (const user of users) {
    let brainId = user.brainId;
    let payer: User | undefined = user;
    if (user.orgId) {
      const org = await orgStore.getById(user.orgId);
      if (!org || org.suspendedAt) continue;
      brainId = org.brainId;
      const payerId = billingUserOf(org);
      payer = byId.get(payerId) ?? (await store.getById(payerId)) ?? undefined;
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
