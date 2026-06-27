/**
 * WhatsApp Webhook Message Deduplication — Postgres-backed
 *
 * Uses the generic createIdempotencyStore factory.
 * Fallback: in-memory Map with TTL when no Postgres is configured.
 */

import { createIdempotencyStore } from "@/lib/idempotency";

const store = createIdempotencyStore(
  "subsumio_whatsapp_messages",
  ["from_phone_hash text", "message_type text", "status text"],
  { primaryKeyColumn: "message_id" }
);

export async function isMessageProcessed(messageId: string): Promise<boolean> {
  return store.isProcessed(messageId);
}

export async function markMessageProcessed(
  messageId: string,
  fromPhoneHash?: string,
  messageType?: string,
  status?: string
): Promise<void> {
  await store.markProcessed(messageId, fromPhoneHash ?? null, messageType ?? null, status ?? null);
}
