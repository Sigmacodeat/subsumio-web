/**
 * Session revocation store — backed by Postgres in production, in-memory in dev.
 *
 * Stores a per-user minimum accepted session version. Any session with a
 * version <= this value is rejected. This replaces the old in-memory Map
 * that was lost across serverless instances.
 */

import { getSharedPgPool } from "./store";
import { createSchemaInit } from "@/lib/schema-init";

const revokedVersions = new Map<string, number>();

const ensureRevocationSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_session_revocations (
    user_id text PRIMARY KEY,
    min_version integer NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`);

/** Get the minimum accepted session version for a user. */
export async function getMinRevocationVersion(userId: string): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) {
    return revokedVersions.get(userId) ?? 0;
  }
  await ensureRevocationSchema();
  try {
    const { rows } = await pool.query<{ min_version: number }>(
      "SELECT min_version FROM subsumio_session_revocations WHERE user_id = $1",
      [userId],
    );
    return rows[0]?.min_version ?? 0;
  } catch {
    return revokedVersions.get(userId) ?? 0;
  }
}

/** Invalidate all sessions for a user (e.g. after password change). */
export async function revokeAllSessions(userId: string): Promise<void> {
  const current = await getMinRevocationVersion(userId);
  const next = current + 1;
  revokedVersions.set(userId, next);

  const pool = getSharedPgPool();
  if (!pool) return;
  await ensureRevocationSchema();
  try {
    await pool.query(
      `INSERT INTO subsumio_session_revocations (user_id, min_version, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id)
       DO UPDATE SET min_version = $2, updated_at = now()`,
      [userId, next],
    );
  } catch (err) {
    console.error(`[revocation] failed to persist for ${userId}:`, err instanceof Error ? err.message : String(err));
  }
}

/** Check if a session version is still valid. */
export async function isSessionVersionValid(userId: string, version?: number): Promise<boolean> {
  const minVersion = await getMinRevocationVersion(userId);
  if (!minVersion) return true;
  return (version ?? 0) > minVersion;
}
