// Serialises work on one key (e.g. a trust account) across concurrent requests.
// With Postgres: a session advisory lock, so it also holds across server
// instances. Without Postgres (local file store): an in-process queue.

import { getSharedPgPool } from "@/lib/auth/store";

const localQueues = new Map<string, Promise<unknown>>();

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
