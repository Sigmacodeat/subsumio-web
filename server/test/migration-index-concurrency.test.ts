/**
 * ENG-8 guard: a new migration must not build an index on the two largest
 * tables (`pages`, `content_chunks`) with a plain `CREATE INDEX` on Postgres.
 * A plain build holds a SHARE lock and blocks every write for its duration —
 * harmless on a fresh install, an outage on a restored or second instance.
 *
 * Use the v14/v66 pattern instead: `CREATE INDEX CONCURRENTLY` with
 * `transaction: false` (or a handler that runs each statement separately and
 * pre-drops an invalid remnant), and a plain `CREATE INDEX` only for PGLite
 * via `sqlFor.pglite`.
 *
 * Migrations up to BASELINE_VERSION predate the guard (v122–v124 built such
 * indexes in-transaction and have already run in production); they are not
 * rewritten — migrations are append-only. v128 (unique body-hash index on
 * pages) did the same after the baseline and is listed explicitly; do not add
 * to that list.
 */
import { describe, expect, test } from "bun:test";
import { MIGRATIONS } from "../src/core/migrate.ts";

const BASELINE_VERSION = 124;
const EXEMPT_VERSIONS = new Set([128]);
const HOT_TABLES = ["pages", "content_chunks"];

interface MigrationLike {
  version: number;
  name: string;
  sql: string;
  sqlFor?: { postgres?: string; pglite?: string };
  transaction?: boolean;
}

/** Statements of the Postgres path of a migration that break the rule. */
export function blockingIndexBuilds(m: MigrationLike): string[] {
  const pgSql = m.sqlFor?.postgres ?? m.sql ?? "";
  const statements = pgSql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const problems: string[] = [];
  for (const stmt of statements) {
    const m1 =
      /^CREATE (?:UNIQUE )?INDEX (CONCURRENTLY )?(?:IF NOT EXISTS )?\S+ ON (?:ONLY )?(?:public\.)?"?(\w+)"?/i.exec(
        stmt
      );
    if (!m1) continue;
    const concurrent = Boolean(m1[1]);
    const table = m1[2].toLowerCase();
    if (!HOT_TABLES.includes(table)) continue;
    if (!concurrent) problems.push(`plain CREATE INDEX on ${table}: ${stmt.slice(0, 120)}`);
    else if (m.transaction !== false)
      problems.push(
        `CONCURRENTLY inside a transaction (set transaction: false): ${stmt.slice(0, 120)}`
      );
  }
  return problems;
}

describe("migration index builds on hot tables (ENG-8)", () => {
  test("no migration after the baseline builds a blocking index on pages/content_chunks", () => {
    const offenders = (MIGRATIONS as MigrationLike[])
      .filter((m) => m.version > BASELINE_VERSION && !EXEMPT_VERSIONS.has(m.version))
      .flatMap((m) => blockingIndexBuilds(m).map((p) => `v${m.version} ${m.name}: ${p}`));
    expect(offenders).toEqual([]);
  });

  test("flags a plain index build on content_chunks", () => {
    expect(
      blockingIndexBuilds({
        version: 999,
        name: "x",
        sql: "CREATE INDEX IF NOT EXISTS idx_x ON content_chunks (source_id);",
      })
    ).toHaveLength(1);
  });

  test("flags CONCURRENTLY left inside a transaction", () => {
    expect(
      blockingIndexBuilds({
        version: 999,
        name: "x",
        sql: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x ON pages (slug)",
      })
    ).toHaveLength(1);
  });

  test("accepts the v14/v66 pattern and other tables", () => {
    expect(
      blockingIndexBuilds({
        version: 999,
        name: "x",
        sql: "",
        sqlFor: {
          postgres: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x ON pages (slug)",
          pglite: "CREATE INDEX IF NOT EXISTS idx_x ON pages (slug)",
        },
        transaction: false,
      })
    ).toEqual([]);
    expect(
      blockingIndexBuilds({ version: 999, name: "x", sql: "CREATE INDEX idx_y ON small_table (a)" })
    ).toEqual([]);
  });

  test("the pre-guard migrations it exempts would be flagged", () => {
    const v124 = (MIGRATIONS as MigrationLike[]).find((m) => m.version === 124);
    expect(v124).toBeDefined();
    expect(blockingIndexBuilds(v124!).length).toBeGreaterThan(0);
  });
});
