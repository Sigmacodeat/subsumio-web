/**
 * Session registry — Postgres-backed device list behind "Aktive Sitzungen".
 *
 * The signed cookie stays the source of truth; this registry shadows it so
 * sessions become enumerable and individually revocable via the `sid` claim.
 * A missing registry row does NOT invalidate a session (fail open — the row
 * only carries revocation + display data; a lost insert must not lock out a
 * user who just logged in), but a `revoked_at` timestamp does (fail closed).
 *
 * In-memory fallback for dev/test without Postgres mirrors the
 * revocation-store pattern.
 */

import { getSharedPgPool } from "./store";
import { createSchemaInit } from "@/lib/schema-init";
import { SESSION_TTL_SECONDS } from "./session-core";

import { logger } from "@/lib/logger";
const log = logger("lib/auth/session-registry");

export interface SessionRecord {
  sid: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
}

const memoryRows = new Map<
  string,
  {
    userId: string;
    createdAt: number;
    lastSeenAt: number;
    userAgent: string | null;
    ip: string | null;
    revokedAt: number | null;
  }
>();

/** Sessions die at SESSION_TTL_SECONDS after issue — registry rows follow the
 *  same lifetime (plus a day of slack) and are pruned lazily on read. */
const ROW_TTL_MS = (SESSION_TTL_SECONDS + 24 * 3600) * 1000;
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

const ensureRegistrySchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_user_sessions (
    sid text PRIMARY KEY,
    user_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    user_agent text,
    ip text,
    revoked_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS subsumio_user_sessions_user_idx
   ON subsumio_user_sessions (user_id)`,
]);

/** Register a newly issued session. Best-effort — a failed insert must not
 *  break login; the session then simply isn't listed/revocable. */
export async function registerSession(
  sid: string,
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null }
): Promise<void> {
  const ua = meta?.userAgent?.slice(0, 256) ?? null;
  const ip = meta?.ip?.slice(0, 64) ?? null;
  const pool = getSharedPgPool();
  if (!pool) {
    memoryRows.set(sid, {
      userId,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      userAgent: ua,
      ip,
      revokedAt: null,
    });
    return;
  }
  try {
    await ensureRegistrySchema();
    await pool.query(
      `INSERT INTO subsumio_user_sessions (sid, user_id, user_agent, ip)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sid) DO NOTHING`,
      [sid, userId, ua, ip]
    );
  } catch (err) {
    log.warn(
      `[session-registry] register failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Active (non-revoked, non-expired) sessions for a user, newest first. */
export async function listActiveSessions(userId: string): Promise<SessionRecord[]> {
  const cutoff = Date.now() - ROW_TTL_MS;
  const pool = getSharedPgPool();
  if (!pool) {
    return Array.from(memoryRows.entries())
      .filter(([, r]) => r.userId === userId && r.revokedAt === null && r.createdAt >= cutoff)
      .map(([sid, r]) => ({
        sid,
        userId,
        createdAt: new Date(r.createdAt).toISOString(),
        lastSeenAt: new Date(r.lastSeenAt).toISOString(),
        userAgent: r.userAgent,
        ip: r.ip,
      }))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }
  await ensureRegistrySchema();
  // Lazy prune — rows outlive their session by a day of slack.
  await pool
    .query(`DELETE FROM subsumio_user_sessions WHERE created_at < now() - interval '31 days'`)
    .catch(() => {});
  const { rows } = await pool.query<{
    sid: string;
    created_at: Date;
    last_seen_at: Date;
    user_agent: string | null;
    ip: string | null;
  }>(
    `SELECT sid, created_at, last_seen_at, user_agent, ip
     FROM subsumio_user_sessions
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY last_seen_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    sid: r.sid,
    userId,
    createdAt: r.created_at.toISOString(),
    lastSeenAt: r.last_seen_at.toISOString(),
    userAgent: r.user_agent,
    ip: r.ip,
  }));
}

/** Revoke a single session, scoped to the owner. Returns false when the sid
 *  doesn't belong to the user or was already revoked. */
export async function revokeSession(userId: string, sid: string): Promise<boolean> {
  const pool = getSharedPgPool();
  if (!pool) {
    const row = memoryRows.get(sid);
    if (!row || row.userId !== userId || row.revokedAt !== null) return false;
    row.revokedAt = Date.now();
    return true;
  }
  await ensureRegistrySchema();
  const { rowCount } = await pool.query(
    `UPDATE subsumio_user_sessions SET revoked_at = now()
     WHERE sid = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sid, userId]
  );
  return (rowCount ?? 0) > 0;
}

/** Revoke every session of a user except `keepSid` (pass null to revoke all). */
export async function revokeSessionRows(userId: string, keepSid?: string | null): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) {
    let n = 0;
    for (const [sid, row] of memoryRows) {
      if (row.userId === userId && row.revokedAt === null && sid !== keepSid) {
        row.revokedAt = Date.now();
        n++;
      }
    }
    return n;
  }
  await ensureRegistrySchema();
  const { rowCount } = await pool.query(
    `UPDATE subsumio_user_sessions SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR sid <> $2)`,
    [userId, keepSid ?? null]
  );
  return rowCount ?? 0;
}

/** Fail-closed revocation check: a row marked revoked rejects the session.
 *  A missing row (lost insert, pre-registry session without sid handled by
 *  the caller) is treated as valid — the registry only carries metadata. */
export async function isSidRevoked(userId: string, sid: string): Promise<boolean> {
  const pool = getSharedPgPool();
  if (!pool) {
    const row = memoryRows.get(sid);
    return row !== undefined && row.revokedAt !== null;
  }
  try {
    await ensureRegistrySchema();
    const { rows } = await pool.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM subsumio_user_sessions WHERE sid = $1 AND user_id = $2`,
      [sid, userId]
    );
    return rows.length > 0 && rows[0].revoked_at !== null;
  } catch {
    return false;
  }
}

/** Sids currently revoked for a user — served to the edge middleware via the
 *  internal revocation-check endpoint (same trust level as min_version). */
export async function listRevokedSids(userId: string): Promise<string[]> {
  const pool = getSharedPgPool();
  if (!pool) {
    return Array.from(memoryRows.entries())
      .filter(([, r]) => r.userId === userId && r.revokedAt !== null)
      .map(([sid]) => sid);
  }
  try {
    await ensureRegistrySchema();
    const { rows } = await pool.query<{ sid: string }>(
      `SELECT sid FROM subsumio_user_sessions WHERE user_id = $1 AND revoked_at IS NOT NULL`,
      [userId]
    );
    return rows.map((r) => r.sid);
  } catch {
    return [];
  }
}

/** Throttled last_seen touch — at most one write per session per 15 minutes.
 *  Fire-and-forget from verifySession; errors are swallowed inside. */
export async function touchSession(userId: string, sid: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    const row = memoryRows.get(sid);
    if (row && row.userId === userId && Date.now() - row.lastSeenAt > TOUCH_INTERVAL_MS) {
      row.lastSeenAt = Date.now();
    }
    return;
  }
  try {
    await ensureRegistrySchema();
    await pool.query(
      `UPDATE subsumio_user_sessions SET last_seen_at = now()
       WHERE sid = $1 AND user_id = $2 AND revoked_at IS NULL
         AND last_seen_at < now() - interval '15 minutes'`,
      [sid, userId]
    );
  } catch (err) {
    log.warn(
      `[session-registry] touch failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Test helper — reset the in-memory fallback. */
export function resetSessionRegistryForTests(): void {
  memoryRows.clear();
}
