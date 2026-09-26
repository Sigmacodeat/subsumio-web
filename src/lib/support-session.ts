// Time-boxed, audited platform-operator access to a firm's brain.
//
// Design: the operator may enter a firm's data only while the firm has given
// a support approval (SupportGrant, below): a firm admin grants it in the
// security settings for a chosen time (at most 7 days) and scope (read, or
// read and write), and may revoke it at any time. Every entry also demands a
// reason, is capped at 60 minutes (and never outlives the approval), is
// visible to the firm in its own audit trail, and shows a persistent banner
// while active. Revoking or replacing the approval ends running sessions at
// once; an expired approval makes its sessions inactive (fail-closed: a
// session only counts as active while its approval is valid). See engineContext() in @/lib/engine, which
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
import { randomUUID } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";
import {
  SUPPORT_GRANT_MAX_HOURS,
  supportSessionExpiry,
  type SupportSessionMode,
} from "@/lib/support-session-policy";

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
  /** The firm approval this session runs under. */
  grantId: string | null;
}

/** A firm's approval for support access (granted by a firm admin). */
export interface SupportGrant {
  id: string;
  /** Tenant id: org id, or `solo-<userId>` (see src/lib/tenants.ts). */
  orgId: string;
  /** "read" allows read sessions only; "write" allows read and write sessions. */
  mode: SupportSessionMode;
  grantedById: string;
  grantedByEmail: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedByEmail: string | null;
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
  // Sessions without an approval (from before approvals existed) never count
  // as active again: the active-session query joins the approval.
  "ALTER TABLE subsumio_support_sessions ADD COLUMN IF NOT EXISTS grant_id text",
  `CREATE TABLE IF NOT EXISTS subsumio_support_grants (
    id text PRIMARY KEY,
    org_id text NOT NULL,
    mode text NOT NULL,
    granted_by_id text NOT NULL,
    granted_by_email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revoked_by_email text
  )`,
  "CREATE INDEX IF NOT EXISTS subsumio_support_grants_org_idx ON subsumio_support_grants (org_id, created_at DESC)",
]);

// In-memory fallback for local dev / unit tests without Postgres. Never used
// in production (getSharedPgPool() is non-null whenever SUBSUMIO_AUTH_DATABASE_URL
// or friends are set, which production requires — see src/lib/auth/store.ts).
const memoryStore: SupportSession[] = [];
const memoryGrants: SupportGrant[] = [];

function iso(v: unknown): string {
  return new Date(v as string).toISOString();
}

function rowToGrant(row: Record<string, unknown>): SupportGrant {
  return {
    id: String(row.id),
    orgId: String(row.org_id),
    mode: row.mode === "write" ? "write" : "read",
    grantedById: String(row.granted_by_id),
    grantedByEmail: String(row.granted_by_email),
    createdAt: iso(row.created_at),
    expiresAt: iso(row.expires_at),
    revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
    revokedByEmail: row.revoked_by_email ? String(row.revoked_by_email) : null,
  };
}

function grantActive(g: SupportGrant, now: number = Date.now()): boolean {
  return !g.revokedAt && new Date(g.expiresAt).getTime() > now;
}

function sessionActive(s: SupportSession, now: number = Date.now()): boolean {
  if (s.endedAt || new Date(s.expiresAt).getTime() <= now) return false;
  const grant = memoryGrants.find((g) => g.id === s.grantId);
  return !!grant && grant.orgId === s.orgId && grantActive(grant, now);
}

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
    grantId: row.grant_id ? String(row.grant_id) : null,
  };
}

/**
 * Starts a support session for `operatorId` against `orgId` under the firm's
 * approval `grant` (the caller checked that it is active and covers `mode`).
 * The session ends with the approval at the latest. Any prior active session
 * for the same operator is ended first — an operator has at most one active
 * session at a time, so the banner/audit trail never has to reconcile two
 * simultaneous impersonations.
 */
export async function startSupportSession(input: {
  operatorId: string;
  operatorEmail: string;
  orgId: string;
  orgName: string;
  reason: string;
  mode?: SupportSessionMode;
  grant: Pick<SupportGrant, "id" | "expiresAt">;
}): Promise<SupportSession> {
  await ensureSchema();
  await endSupportSession(input.operatorId);

  const now = new Date();
  const expiresAt = supportSessionExpiry(now, input.grant.expiresAt, SUPPORT_SESSION_TTL_MS);
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
    grantId: input.grant.id,
  };

  const pool = getSharedPgPool();
  if (!pool) {
    memoryStore.push(session);
    return session;
  }
  try {
    await pool.query(
      `INSERT INTO subsumio_support_sessions
        (id, operator_id, operator_email, org_id, org_name, reason, started_at, expires_at, mode, grant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
        session.grantId,
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

/**
 * The operator's current active session, or null: not ended, not expired, and
 * its firm approval still valid (not revoked, not expired). Store errors
 * answer null — no session.
 */
export async function getActiveSupportSession(operatorId: string): Promise<SupportSession | null> {
  const pool = getSharedPgPool();
  if (!pool) {
    const active = memoryStore.find((s) => s.operatorId === operatorId && sessionActive(s));
    return active ?? null;
  }
  await ensureSchema();
  try {
    const { rows } = await pool.query(
      `SELECT s.* FROM subsumio_support_sessions s
         JOIN subsumio_support_grants g ON g.id = s.grant_id AND g.org_id = s.org_id
        WHERE s.operator_id = $1 AND s.ended_at IS NULL AND s.expires_at > now()
          AND g.revoked_at IS NULL AND g.expires_at > now()
        ORDER BY s.started_at DESC LIMIT 1`,
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

// ── Firm approvals ───────────────────────────────────────────────────────────

/** The firm's currently valid approval, or null (also on store errors — fail-closed). */
export async function getActiveSupportGrant(orgId: string): Promise<SupportGrant | null> {
  const pool = getSharedPgPool();
  if (!pool) {
    const active = memoryGrants
      .filter((g) => g.orgId === orgId && grantActive(g))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return active[0] ?? null;
  }
  await ensureSchema();
  try {
    const { rows } = await pool.query(
      `SELECT * FROM subsumio_support_grants
        WHERE org_id = $1 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [orgId]
    );
    return rows[0] ? rowToGrant(rows[0]) : null;
  } catch (err) {
    log.error("getActiveSupportGrant failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Revokes the firm's valid approval(s) and ends every support session that
 * runs under them. Returns the revoked approvals and the ended sessions, so
 * the caller can write the audit entries. Store errors throw — a revocation
 * must never be reported as done when it was not.
 */
export async function revokeSupportGrants(
  orgId: string,
  revokedByEmail: string
): Promise<{ grants: SupportGrant[]; endedSessions: SupportSession[] }> {
  const pool = getSharedPgPool();
  const nowIso = new Date().toISOString();
  if (!pool) {
    const grants = memoryGrants.filter((g) => g.orgId === orgId && grantActive(g));
    const ids = new Set(grants.map((g) => g.id));
    const endedSessions: SupportSession[] = [];
    for (const s of memoryStore) {
      if (s.grantId && ids.has(s.grantId) && sessionActive(s)) {
        s.endedAt = nowIso;
        endedSessions.push({ ...s });
      }
    }
    for (const g of grants) {
      g.revokedAt = nowIso;
      g.revokedByEmail = revokedByEmail;
    }
    return { grants: grants.map((g) => ({ ...g })), endedSessions };
  }
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: grantRows } = await client.query(
      `UPDATE subsumio_support_grants
          SET revoked_at = now(), revoked_by_email = $2
        WHERE org_id = $1 AND revoked_at IS NULL AND expires_at > now()
        RETURNING *`,
      [orgId, revokedByEmail]
    );
    const ids = grantRows.map((r) => String(r.id));
    const { rows: sessionRows } = ids.length
      ? await client.query(
          `UPDATE subsumio_support_sessions
              SET ended_at = now()
            WHERE grant_id = ANY($1::text[]) AND ended_at IS NULL AND expires_at > now()
            RETURNING *`,
          [ids]
        )
      : { rows: [] as Record<string, unknown>[] };
    await client.query("COMMIT");
    return { grants: grantRows.map(rowToGrant), endedSessions: sessionRows.map(rowToSession) };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    log.error("revokeSupportGrants failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Grants support access for `hours` (1 … 168). A firm has at most one valid
 * approval: an earlier one is revoked first (and its running sessions end),
 * so narrowing the scope from write to read takes effect at once.
 */
export async function createSupportGrant(input: {
  orgId: string;
  mode: SupportSessionMode;
  hours: number;
  grantedById: string;
  grantedByEmail: string;
}): Promise<{ grant: SupportGrant; replaced: SupportGrant[]; endedSessions: SupportSession[] }> {
  const hours = Math.floor(input.hours);
  if (!Number.isFinite(hours) || hours < 1 || hours > SUPPORT_GRANT_MAX_HOURS) {
    throw new Error("support grant duration out of range");
  }
  const { grants: replaced, endedSessions } = await revokeSupportGrants(
    input.orgId,
    input.grantedByEmail
  );
  const now = new Date();
  const grant: SupportGrant = {
    id: randomUUID(),
    orgId: input.orgId,
    mode: input.mode === "write" ? "write" : "read",
    grantedById: input.grantedById,
    grantedByEmail: input.grantedByEmail,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + hours * 3600_000).toISOString(),
    revokedAt: null,
    revokedByEmail: null,
  };
  const pool = getSharedPgPool();
  if (!pool) {
    memoryGrants.push(grant);
    return { grant: { ...grant }, replaced, endedSessions };
  }
  await ensureSchema();
  await pool.query(
    `INSERT INTO subsumio_support_grants
       (id, org_id, mode, granted_by_id, granted_by_email, created_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      grant.id,
      grant.orgId,
      grant.mode,
      grant.grantedById,
      grant.grantedByEmail,
      grant.createdAt,
      grant.expiresAt,
    ]
  );
  return { grant, replaced, endedSessions };
}

/** Active support sessions in one firm right now (for the firm's own settings view). */
export async function listActiveSupportSessionsForOrg(orgId: string): Promise<SupportSession[]> {
  const pool = getSharedPgPool();
  if (!pool) return memoryStore.filter((s) => s.orgId === orgId && sessionActive(s));
  await ensureSchema();
  try {
    const { rows } = await pool.query(
      `SELECT s.* FROM subsumio_support_sessions s
         JOIN subsumio_support_grants g ON g.id = s.grant_id AND g.org_id = s.org_id
        WHERE s.org_id = $1 AND s.ended_at IS NULL AND s.expires_at > now()
          AND g.revoked_at IS NULL AND g.expires_at > now()
        ORDER BY s.started_at DESC`,
      [orgId]
    );
    return rows.map(rowToSession);
  } catch (err) {
    log.error("listActiveSupportSessionsForOrg failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
