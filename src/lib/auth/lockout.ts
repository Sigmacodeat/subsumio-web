import { getSharedPgPool } from "./store";
import { createSchemaInit } from "@/lib/schema-init";
import { promises as fs } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";

const DATA_DIR = env("SUBSUMIO_DATA_DIR") || path.join(process.cwd(), ".data");
const LOCKOUT_FILE = path.join(DATA_DIR, "lockouts.json");

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;

interface LockoutEntry {
  failedAttempts: number;
  firstFailedAt: number;
  lockedUntil: number | null;
}

const cache = new Map<string, LockoutEntry>();
const ensureLockoutSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_lockouts (
    key text PRIMARY KEY,
    failed_attempts int NOT NULL DEFAULT 0,
    first_failed_at bigint NOT NULL,
    locked_until bigint,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
`);

export async function recordFailedLogin(
  email: string
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const key = `login:${email.toLowerCase()}`;
  const now = Date.now();

  let entry = cache.get(key);
  if (!entry || (entry.firstFailedAt + LOCKOUT_WINDOW_MS < now && !entry.lockedUntil)) {
    entry = { failedAttempts: 0, firstFailedAt: now, lockedUntil: null };
  }

  entry.failedAttempts++;

  if (entry.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  cache.set(key, entry);
  await persistLockout(key, entry);

  return {
    locked: entry.lockedUntil !== null && entry.lockedUntil > now,
    retryAfterSeconds: entry.lockedUntil ? Math.ceil((entry.lockedUntil - now) / 1000) : 0,
  };
}

export async function isAccountLocked(
  email: string
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const key = `login:${email.toLowerCase()}`;
  const now = Date.now();
  const entry = cache.get(key);

  if (!entry || !entry.lockedUntil) return { locked: false, retryAfterSeconds: 0 };
  if (entry.lockedUntil <= now) {
    cache.delete(key);
    await removeLockout(key);
    return { locked: false, retryAfterSeconds: 0 };
  }

  return {
    locked: true,
    retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000),
  };
}

export async function clearLockout(email: string): Promise<void> {
  const key = `login:${email.toLowerCase()}`;
  cache.delete(key);
  await removeLockout(key);
}

async function persistLockout(key: string, entry: LockoutEntry): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureLockoutSchema();
      await pool.query(
        `INSERT INTO subsumio_lockouts (key, failed_attempts, first_failed_at, locked_until)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET
           failed_attempts = EXCLUDED.failed_attempts,
           first_failed_at = EXCLUDED.first_failed_at,
           locked_until = EXCLUDED.locked_until,
           updated_at = now()`,
        [key, entry.failedAttempts, entry.firstFailedAt, entry.lockedUntil]
      );
    } catch (err) {
      console.error(
        `[lockout] persist failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return;
  }

  // File-based fallback for dev
  try {
    await fs.mkdir(path.dirname(LOCKOUT_FILE), { recursive: true });
    const allLockouts: Record<string, LockoutEntry> = {};
    try {
      const raw = await fs.readFile(LOCKOUT_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
        allLockouts[k] = v as LockoutEntry;
      }
    } catch {}
    allLockouts[key] = entry;
    const tmp = LOCKOUT_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(allLockouts, null, 2));
    await fs.rename(tmp, LOCKOUT_FILE);
  } catch (err) {
    console.error(
      `[lockout] file persist failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function removeLockout(key: string): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureLockoutSchema();
      await pool.query("DELETE FROM subsumio_lockouts WHERE key = $1", [key]);
    } catch (err) {
      console.error(`[lockout] remove failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  try {
    const raw = await fs.readFile(LOCKOUT_FILE, "utf-8");
    const allLockouts = JSON.parse(raw) as Record<string, LockoutEntry>;
    delete allLockouts[key];
    const tmp = LOCKOUT_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(allLockouts, null, 2));
    await fs.rename(tmp, LOCKOUT_FILE);
  } catch {}
}
