/**
 * Generic lazy schema initializer — eliminates the repeated
 * `let xxxSchemaReady: Promise<void> | null = null; function ensureXxxSchema()` pattern.
 *
 * Each module creates its own ensureSchema instance with the DDL to run.
 * The promise is cached so the DDL executes at most once per process.
 */

import { getSharedPgPool } from "@/lib/auth/store";

/**
 * Create a cached, idempotent schema initializer.
 *
 * @param ddl SQL string (or array of SQL strings) to execute on first call.
 * @returns A function that guarantees the DDL has run. No-op when no pool is configured.
 *
 * @example
 * const ensureAuditSchema = createSchemaInit(`
 *   CREATE TABLE IF NOT EXISTS subsumio_audit_log ( ... )
 * `);
 * await ensureAuditSchema();
 */
export function createSchemaInit(ddl: string | string[]): () => Promise<void> {
  let ready: Promise<void> | null = null;

  const statements = Array.isArray(ddl) ? ddl : [ddl];

  return function ensureSchema(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        const pool = getSharedPgPool();
        if (!pool) return;
        for (const sql of statements) {
          await pool.query(sql);
        }
      })();
      // Reset on failure so transient errors don't permanently block schema init
      ready.catch(() => {
        ready = null;
      });
    }
    return ready;
  };
}
