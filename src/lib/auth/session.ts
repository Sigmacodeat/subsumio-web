// Session tokens: HMAC-SHA256-signed payloads via Web Crypto.
// Edge-runtime-safe (works in middleware AND Node route handlers).
// Format: base64url(JSON payload) + "." + base64url(signature)

export interface SessionPayload {
  uid: string;
  email: string;
  role: import("./store").KanzleiRole;
  exp: number; // unix seconds
  /** Session version for revocation. Incremented on password change / logout-all. */
  v?: number;
}

export const SESSION_COOKIE = "sb_session";
export const REF_COOKIE = "sb_ref";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600; // 30 days

export interface SessionResult {
  token: string;
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "strict" | "lax" | "none";
    maxAge: number;
    path: string;
  };
}

export async function createSession(userId: string, email: string, role: SessionPayload["role"]): Promise<SessionResult> {
  const token = await signSession({ uid: userId, email, role });
  return {
    token,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: "/",
    },
  };
}

const encoder = new TextEncoder();

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  // Hardened: always throw in production, and also when VERCEL_ENV is production
  // to catch misconfigured preview deployments.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return "sigmabrain-dev-secret-change-me";
}

export function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? encoder.encode(data) : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

export async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(
  payload: Omit<SessionPayload, "exp" | "v">,
  secret: string = getAuthSecret(),
  ttlSeconds: number = SESSION_TTL_SECONDS,
  version: number = 1,
): Promise<string> {
  const full: SessionPayload = { ...payload, v: version, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(JSON.stringify(full));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** Session-Revocation: a map of userId → minimum accepted version.
 *  In production this should be backed by Redis/Postgres. In-memory is
 *  a pragmatic start for single-node / dev. */
const revokedVersions = new Map<string, number>();

/** Invalidate all sessions for a user (e.g. after password change). */
export function revokeAllSessions(userId: string): void {
  const current = revokedVersions.get(userId) ?? 0;
  revokedVersions.set(userId, current + 1);
}

/** Check if a session version is still valid. */
export function isSessionVersionValid(userId: string, version?: number): boolean {
  const minVersion = revokedVersions.get(userId);
  if (!minVersion) return true;
  return (version ?? 0) >= minVersion;
}

export async function verifySession(
  token: string | undefined | null,
  secret?: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const authSecret = secret ?? getAuthSecret();
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  try {
    const key = await hmacKey(authSecret);
    const sigBin = b64urlDecode(sigPart);
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(b64urlDecode(body)) as SessionPayload;
    if (!payload.uid || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!isSessionVersionValid(payload.uid, payload.v)) return null;
    return payload;
  } catch {
    return null;
  }
}
