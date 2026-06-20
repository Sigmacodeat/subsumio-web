// Plan limits — single source of truth for fair-use display and seat checks.
// These power the usage meter and the team invite gate. Keep in sync with
// the public pricing copy (content/site.ts PRICING): the pricing page
// promises "generous limits shown transparently" — these ARE those limits.
//
// V1 is display + soft gating only: we show usage and warn, we don't cut
// anyone off mid-month ("we ask before anything changes" — pricing footnote).

import type { Plan } from "@/lib/auth/store";

export interface PlanLimits {
  /** Max pages in the brain (pricing: Pro = 25,000). */
  pages: number;
  /** Fair-use queries (think + search) per calendar month. */
  queriesPerMonth: number;
  /** Seats = org members incl. owner. 1 means no team features. */
  seats: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { pages: 200, queriesPerMonth: 100, seats: 1 },
  pro: { pages: 25_000, queriesPerMonth: 2_000, seats: 1 },
  team: { pages: 100_000, queriesPerMonth: 10_000, seats: 5 },
  enterprise: { pages: 1_000_000, queriesPerMonth: 100_000, seats: 25 },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

// ── Quota Enforcement (server-side) ────────────────────────────────────────
// Stores monthly usage per brainId in Postgres (production) or JSON file (dev).
// Enforced at the API-proxy layer before engine calls.

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSharedPgPool } from "@/lib/auth/store";

import { env } from "@/lib/env";
import { currentMonth } from "@/lib/datetime";
import { createSchemaInit } from "@/lib/schema-init";

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const QUOTA_FILE = path.join(DATA_DIR, "quota.json");

/** { [brainId]: { [yyyy-mm]: { queries: number, pages: number, uploads: number } } } */
type QuotaDb = Record<string, Record<string, { queries: number; pages: number; uploads: number }>>;

let quotaCache: QuotaDb | null = null;
let quotaWriteQueue: Promise<void> = Promise.resolve();

async function loadQuotaFile(): Promise<QuotaDb> {
  if (quotaCache) return quotaCache;
  try {
    quotaCache = JSON.parse(await fs.readFile(QUOTA_FILE, "utf8")) as QuotaDb;
  } catch {
    quotaCache = {};
  }
  return quotaCache;
}

async function persistQuotaFile(): Promise<void> {
  const db = quotaCache ?? {};
  quotaWriteQueue = quotaWriteQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${QUOTA_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, QUOTA_FILE);
  });
  return quotaWriteQueue;
}

const ensureQuotaSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_quota (
    brain_id text NOT NULL,
    month text NOT NULL,
    queries integer NOT NULL DEFAULT 0,
    pages integer NOT NULL DEFAULT 0,
    uploads integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brain_id, month)
  )
`);

export type QuotaType = "queries" | "pages" | "uploads";

async function pgGet(
  brainId: string,
  month: string
): Promise<{ queries: number; pages: number; uploads: number }> {
  const pool = getSharedPgPool();
  if (!pool) return { queries: 0, pages: 0, uploads: 0 };
  await ensureQuotaSchema();
  const { rows } = await pool.query<{ queries: number; pages: number; uploads: number }>(
    "SELECT queries, pages, uploads FROM subsumio_quota WHERE brain_id = $1 AND month = $2",
    [brainId, month]
  );
  return rows[0] ?? { queries: 0, pages: 0, uploads: 0 };
}

async function pgInc(brainId: string, month: string, field: QuotaType, amount = 1): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;
  await ensureQuotaSchema();
  await pool.query(
    `INSERT INTO subsumio_quota (brain_id, month, ${field})
     VALUES ($1, $2, $3)
     ON CONFLICT (brain_id, month)
     DO UPDATE SET ${field} = subsumio_quota.${field} + $3, updated_at = now()`,
    [brainId, month, amount]
  );
}

async function fileGet(
  brainId: string,
  month: string
): Promise<{ queries: number; pages: number; uploads: number }> {
  const db = await loadQuotaFile();
  return db[brainId]?.[month] ?? { queries: 0, pages: 0, uploads: 0 };
}

async function fileInc(
  brainId: string,
  month: string,
  field: QuotaType,
  amount = 1
): Promise<void> {
  const db = await loadQuotaFile();
  const brain = (db[brainId] ??= {});
  const slot = (brain[month] ??= { queries: 0, pages: 0, uploads: 0 });
  slot[field] += amount;
  await persistQuotaFile();
}

/** Aktueller Verbrauch für ein Brain im laufenden Monat. */
export async function getQuota(
  brainId: string
): Promise<{ queries: number; pages: number; uploads: number }> {
  const month = currentMonth();
  try {
    if (getSharedPgPool()) return await pgGet(brainId, month);
    return await fileGet(brainId, month);
  } catch (err) {
    console.error(`[quota] get failed: ${err instanceof Error ? err.message : String(err)}`);
    return { queries: 0, pages: 0, uploads: 0 };
  }
}

/** Verbrauch inkrementieren (fire-and-forget, kein Throw). */
export async function incQuota(brainId: string, field: QuotaType, amount = 1): Promise<void> {
  const month = currentMonth();
  try {
    if (getSharedPgPool()) {
      await pgInc(brainId, month, field, amount);
    } else {
      await fileInc(brainId, month, field, amount);
    }
  } catch (err) {
    console.error(`[quota] inc failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Quota-Enforcement: prüft, ob Aktion noch erlaubt ist. Gibt {ok,limit,used} zurück. */
const QUOTA_TO_LIMIT_KEY: Record<QuotaType, keyof PlanLimits | null> = {
  queries: "queriesPerMonth",
  pages: "pages",
  uploads: null, // uploads haben kein Limit in PlanLimits
};

export async function checkQuota(
  brainId: string,
  plan: Plan,
  field: QuotaType
): Promise<{ ok: boolean; limit: number; used: number }> {
  const limits = limitsFor(plan);
  const limitKey = QUOTA_TO_LIMIT_KEY[field];
  if (!limitKey) return { ok: true, limit: Infinity, used: 0 };
  const limit = limits[limitKey];
  if (limit === Infinity) return { ok: true, limit: Infinity, used: 0 };

  const pool = getSharedPgPool();
  if (pool) {
    // Atomic check-and-reserve: increment in the same transaction as the check
    // to prevent race conditions between concurrent requests.
    const month = currentMonth();
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Upsert + increment atomically
        await client.query(
          `INSERT INTO subsumio_quota (brain_id, month, ${field})
           VALUES ($1, $2, 1)
           ON CONFLICT (brain_id, month)
           DO UPDATE SET ${field} = subsumio_quota.${field} + 1, updated_at = now()
           RETURNING ${field} as new_val`,
          [brainId, month]
        );
        const { rows } = await client.query<{ queries: number; pages: number; uploads: number }>(
          "SELECT queries, pages, uploads FROM subsumio_quota WHERE brain_id = $1 AND month = $2 FOR UPDATE",
          [brainId, month]
        );
        const used = rows[0]?.[field] ?? 0;
        const ok = used <= limit;
        if (!ok) {
          // Roll back the increment if quota exceeded
          await client.query("ROLLBACK");
          return { ok: false, limit, used: used - 1 };
        }
        await client.query("COMMIT");
        return { ok: true, limit, used };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(
        `[quota] atomic check failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return { ok: true, limit, used: 0 };
    }
  }

  // File-based fallback (dev only — no atomicity guarantee)
  const used = (await getQuota(brainId))[field];
  return { ok: used < limit, limit, used };
}

/** HTTP-Response wenn Quota überschritten. */
export function quotaExceeded(field: QuotaType, used: number, limit: number): Response {
  return Response.json(
    {
      error: "quota_exceeded",
      field,
      used,
      limit,
      message: `Monthly ${field} limit reached (${used}/${limit})`,
    },
    { status: 429 }
  );
}
