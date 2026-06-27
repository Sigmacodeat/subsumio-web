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

export async function isDuplicateEvent(eventId: string, eventType: string): Promise<boolean> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureStripeEventsSchema();
      const result = await pool.query<{ inserted: boolean }>(
        `INSERT INTO subsumio_stripe_events (event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id
         RETURNING (xmax = 0) AS inserted`,
        [eventId, eventType]
      );
      return !result.rows[0]?.inserted;
    } catch (err) {
      console.error(
        `[stripe-webhook] idempotency check failed: ${err instanceof Error ? err.message : String(err)}`
      );
      // Non-fatal — proceed without idempotency (dev mode)
    }
  }
  // In-memory fallback
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  if (processedEventIds.size > MAX_INMEMORY_EVENTS) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
  return false;
}
