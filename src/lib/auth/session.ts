// Session module (Node runtime) — re-exports edge-safe primitives from session-core.ts
// and adds revocation-dependent functions that require Postgres (node:fs, pg).
// Middleware imports from session-core.ts directly to stay edge-safe.

export {
  type SessionPayload,
  SESSION_COOKIE,
  REF_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionResult,
  getAuthSecret,
  b64url,
  b64urlDecode,
  b64urlDecodeUtf8,
  hmacKey,
  signSession,
  verifySessionCore,
} from "./session-core";

import {
  signSession,
  getAuthSecret,
  SESSION_TTL_SECONDS,
  verifySessionCore,
  type SessionPayload,
  type SessionResult,
} from "./session-core";

export async function createSession(
  userId: string,
  email: string,
  role: SessionPayload["role"],
  opts?: {
    must2fa?: boolean;
    /** Re-issue under an existing registry row (e.g. the must2fa → full
     *  session upgrade) instead of registering a new device entry. */
    sid?: string;
    userAgent?: string | null;
    ip?: string | null;
  }
): Promise<SessionResult> {
  const minVersion = await getMinRevocationVersion(userId);
  const version = minVersion + 1;
  const sid = opts?.sid ?? crypto.randomUUID();
  const token = await signSession(
    { uid: userId, email, role, sid, ...(opts?.must2fa ? { must2fa: true } : {}) },
    getAuthSecret(),
    SESSION_TTL_SECONDS,
    version
  );
  // Register the device row (best-effort — a lost insert must not break login).
  if (!opts?.sid) {
    void registerSession(sid, userId, { userAgent: opts?.userAgent, ip: opts?.ip });
  }
  return {
    token,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.SUBSUMIO_E2E !== "1",
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    },
  };
}

// Revocation store — Node only (Postgres-backed in production).
import {
  revokeAllSessions,
  isSessionVersionValid,
  getMinRevocationVersion,
} from "./revocation-store";
import { registerSession, isSessionRevokedOrIdle, touchSession } from "./session-registry";

export { revokeAllSessions, isSessionVersionValid };

/** Full session verification including revocation check (Node only). */
export async function verifySession(
  token: string | undefined | null,
  secret?: string
): Promise<SessionPayload | null> {
  const payload = await verifySessionCore(token, secret);
  if (!payload) return null;
  // Demo sessions carry their own 1h expiry and map to no real user row —
  // the revocation store has nothing to say about them.
  if (payload.demo) return payload;
  // Fail-closed: a revocation state that cannot be determined (store down,
  // nothing cached in this process) rejects the session instead of
  // silently accepting a possibly revoked one.
  try {
    if (!(await isSessionVersionValid(payload.uid, payload.v))) return null;
    if (payload.sid) {
      // Revoked, or idle longer than the limit (SUBSUMIO_SESSION_IDLE_HOURS).
      if (await isSessionRevokedOrIdle(payload.uid, payload.sid)) return null;
      void touchSession(payload.uid, payload.sid);
    }
  } catch {
    return null;
  }
  return payload;
}
