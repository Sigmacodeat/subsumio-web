/**
 * Personal calendar subscription (Kalender-Abo).
 *
 * Outlook, Apple Kalender and Google Kalender fetch a subscribed calendar
 * without a browser session, so the signed-in .ics route could only ever be
 * downloaded once by hand. A subscription therefore carries its own secret in
 * the URL: `…/api/calendar/<userId>.<secret>/fristen.ics`.
 *
 * Only the SHA-256 of the secret is stored, the same way backup codes are
 * handled — a stolen database row does not yield a working feed URL. The link
 * can be revoked, which invalidates it everywhere at once.
 */

/** `<userId>.<secret>` — the user id keeps the lookup a single read. */
export interface ParsedFeedToken {
  userId: string;
  secret: string;
}

export function createFeedSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildFeedToken(userId: string, secret: string): string {
  return `${userId}.${secret}`;
}

export function parseFeedToken(token: string): ParsedFeedToken | null {
  const value = token.trim();
  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) return null;
  const userId = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) return null;
  if (!/^[a-f0-9]{32,128}$/.test(secret)) return null;
  return { userId, secret };
}

export async function hashFeedSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex digests of equal length. */
export function secretsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The absolute URL a calendar client subscribes to. */
export function feedUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/api/calendar/${encodeURIComponent(token)}/fristen.ics`;
}
