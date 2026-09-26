// Serialises work on one key (e.g. a trust account) across concurrent requests.
// With Postgres: a session advisory lock, so it also holds across server
// instances. Without Postgres (local file store): an in-process queue.

import { getSharedPgPool } from "@/lib/auth/store";

const localQueues = new Map<string, Promise<unknown>>();

const localBusy = new Set<string>();

/**
 * Run `fn` only if nobody else holds `key` right now — never waits. For
 * periodic jobs: an overlapping run skips instead of doing the same work
 * twice. `{ ran: false }` means another run holds the lock.
 */
export async function tryWithKeyedLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<{ ran: true; value: T } | { ran: false }> {
  const pool = getSharedPgPool();
  if (pool) {
    const client = await pool.connect();
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

export async function withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pool = getSharedPgPool();
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [key]);
      try {
        return await fn();
      } finally {
        await client
          .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [key])
          .catch(() => {});
      }
    } finally {
      client.release();
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
