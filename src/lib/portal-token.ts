/**
 * Mandanten-Portal Token — stateless, zeitlich begrenzt, HMAC-SHA256-signiert.
 * Ein Token berechtigt zum LESENDEN Zugriff auf genau EINE Akte.
 * Kein Session-Cookie, kein Login-Formular. Der Link IST die Berechtigung.
 */

import { b64url, b64urlDecode, hmacKey } from "./auth/session";

const encoder = new TextEncoder();

export interface PortalTokenPayload {
  case_slug: string;
  exp: number; // unix seconds
}

export function getPortalSecret(): string {
  const secret = process.env.PORTAL_TOKEN_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PORTAL_TOKEN_SECRET must be set in production.");
  }
  // Dev fallback: ableiten aus dem Auth-Secret, aber NICHT identisch
  return "portal-dev-" + (process.env.AUTH_SECRET || "sigmabrain-dev-secret-change-me").slice(0, 32);
}

export async function signPortalToken(
  caseSlug: string,
  ttlSeconds: number = 30 * 24 * 3600, // 30 Tage
): Promise<string> {
  const payload: PortalTokenPayload = {
    case_slug: caseSlug,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const key = await hmacKey(getPortalSecret());
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${b64url(sig)}`;
}

// NOTE: In-memory revocation list. For production with multiple server
// instances or serverless, replace with Redis / DB-backed store.
const REVOKED = new Set<string>();

export async function verifyPortalToken(
  token: string | undefined | null,
): Promise<PortalTokenPayload | null> {
  if (!token) return null;
  if (REVOKED.has(token)) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  try {
    const key = await hmacKey(getPortalSecret());
    const sigBin = b64urlDecode(sigPart);
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(b64urlDecode(body)) as PortalTokenPayload;
    if (!payload.case_slug || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function revokePortalToken(token: string): void {
  REVOKED.add(token);
}

export function isPortalTokenRevoked(token: string): boolean {
  return REVOKED.has(token);
}
