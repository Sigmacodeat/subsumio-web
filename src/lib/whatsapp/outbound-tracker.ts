/**
 * Outbound WhatsApp Message Tracker — maps Graph API message IDs to brain IDs.
 *
 * When a message is sent outbound, the caller records the mapping.
 * When a status webhook arrives, processMessageStatuses looks up the brain ID
 * so the status update is stored in the correct tenant's brain.
 *
 * Postgres-backed with in-memory fallback (same pattern as idempotency store).
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";

const log = logger("whatsapp-outbound-tracker");

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_whatsapp_outbound (
    message_id text PRIMARY KEY,
    brain_id text NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT now()
  )
`);

const memory = new Map<string, string>();
const MAX_MEMORY = 10_000;

/**
 * Record that an outbound message was sent from a specific brain/tenant.
 * Must be called after every successful send.
 */
export async function recordOutboundMessage(messageId: string, brainId: string): Promise<void> {
  if (!messageId || !brainId) return;

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureSchema();
      await pool.query(
        `INSERT INTO subsumio_whatsapp_outbound (message_id, brain_id)
         VALUES ($1, $2)
         ON CONFLICT (message_id) DO NOTHING`,
        [messageId, brainId]
      );
      return;
    } catch (err) {
      log.error("record failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  memory.set(messageId, brainId);
  if (memory.size > MAX_MEMORY) {
    const firstKey = memory.keys().next().value;
    if (firstKey) memory.delete(firstKey);
  }
}

/**
 * Look up the brain ID that sent the given outbound message.
 * Returns undefined if the message ID is unknown (e.g. pre-dates the tracker
 * or the message was sent by a legacy code path).
 */
export async function getOutboundBrainId(messageId: string): Promise<string | undefined> {
  if (!messageId) return undefined;

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureSchema();
      const result = await pool.query<{ brain_id: string }>(
        `SELECT brain_id FROM subsumio_whatsapp_outbound WHERE message_id = $1`,
        [messageId]
      );
      return result.rows[0]?.brain_id;
    } catch (err) {
      log.error("lookup failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return memory.get(messageId);
}
