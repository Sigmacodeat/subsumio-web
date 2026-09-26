/**
 * Persistent retry queue for outgoing webhooks.
 *
 * A delivery that fails transiently (network error, timeout, 408/429/5xx) is
 * stored here and retried by the `webhook-retry` cron with exponential
 * backoff until it succeeds or MAX_WEBHOOK_ATTEMPTS is reached. The event
 * body can carry client data (e.g. an enquiry summary), so it is stored
 * encrypted. Without a Postgres pool (dev) nothing is persisted and the
 * caller only logs the failure.
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { decrypt, encrypt } from "@/lib/encryption";

/** Attempts in total, the first (immediate) delivery included. */
export const MAX_WEBHOOK_ATTEMPTS = 5;

/** Wait before retry n (n = attempts made so far): 1 min, 5 min, 30 min, 2 h. */
const BACKOFF_SECONDS = [60, 5 * 60, 30 * 60, 2 * 60 * 60];

export function webhookBackoffSeconds(attemptsMade: number): number {
  const i = Math.min(Math.max(attemptsMade, 1), BACKOFF_SECONDS.length) - 1;
  return BACKOFF_SECONDS[i]!;
}

/** How long a claimed row stays invisible to a parallel cron run. */
const LEASE_SECONDS = 10 * 60;

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_webhook_deliveries (
    id text PRIMARY KEY,
    brain_id text NOT NULL,
    webhook_id text NOT NULL,
    event text NOT NULL,
    body_enc text NOT NULL,
    attempts integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'pending',
    last_error text,
    next_attempt_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_due
    ON subsumio_webhook_deliveries (status, next_attempt_at);
  CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook
    ON subsumio_webhook_deliveries (brain_id, webhook_id);
`);

export interface QueuedDelivery {
  id: string;
  brainId: string;
  webhookId: string;
  event: string;
  body: string;
  attempts: number;
}

function genId(): string {
  return `whd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Stores a failed first delivery for retry. False when nothing could be persisted. */
export async function enqueueWebhookRetry(input: {
  brainId: string;
  webhookId: string;
  event: string;
  body: string;
  error: string;
}): Promise<boolean> {
  const pool = getSharedPgPool();
  if (!pool) return false;
  await ensureSchema();
  const bodyEnc = await encrypt(input.body);
  if (!bodyEnc) return false;
  await pool.query(
    `INSERT INTO subsumio_webhook_deliveries
       (id, brain_id, webhook_id, event, body_enc, attempts, status, last_error, next_attempt_at)
     VALUES ($1, $2, $3, $4, $5, 1, 'pending', $6, now() + make_interval(secs => $7))`,
    [
      genId(),
      input.brainId,
      input.webhookId,
      input.event,
      bodyEnc,
      input.error.slice(0, 500),
      webhookBackoffSeconds(1),
    ]
  );
  return true;
}

/**
 * Claims up to `limit` due deliveries. Claimed rows are leased (pushed into
 * the future) so a parallel run does not deliver them twice.
 */
export async function claimDueWebhookDeliveries(limit = 50): Promise<QueuedDelivery[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];
  await ensureSchema();
  const { rows } = await pool.query(
    `UPDATE subsumio_webhook_deliveries
        SET next_attempt_at = now() + make_interval(secs => $2), updated_at = now()
      WHERE id IN (
        SELECT id FROM subsumio_webhook_deliveries
         WHERE status = 'pending' AND next_attempt_at <= now()
         ORDER BY next_attempt_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING id, brain_id, webhook_id, event, body_enc, attempts`,
    [limit, LEASE_SECONDS]
  );
  const out: QueuedDelivery[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    const body = await decrypt(String(r.body_enc)).catch(() => null);
    if (body === null) {
      await finishWebhookDelivery(String(r.id), "dropped", "Ereignis nicht mehr lesbar");
      continue;
    }
    out.push({
      id: String(r.id),
      brainId: String(r.brain_id),
      webhookId: String(r.webhook_id),
      event: String(r.event),
      body,
      attempts: Number(r.attempts),
    });
  }
  return out;
}

/** Final state for a queued delivery (delivered, or dropped because the webhook is gone). */
export async function finishWebhookDelivery(
  id: string,
  status: "delivered" | "dropped",
  note?: string
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;
  await pool.query(
    `UPDATE subsumio_webhook_deliveries
        SET status = $2, last_error = COALESCE($3, last_error), updated_at = now()
      WHERE id = $1`,
    [id, status, note ?? null]
  );
}

/** Records another failed attempt: schedules the next one or gives up. */
export async function recordWebhookRetryFailure(
  id: string,
  attemptsMade: number,
  error: string,
  retryable: boolean
): Promise<"pending" | "exhausted"> {
  const pool = getSharedPgPool();
  const exhausted = !retryable || attemptsMade >= MAX_WEBHOOK_ATTEMPTS;
  if (!pool) return exhausted ? "exhausted" : "pending";
  await pool.query(
    `UPDATE subsumio_webhook_deliveries
        SET attempts = $2, last_error = $3, status = $4,
            next_attempt_at = now() + make_interval(secs => $5), updated_at = now()
      WHERE id = $1`,
    [
      id,
      attemptsMade,
      error.slice(0, 500),
      exhausted ? "exhausted" : "pending",
      webhookBackoffSeconds(attemptsMade),
    ]
  );
  return exhausted ? "exhausted" : "pending";
}

export interface WebhookDeliveryStatus {
  pending: number;
  exhausted: number;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** Per-webhook delivery state of one firm, for the settings page. */
export async function getWebhookDeliveryStatus(
  brainId: string
): Promise<Record<string, WebhookDeliveryStatus>> {
  const pool = getSharedPgPool();
  if (!pool || !brainId) return {};
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT webhook_id,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'exhausted')::int AS exhausted,
            (ARRAY_AGG(last_error ORDER BY updated_at DESC)
               FILTER (WHERE status IN ('pending', 'exhausted')))[1] AS last_error,
            MAX(updated_at) FILTER (WHERE status IN ('pending', 'exhausted')) AS last_error_at
       FROM subsumio_webhook_deliveries
      WHERE brain_id = $1 AND created_at > now() - interval '14 days'
      GROUP BY webhook_id`,
    [brainId]
  );
  const out: Record<string, WebhookDeliveryStatus> = {};
  for (const r of rows as Array<Record<string, unknown>>) {
    out[String(r.webhook_id)] = {
      pending: Number(r.pending ?? 0),
      exhausted: Number(r.exhausted ?? 0),
      lastError: r.last_error ? String(r.last_error) : null,
      lastErrorAt: r.last_error_at ? new Date(String(r.last_error_at)).toISOString() : null,
    };
  }
  return out;
}
