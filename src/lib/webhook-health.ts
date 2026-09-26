/**
 * Health of each outgoing webhook: consecutive deliveries that failed for
 * good (retries exhausted, or refused without retry). After
 * WEBHOOK_AUTO_DISABLE_THRESHOLD of them in a row the webhook is switched
 * off automatically (webhook-dispatch.ts) — a receiver that is gone for good
 * no longer gets firm data queued for it — and the firm's admins are told.
 * Any successful delivery resets the count; reactivation in the settings
 * resets it too.
 *
 * Without a Postgres pool (dev) nothing is counted and nothing is disabled.
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

export const WEBHOOK_AUTO_DISABLE_THRESHOLD = 10;

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_webhook_health (
    brain_id text NOT NULL,
    webhook_id text NOT NULL,
    consecutive_failures integer NOT NULL DEFAULT 0,
    last_error text,
    disabled_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brain_id, webhook_id)
  );
`);

/**
 * Counts one final failure. Returns the new count and whether THIS call
 * claimed the auto-disable (exactly one caller does, even under concurrency).
 */
export async function recordWebhookFinalFailure(
  brainId: string,
  webhookId: string,
  error: string,
  threshold = WEBHOOK_AUTO_DISABLE_THRESHOLD
): Promise<{ failures: number; disable: boolean } | null> {
  const pool = getSharedPgPool();
  if (!pool) return null;
  await ensureSchema();
  const { rows } = await pool.query(
    `INSERT INTO subsumio_webhook_health (brain_id, webhook_id, consecutive_failures, last_error)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (brain_id, webhook_id) DO UPDATE
       SET consecutive_failures = subsumio_webhook_health.consecutive_failures + 1,
           last_error = EXCLUDED.last_error, updated_at = now()
     RETURNING consecutive_failures`,
    [brainId, webhookId, error.slice(0, 500)]
  );
  const failures = Number((rows[0] as { consecutive_failures?: unknown })?.consecutive_failures);
  if (!(failures >= threshold)) return { failures, disable: false };
  // Claim the switch-off once: only the call that sets disabled_at acts.
  const claim = await pool.query(
    `UPDATE subsumio_webhook_health
        SET disabled_at = now(), updated_at = now()
      WHERE brain_id = $1 AND webhook_id = $2 AND disabled_at IS NULL
      RETURNING webhook_id`,
    [brainId, webhookId]
  );
  return { failures, disable: (claim.rowCount ?? 0) > 0 };
}

/** A delivery went through: the streak is over. */
export async function resetWebhookFailures(brainId: string, webhookId: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;
  await ensureSchema();
  await pool.query(
    `UPDATE subsumio_webhook_health
        SET consecutive_failures = 0, disabled_at = NULL, last_error = NULL, updated_at = now()
      WHERE brain_id = $1 AND webhook_id = $2 AND (consecutive_failures <> 0 OR disabled_at IS NOT NULL)`,
    [brainId, webhookId]
  );
}

/** The auto-disable could not be written: let the next failure try again. */
export async function releaseWebhookDisableClaim(
  brainId: string,
  webhookId: string
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;
  await pool.query(
    `UPDATE subsumio_webhook_health SET disabled_at = NULL, updated_at = now()
      WHERE brain_id = $1 AND webhook_id = $2`,
    [brainId, webhookId]
  );
}

/** Consecutive final failures per webhook of one firm (settings page). */
export async function getWebhookFailureStreaks(brainId: string): Promise<Record<string, number>> {
  const pool = getSharedPgPool();
  if (!pool || !brainId) return {};
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT webhook_id, consecutive_failures FROM subsumio_webhook_health WHERE brain_id = $1`,
    [brainId]
  );
  const out: Record<string, number> = {};
  for (const r of rows as Array<Record<string, unknown>>) {
    out[String(r.webhook_id)] = Number(r.consecutive_failures ?? 0);
  }
  return out;
}
