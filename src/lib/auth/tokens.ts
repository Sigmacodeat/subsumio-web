// Action tokens for password reset + email verification.
//
// Same HMAC-SHA256 format as sessions (Web Crypto, edge-safe), plus:
// - `purpose` so a reset token can never act as a verify token (or vice versa)
// - `bind` ties the token to current state: reset tokens bind to a digest of
//   the CURRENT password hash (token dies the moment the password changes —
//   effectively single-use without server-side storage); verify tokens bind
//   to the email address.

import { getAuthSecret, b64url, b64urlDecode, hmacKey } from "./session";

export type TokenPurpose = "reset" | "verify" | "invite" | "2fa_challenge";

export interface ActionTokenPayload {
  uid: string;
  purpose: TokenPurpose;
  bind: string;
  exp: number; // unix seconds
}

export const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const VERIFY_TOKEN_TTL_SECONDS = 48 * 3600; // 48 hours
export const INVITE_TOKEN_TTL_SECONDS = 7 * 24 * 3600; // 7 days
export const CHALLENGE_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes

const encoder = new TextEncoder();

/** Short, stable digest of a value for token binding (not a secret itself). */
export async function bindFragment(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return b64url(digest).slice(0, 16);
}

export async function signActionToken(
  payload: Omit<ActionTokenPayload, "exp">,
  ttlSeconds: number,
  secret: string = getAuthSecret()
): Promise<string> {
  const full: ActionTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(full));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyActionToken(
  token: string | undefined | null,
  expectedPurpose: TokenPurpose,
  secret: string = getAuthSecret()
): Promise<ActionTokenPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  try {
    const key = await hmacKey(secret);
    const sigBin = b64urlDecode(sigPart);
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(b64urlDecode(body)) as ActionTokenPayload;
    if (!payload.uid || !payload.exp || !payload.bind) return null;
    if (payload.purpose !== expectedPurpose) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
