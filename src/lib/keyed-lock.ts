// Serialises work on one key (e.g. a trust account) across concurrent requests.
// With Postgres: a session advisory lock, so it also holds across server
// instances. Without Postgres (local file store): an in-process queue.
//
// Pool discipline:
//  - Locks use their OWN small connection pool, derived from the auth pool's
//    connection settings. Holding or waiting for a lock never takes a
//    connection from the pool that serves logins, session checks, audit
//    rows and rate limits — and `fn` may use that pool freely (no
//    self-deadlock).
//  - Waiters hold no connection: `pg_try_advisory_lock` is polled with
//    backoff, and a waiter gives up after SUBSUMIO_KEYED_LOCK_TIMEOUT_MS
//    (default 30 s) with a 503 `lock_timeout` instead of queueing forever.
//  - The holder always unlocks in `finally`; if unlocking fails the
//    connection is destroyed, which ends the session and with it the lock,
//    so a lock can never outlive its request on a pooled connection.

import { Pool, type PoolClient, type PoolConfig } from "pg";
import { getSharedPgPool } from "@/lib/auth/store";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

const localQueues = new Map<string, Promise<unknown>>();

declare global {
  var __subsumioLockPool: Pool | undefined;
}

type LockPool = { connect(): Promise<PoolClient> };

export class KeyedLockTimeoutError extends AppError {
  constructor() {
    super("Der Vorgang wird gerade von einer anderen Anfrage bearbeitet. Bitte erneut versuchen.", {
      code: "lock_timeout",
      statusCode: 503,
    });
  }
}

function positiveInt(name: string, fallback: number): number {
  const n = parseInt(env(name) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Dedicated pool for lock sessions; falls back to `shared` when it can't be derived. */
function lockPool(shared: Pool): LockPool {
  if (globalThis.__subsumioLockPool) return globalThis.__subsumioLockPool;
  const options = (shared as unknown as { options?: PoolConfig }).options;
  if (!(shared instanceof Pool) || !options) return shared;
  globalThis.__subsumioLockPool = new Pool({
    ...options,
    max: positiveInt("SUBSUMIO_KEYED_LOCK_POOL_MAX", 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return globalThis.__subsumioLockPool;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquire(pool: LockPool, key: string, timeoutMs: number): Promise<PoolClient> {
  const deadline = Date.now() + timeoutMs;
  let delay = 20;
  for (;;) {
    const client = await pool.connect();
    let locked = false;
    try {
      const res = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [key]
      );
      locked = res.rows[0]?.locked === true;
    } catch (err) {
      client.release(err instanceof Error ? err : true);
      throw err;
    }
    if (locked) return client;
    client.release();
    const wait = delay + Math.floor(Math.random() * delay);
    if (Date.now() + wait > deadline) throw new KeyedLockTimeoutError();
    await sleep(wait);
    delay = Math.min(delay * 2, 200);
  }
}

async function unlock(client: PoolClient, key: string): Promise<void> {
  try {
    const res = await client.query<{ unlocked: boolean }>(
      "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked",
      [key]
    );
    if (res.rows[0]?.unlocked === false) throw new Error("advisory lock was not held");
    client.release();
  } catch (err) {
    // Destroy the connection: ending the session releases every lock it holds.
    client.release(err instanceof Error ? err : true);
  }
}

export async function withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const shared = getSharedPgPool();
  if (shared) {
    const timeoutMs = positiveInt("SUBSUMIO_KEYED_LOCK_TIMEOUT_MS", 30_000);
    const client = await acquire(lockPool(shared), key, timeoutMs);
    try {
      return await fn();
    } finally {
      await unlock(client, key);
    }
  }
  const previous = localQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  localQueues.set(key, run);
  try {
    return await run;
  } finally {
    if (localQueues.get(key) === run) localQueues.delete(key);
  }
}

const localBusy = new Set<string>();

/**
 * Run `fn` only if nobody else holds `key` right now — never waits. For
 * periodic jobs: an overlapping run skips instead of doing the same work
 * twice. `{ ran: false }` means another run holds the lock. Uses the same
 * dedicated lock pool as `withKeyedLock`, so it cannot exhaust the app pool.
 */
export async function tryWithKeyedLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<{ ran: true; value: T } | { ran: false }> {
  const shared = getSharedPgPool();
  if (shared) {
    const client = await lockPool(shared).connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [key]
      );
      if (!rows[0]?.locked) return { ran: false };
      try {
        return { ran: true, value: await fn() };
      } finally {
        await client
          .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key])
          .catch(() => {});
      }
    } finally {
      client.release();
    }
  }
  if (localBusy.has(key) || localQueues.has(key)) return { ran: false };
  localBusy.add(key);
  try {
    return { ran: true, value: await fn() };
  } finally {
    localBusy.delete(key);
  }
}
