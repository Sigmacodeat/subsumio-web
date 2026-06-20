/**
 * Lightweight migration runner — no external dependencies.
 *
 * Migrations are plain SQL files in server/migrations/*.sql, named:
 *   001_initial.sql
 *   002_add_audit_table.sql
 *   etc.
 *
 * The runner tracks applied migrations in a `_migrations` table.
 * Run via: npx tsx src/lib/migrate.ts
 */

import { getSharedPgPool } from "@/lib/auth/store";

export interface Migration {
  id: number;
  name: string;
  applied_at: string;
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) throw new Error("No database configured — migrations require Postgres.");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function getAppliedMigrations(): Promise<Migration[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];
  await ensureMigrationsTable();
  const { rows } = await pool.query<Migration>(
    "SELECT id, name, applied_at::text as applied_at FROM _migrations ORDER BY id ASC",
  );
  return rows;
}

export async function applyMigration(id: number, name: string, sql: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) throw new Error("No database configured.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO _migrations (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [id, name],
    );
    await client.query("COMMIT");
    console.log(`[migrate] applied #${id} ${name}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(migrations: { id: number; name: string; sql: string }[]): Promise<void> {
  const applied = await getAppliedMigrations();
  const appliedIds = new Set(applied.map((m) => m.id));

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue;
    await applyMigration(migration.id, migration.name, migration.sql);
  }

  console.log(`[migrate] ${migrations.length - appliedIds.size} new, ${appliedIds.size} already applied.`);
}
