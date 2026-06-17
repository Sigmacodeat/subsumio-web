/**
 * API-Key Management für Drittanbieter-Integration (Zapier, beA, etc.)
 *
 * Keys: sk_live_... (32 bytes random, base64url)
 * Metadata: name, scopes, createdAt, lastUsedAt, active
 */

import { b64url } from "@/lib/auth/session";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string; // z.B. "sk_live_abc12"
  secretHash: string; // SHA-256 des vollen Keys
  scopes: string[];
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
  createdBy?: string;
}

const API_KEY_PREFIX = "sk_live_";

export function generateApiKey(): { key: string; id: string } {
  const id = crypto.randomUUID();
  const random = crypto.getRandomValues(new Uint8Array(32));
  const key = `${API_KEY_PREFIX}${b64url(random.buffer.slice(random.byteOffset, random.byteOffset + random.byteLength) as ArrayBuffer).replace(/_/g, "").replace(/-/g, "").slice(0, 32)}`;
  return { key, id };
}

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(key));
  return b64url(hash);
}

export function getApiKeyPrefix(key: string): string {
  return key.slice(0, 16);
}

export function maskApiKey(key: string): string {
  if (key.length <= 12) return "***";
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}
