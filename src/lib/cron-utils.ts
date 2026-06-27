/**
 * Shared utilities for cron route handlers — eliminates duplicated
 * EnginePage type, fetchPages helper, recipientsByBrain mapping,
 * and alreadyNotifiedToday dedup pattern across all cron routes.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getStore, getOrgStore, getSharedPgPool, type User } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

export interface EnginePage {
  slug: string;
  title: string;
  type?: string;
  frontmatter?: Record<string, unknown>;
}

/**
 * Fetch pages from the engine by type. Returns [] on any error.
 */
export async function fetchPages(brainId: string, type: string, limit: number): Promise<EnginePage[]> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=${encodeURIComponent(type)}&limit=${limit}`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? (data as EnginePage[]) : [];
  } catch {
    return [];
  }
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
      [brainId, day],
    );
    return rowCount === 0;
  };
}
