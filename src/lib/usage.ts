// Usage metering — monthly query counters per brain.
//
// Metered at the Next.js proxy layer (every think/search passes through it),
// keyed by brainId so an org's members share one pool.
//
// Storage: Postgres when a database URL is configured (serverless-safe,
// instance-übergreifend — same pool as the auth store); file-based fallback
// for dev/self-hosted without a DB (atomic tmp+rename, serialized writes).
//
// Counter loss tolerance: this is fair-use DISPLAY data, not billing-grade
// invoicing — Stripe charges flat plans; the meter informs, it doesn't bill.

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSharedPgPool } from "@/lib/auth/store";

const DATA_DIR = process.env.SIGMABRAIN_DATA_DIR || path.join(process.cwd(), ".data");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");

/** { [brainId]: { [yyyy-mm]: { queries: number } } } */
type UsageDb = Record<string, Record<string, { queries: number }>>;

let cache: UsageDb | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function currentMonth(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`; // local-timezone aware, e.g. "2026-06"
}

// --- Postgres adapter --------------------------------------------------------

let usageSchemaReady: Promise<void> | null = null;
function ensureUsageSchema(): Promise<void> {
  if (!usageSchemaReady) {
    usageSchemaReady = (async () => {
      const pool = getSharedPgPool();
      if (!pool) return;
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sigmabrain_usage (
          brain_id text NOT NULL,
          month text NOT NULL,
          queries integer NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (brain_id, month)
        )
      `);
    })();
  }
  return usageSchemaReady;
}

async function pgRecordQuery(brainId: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;
  await ensureUsageSchema();
  await pool.query(
    `INSERT INTO sigmabrain_usage (brain_id, month, queries)
     VALUES ($1, $2, 1)
     ON CONFLICT (brain_id, month)
     DO UPDATE SET queries = sigmabrain_usage.queries + 1, updated_at = now()`,
    [brainId, currentMonth()],
  );
}

async function pgUsageFor(brainId: string): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) return 0;
  await ensureUsageSchema();
  const { rows } = await pool.query<{ queries: number }>(
    "SELECT queries FROM sigmabrain_usage WHERE brain_id = $1 AND month = $2",
    [brainId, currentMonth()],
  );
  return rows[0]?.queries ?? 0;
}

// --- File adapter (dev / self-hosted) ----------------------------------------

async function load(): Promise<UsageDb> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(USAGE_FILE, "utf8")) as UsageDb;
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const db = cache ?? {};
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${USAGE_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, USAGE_FILE);
  });
  return writeQueue;
}

async function fileRecordQuery(brainId: string): Promise<void> {
  const db = await load();
  const month = currentMonth();
  const brain = (db[brainId] ??= {});
  const slot = (brain[month] ??= { queries: 0 });
  slot.queries += 1;
  // Keep at most the last 12 months per brain.
  const months = Object.keys(brain).sort();
  while (months.length > 12) delete brain[months.shift()!];
  await persist();
}

// --- Public API ---------------------------------------------------------------

/** Record one query (think or search) for a brain. Never throws. */
export async function recordQuery(brainId: string): Promise<void> {
  try {
    if (getSharedPgPool()) {
      await pgRecordQuery(brainId);
    } else {
      await fileRecordQuery(brainId);
    }
  } catch (err) {
    console.error(`[usage] record failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface MonthUsage {
  month: string;
  queries: number;
}

export async function usageFor(brainId: string): Promise<MonthUsage> {
  const month = currentMonth();
  try {
    if (getSharedPgPool()) {
      return { month, queries: await pgUsageFor(brainId) };
    }
    const db = await load();
    return { month, queries: db[brainId]?.[month]?.queries ?? 0 };
  } catch (err) {
    console.error(`[usage] read failed: ${err instanceof Error ? err.message : String(err)}`);
    return { month, queries: 0 };
  }
}
