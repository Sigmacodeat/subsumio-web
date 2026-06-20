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

import { signSession, getAuthSecret, SESSION_TTL_SECONDS, verifySessionCore, type SessionPayload, type SessionResult } from "./session-core";

export async function createSession(userId: string, email: string, role: SessionPayload["role"]): Promise<SessionResult> {
  const minVersion = await getMinRevocationVersion(userId);
  const version = minVersion + 1;
  const token = await signSession({ uid: userId, email, role }, getAuthSecret(), SESSION_TTL_SECONDS, version);
  return {
    token,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    },
  };
}

// Revocation store — Node only (Postgres-backed in production).
import { revokeAllSessions, isSessionVersionValid, getMinRevocationVersion } from "./revocation-store";

export { revokeAllSessions, isSessionVersionValid };

/** Full session verification including revocation check (Node only). */
export async function verifySession(
  token: string | undefined | null,
  secret?: string,
): Promise<SessionPayload | null> {
  const payload = await verifySessionCore(token, secret);
  if (!payload) return null;
  if (!(await isSessionVersionValid(payload.uid, payload.v))) return null;
  return payload;
}
