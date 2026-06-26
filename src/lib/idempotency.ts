/**
 * Generic webhook idempotency store — eliminates the repeated
 * "Postgres-backed, in-memory fallback" dedup pattern across webhook handlers.
 *
 * Each instance creates its own schema + check/mark functions.
 * Used by: WhatsApp dedup, DocuSign events, Stripe events, generic webhook incoming.
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { logger } from "@/lib/logger";

const log = logger("idempotency");

export interface IdempotencyStore {
  /** Returns true if the event ID has already been processed. */
  isProcessed(id: string): Promise<boolean>;
  /** Marks an event ID as processed. */
  markProcessed(id: string, ...extra: (string | null)[]): Promise<void>;
}

/**
 * Create a Postgres-backed idempotency store with in-memory fallback.
 *
 * @param tableName Postgres table name.
 * @param extraColumns Optional extra columns for the DDL (e.g. `"event_type text"`).
 * @param opts Optional config: primaryKeyColumn, maxInMemory, ttlMs.
 *
 * @example
 * const store = createIdempotencyStore("subsumio_stripe_events", [
 *   "event_type text"
 * ]);
 * if (await store.isProcessed(eventId)) return;
 * await store.markProcessed(eventId, eventType);
 */
export function createIdempotencyStore(
  tableName: string,
  extraColumns: string[] = [],
  opts?: {
    primaryKeyColumn?: string;
    maxInMemory?: number;
    ttlMs?: number;
  }
): IdempotencyStore {
  const pkCol = opts?.primaryKeyColumn ?? "event_id";
  const maxInMemory = opts?.maxInMemory ?? 5_000;
  const ttlMs = opts?.ttlMs ?? 30 * 60 * 1000;
  const columnDefs = [`${pkCol} text PRIMARY KEY`, ...extraColumns].join(",\n    ");
  const ensureSchema = createSchemaInit(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      ${columnDefs},
      processed_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const memory = new Map<string, number>();

  async function isProcessed(id: string): Promise<boolean> {
    const pool = getSharedPgPool();
    if (pool) {
      try {
        await ensureSchema();
        const result = await pool.query<{ exists: boolean }>(
          `SELECT 1 AS exists FROM ${tableName} WHERE ${pkCol} = $1`,
          [id]
        );
        return result.rows.length > 0;
      } catch (err) {
        log.error("check failed", {
          table: tableName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const now = Date.now();
    const seen = memory.get(id);
    return Boolean(seen && now - seen < ttlMs);
  }

  async function markProcessed(id: string, ...extra: (string | null)[]): Promise<void> {
    const pool = getSharedPgPool();
    if (pool) {
      try {
        await ensureSchema();
        const extraCols = extraColumns.map((c) => c.split(/\s+/)[0]).filter((c) => c !== "");
        if (extraCols.length > 0 && extra.length > 0) {
          const cols = [pkCol, ...extraCols].join(", ");
          const params = extra.map((_, i) => `$${i + 2}`).join(", ");
          await pool.query(
            `INSERT INTO ${tableName} (${cols}) VALUES ($1, ${params})
             ON CONFLICT (${pkCol}) DO NOTHING`,
            [id, ...extra]
          );
        } else {
          await pool.query(
            `INSERT INTO ${tableName} (${pkCol}) VALUES ($1)
             ON CONFLICT (${pkCol}) DO NOTHING`,
            [id]
          );
        }
        return;
      } catch (err) {
        log.error("mark failed", {
          table: tableName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    memory.set(id, Date.now());
    if (memory.size > maxInMemory) {
      const now = Date.now();
      for (const [key, ts] of memory) {
        if (now - ts > ttlMs) memory.delete(key);
      }
    }
  }

  return { isProcessed, markProcessed };
}
