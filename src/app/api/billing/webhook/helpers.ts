import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

// In-memory fallback for dev mode (no Postgres)
const processedEventIds = new Set<string>();
const MAX_INMEMORY_EVENTS = 1000;

const ensureStripeEventsSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_stripe_events (
    event_id text PRIMARY KEY,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
  );
`);

/**
 * Read-only check: returns true if the event was already successfully processed.
 * Does NOT insert — use markEventProcessed after the handler succeeds.
 */
export async function isDuplicateEvent(eventId: string, _eventType: string): Promise<boolean> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureStripeEventsSchema();
      const result = await pool.query<{ exists: boolean }>(
        `SELECT 1 FROM subsumio_stripe_events WHERE event_id = $1`,
        [eventId]
      );
      return result.rows.length > 0;
    } catch (err) {
      console.error(
        `[stripe-webhook] idempotency check failed: ${err instanceof Error ? err.message : String(err)}`
      );
      // Non-fatal — proceed without idempotency (dev mode)
    }
  }
  // In-memory fallback
  return processedEventIds.has(eventId);
}

/**
 * Mark an event as successfully processed. Called AFTER the handler succeeds.
 * If this fails, Stripe will retry and the handler will re-run (safe because
 * plan updates are idempotent by user_id/customer_id).
 */
export async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureStripeEventsSchema();
      await pool.query(
        `INSERT INTO subsumio_stripe_events (event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING`,
        [eventId, eventType]
      );
    } catch (err) {
      console.error(
        `[stripe-webhook] markEventProcessed failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return;
  }
  // In-memory fallback
  processedEventIds.add(eventId);
  if (processedEventIds.size > MAX_INMEMORY_EVENTS) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
}
