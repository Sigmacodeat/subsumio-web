// Time-boxed, audited platform-operator access to a firm's brain.
//
// Design (per user decision): the operator may enter a firm's data at any
// time — no firm approval step — but every entry demands a reason, is capped
// at 60 minutes, is visible to the firm in its own audit trail, and shows a
// persistent banner while active. See engineContext() in @/lib/engine, which
// is the actual enforcement point: it swaps ctx.brainId/ctx.user for the
// duration of an active session and stops doing so the instant it expires —
// there is no background job, expiry is just "the session row is stale".
//
// Sessions are READ-ONLY by default: requireEngineContext() refuses every
// state-changing request (anything but GET/HEAD/OPTIONS) while a read session
// is active. Write access is a separate mode that needs its own reason and is
// named in both audit trails. The firm-visible start entry is written before
// the session is handed out; if it cannot be stored, the session is ended
// again (see the start route).
//
// Inside a session the engine sees the role "support" (read) or "lawyer"
// (write), never "admin": matters the firm set to restricted/confidential,
// ethical walls and document ACL groups stay closed unless the firm adds the
// operator explicitly (supportEngineRole in support-session-policy.ts). Every
// accessed path is written to the firm's audit trail before it is served;
// if that entry cannot be stored the request is refused (requireEngineContext).
// A firm approval step before entry does not exist yet (open product decision).
import { randomUUID } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";
import type { SupportSessionMode } from "@/lib/support-session-policy";

export type { SupportSessionMode };

const log = logger("support-session");

export const SUPPORT_SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes, fixed — not configurable per session.

export interface SupportSession {
  id: string;
  /** "read" (default) or "write" — write needs its own, separately given reason. */
  mode: SupportSessionMode;
  operatorId: string;
  operatorEmail: string;
  orgId: string;
  orgName: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_support_sessions (
    id text PRIMARY KEY,
    operator_id text NOT NULL,
    operator_email text NOT NULL,
    org_id text NOT NULL,
    org_name text NOT NULL,
    reason text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    ended_at timestamptz
  )`,
  "CREATE INDEX IF NOT EXISTS subsumio_support_sessions_operator_idx ON subsumio_support_sessions (operator_id, started_at DESC)",
  "CREATE INDEX IF NOT EXISTS subsumio_support_sessions_org_idx ON subsumio_support_sessions (org_id, started_at DESC)",
  // Default 'read': rows from before the mode existed are treated read-only.
  "ALTER TABLE subsumio_support_sessions ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'read'",
]);

// In-memory fallback for local dev / unit tests without Postgres. Never used
// in production (getSharedPgPool() is non-null whenever SUBSUMIO_AUTH_DATABASE_URL
// or friends are set, which production requires — see src/lib/auth/store.ts).
const memoryStore: SupportSession[] = [];

function rowToSession(row: Record<string, unknown>): SupportSession {
  return {
    id: String(row.id),
    mode: row.mode === "write" ? "write" : "read",
    operatorId: String(row.operator_id),
    operatorEmail: String(row.operator_email),
    orgId: String(row.org_id),
    orgName: String(row.org_name),
    reason: String(row.reason),
    startedAt: new Date(row.started_at as string).toISOString(),
    expiresAt: new Date(row.expires_at as string).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at as string).toISOString() : null,
  };
}

/**
 * Starts a support session for `operatorId` against `orgId`. Any prior active
 * session for the same operator is ended first — an operator has at most one
 * active session at a time, so the banner/audit trail never has to reconcile
 * two simultaneous impersonations.
 */
export async function startSupportSession(input: {
  operatorId: string;
  operatorEmail: string;
  orgId: string;
  orgName: string;
  reason: string;
  mode?: SupportSessionMode;
}): Promise<SupportSession> {
  await ensureSchema();
  await endSupportSession(input.operatorId);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SUPPORT_SESSION_TTL_MS);
  const session: SupportSession = {
    id: randomUUID(),
    mode: input.mode === "write" ? "write" : "read",
    operatorId: input.operatorId,
    operatorEmail: input.operatorEmail,
    orgId: input.orgId,
    orgName: input.orgName,
    reason: input.reason,
    startedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    endedAt: null,
  };

  const pool = getSharedPgPool();
  if (!pool) {
    memoryStore.push(session);
    return session;
  }
  try {
    await pool.query(
      `INSERT INTO subsumio_support_sessions
        (id, operator_id, operator_email, org_id, org_name, reason, started_at, expires_at, mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        session.id,
        session.operatorId,
        session.operatorEmail,
        session.orgId,
        session.orgName,
        session.reason,
        session.startedAt,
        session.expiresAt,
        session.mode,
      ]
    );
  } catch (err) {
    log.error("startSupportSession failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  return session;
}

/** The operator's current active (not ended, not expired) session, or null. */
export async function getActiveSupportSession(operatorId: string): Promise<SupportSession | null> {
  const pool = getSharedPgPool();
  if (!pool) {
    const active = memoryStore.find(
      (s) => s.operatorId === operatorId && !s.endedAt && new Date(s.expiresAt) > new Date()
    );
    return active ?? null;
  }
  await ensureSchema();
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subsumio_support_sessions
        WHERE operator_id = $1 AND ended_at IS NULL AND expires_at > now()
        ORDER BY started_at DESC LIMIT 1`,
      [operatorId]
    );
    return rows[0] ? rowToSession(rows[0]) : null;
  } catch (err) {
    log.error("getActiveSupportSession failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Ends the operator's own active session, if any. Returns the ended session
 * (with endedAt set) so the caller can write an audit entry with an accurate
 * duration, or null if there was nothing active to end.
 */
export async function endSupportSession(operatorId: string): Promise<SupportSession | null> {
  const pool = getSharedPgPool();
  const now = new Date().toISOString();
  if (!pool) {
    const active = memoryStore.find(
      (s) => s.operatorId === operatorId && !s.endedAt && new Date(s.expiresAt) > new Date()
    );
    if (!active) return null;
    active.endedAt = now;
    return { ...active };
  }
  await ensureSchema();
  try {
    const { rows } = await pool.query(
      `UPDATE subsumio_support_sessions
          SET ended_at = now()
        WHERE operator_id = $1 AND ended_at IS NULL AND expires_at > now()
        RETURNING *`,
      [operatorId]
    );
    return rows[0] ? rowToSession(rows[0]) : null;
  } catch (err) {
    log.error("endSupportSession failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Recent sessions for one firm — shown to the operator console for
 * governance/compliance review, never to the firm's own UI (that reads the
 * engine audit_log page written alongside each start/end instead).
 */
export async function listSupportSessionsForOrg(
  orgId: string,
  limit = 20
): Promise<SupportSession[]> {
  const pool = getSharedPgPool();
  if (!pool) {
    return memoryStore
      .filter((s) => s.orgId === orgId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }
  await ensureSchema();
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subsumio_support_sessions WHERE org_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [orgId, limit]
    );
    return rows.map(rowToSession);
  } catch (err) {
    log.error("listSupportSessionsForOrg failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
