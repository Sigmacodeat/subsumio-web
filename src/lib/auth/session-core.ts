// Edge-safe session primitives — no Node.js builtins, no Postgres.
// Used by middleware.ts (Edge Runtime) and re-exported by session.ts (Node).

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

const encoder = new TextEncoder();

// Edge-safe revocation cache: maps userId → { minVersion, fetchedAt }.
// Populated by fetchRevocationVersion (HTTP call to /api/internal/revocation-check).
// Cache TTL: 60 seconds. This limits the revocation window to 60s at the edge.
const revocationCache = new Map<string, { minVersion: number; fetchedAt: number }>();
const REVOCATION_CACHE_TTL_MS = 60_000;

async function fetchRevocationVersion(userId: string): Promise<number> {
  const cached = revocationCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < REVOCATION_CACHE_TTL_MS) {
    return cached.minVersion;
  }
  // Fetch from the app's own internal endpoint (same-origin, no auth needed —
  // just returns the min version for a given user ID).
  // In edge runtime this is a simple fetch to the origin.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
    const res = await fetch(`${baseUrl}/api/internal/revocation-check?uid=${encodeURIComponent(userId)}`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (res.ok) {
      const data = await res.json() as { minVersion: number };
      revocationCache.set(userId, { minVersion: data.minVersion ?? 0, fetchedAt: now });
      return data.minVersion ?? 0;
    }
  } catch {
    // Network error — assume valid (fail-open for availability)
  }
  return 0;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production.");
  }
  return "subsumio-dev-secret-change-me";
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

/** Like b64urlDecode but returns a proper UTF-8 string (for JSON payloads). */
export function b64urlDecodeUtf8(input: string): string {
  const bin = b64urlDecode(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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

/**
 * Verify session signature and expiry — Edge-safe.
 * Includes a cached revocation check (60s TTL) via internal HTTP endpoint.
 * For full verification without cache, use verifySession from session.ts (Node only).
 */
export async function verifySessionCore(
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
    const payload = JSON.parse(b64urlDecodeUtf8(body)) as SessionPayload;
    if (!payload.uid || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    // Edge-safe revocation check (cached, best-effort)
    const minVersion = await fetchRevocationVersion(payload.uid);
    if (minVersion > 0 && (payload.v ?? 0) <= minVersion) return null;
    return payload;
  } catch {
    return null;
  }
}
