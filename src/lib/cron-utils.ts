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
  updated_at?: string;
  created_at?: string;
}

/**
 * Fetch pages from the engine by type. Returns [] on any error.
 */
export async function fetchPages(
  brainId: string,
  type: string,
  limit: number
): Promise<EnginePage[]> {
  try {
    const res = await fetch(
      `${ENGINE_URL}/api/pages?type=${encodeURIComponent(type)}&limit=${limit}`,
      {
        headers: engineHeadersForBrain(brainId),
        signal: AbortSignal.timeout(15_000),
      }
    );
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
 * Fetch contradiction findings from the engine's latest probe run.
 * Reads eval_contradictions_runs via the think API with find_contradictions tool.
 * Returns [] on any error (best-effort, don't block the briefing).
 */
export async function fetchContradictions(
  brainId: string,
  limit = 10
): Promise<ContradictionFinding[]> {
  try {
    const headers = engineHeadersForBrain(brainId);
    headers["Content-Type"] = "application/json";
    const res = await fetch(`${ENGINE_URL}/api/think`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: `find_contradictions severity=high,medium limit=${limit}`,
        tools: ["find_contradictions"],
        tool_choice: "find_contradictions",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { findings?: Array<Record<string, unknown>> };
    const findings = Array.isArray(data.findings) ? data.findings : [];
    return findings.slice(0, limit).map((f) => ({
      case_slug: String(f.slug ?? f.case_slug ?? ""),
      severity: (f.severity as "high" | "medium" | "low" | "info") ?? "medium",
      chunk_a: String(f.a ?? f.chunk_a ?? ""),
      chunk_b: String(f.b ?? f.chunk_b ?? ""),
      explanation: f.explanation
        ? String(f.explanation)
        : f.reasoning
          ? String(f.reasoning)
          : undefined,
      detected_at: String(f.detected_at ?? f.ran_at ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}
