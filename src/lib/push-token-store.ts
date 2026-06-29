/**
 * Push token store — persists device tokens for APNs/FCM push notifications.
 *
 * Uses Postgres when available (getSharedPgPool), falls back to in-memory
 * Map in dev mode. Token uniqueness is enforced per (user_id, device_id).
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

export interface PushTokenEntry {
  id: string;
  userId: string;
  token: string;
  platform: "ios" | "android";
  deviceId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_push_tokens (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    token text NOT NULL,
    platform text NOT NULL DEFAULT 'ios',
    device_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    UNIQUE (user_id, device_id)
  );
  CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON subsumio_push_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON subsumio_push_tokens (token);
`);

// Dev-mode fallback
const memoryStore = new Map<string, PushTokenEntry>();

function genId(): string {
  return `ptk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function registerPushToken(
  userId: string,
  token: string,
  platform: "ios" | "android",
  deviceId?: string
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    const key = `${userId}|${deviceId ?? "default"}`;
    memoryStore.set(key, {
      id: genId(),
      userId,
      token,
      platform,
      deviceId: deviceId ?? null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });
    return;
  }

  await ensureSchema();
  const id = genId();
  await pool.query(
    `INSERT INTO subsumio_push_tokens (id, user_id, token, platform, device_id, created_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET token = EXCLUDED.token, platform = EXCLUDED.platform, last_used_at = now()`,
    [id, userId, token, platform, deviceId ?? null]
  );
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    for (const [key, entry] of memoryStore) {
      if (entry.userId === userId && entry.token === token) {
        memoryStore.delete(key);
      }
    }
    return;
  }

  await ensureSchema();
  await pool.query(`DELETE FROM subsumio_push_tokens WHERE user_id = $1 AND token = $2`, [
    userId,
    token,
  ]);
}

export async function getPushTokensForUser(userId: string): Promise<PushTokenEntry[]> {
  const pool = getSharedPgPool();
  if (!pool) {
    return Array.from(memoryStore.values()).filter((e) => e.userId === userId);
  }

  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT * FROM subsumio_push_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows as PushTokenEntry[];
}

export async function getPushTokensForBrain(_brainId: string): Promise<PushTokenEntry[]> {
  const pool = getSharedPgPool();
  if (!pool) {
    return Array.from(memoryStore.values());
  }

  await ensureSchema();
  // Join with users via brain_id — but we don't have a direct FK.
  // Instead, query all tokens and let the caller filter by recipient.
  // For now, return all tokens (the caller maps brain→users→tokens).
  const { rows } = await pool.query(
    `SELECT * FROM subsumio_push_tokens ORDER BY created_at DESC LIMIT 500`
  );
  return rows as PushTokenEntry[];
}
