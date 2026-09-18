/**
 * append_stage_history keeps the newest 20 entries in order. v125 shipped a
 * version that failed on every call; v140 replaces it.
 */
import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "../src/core/migrate.ts";

function migrationSql(version: number): string {
  const m = MIGRATIONS.find((x) => x.version === version);
  if (!m?.sql) throw new Error(`migration ${version} has no sql`);
  return m.sql;
}

async function historyAfter(calls: number, fnVersion: number) {
  const db = new PGlite();
  await db.exec(`CREATE TABLE pipeline_state (
    source_key text PRIMARY KEY,
    stage_history jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const fn = migrationSql(fnVersion).match(
    /CREATE OR REPLACE FUNCTION append_stage_history[\s\S]*?LANGUAGE plpgsql;/
  );
  if (!fn) throw new Error(`migration ${fnVersion} does not define append_stage_history`);
  await db.exec(fn[0]);
  await db.exec(`INSERT INTO pipeline_state (source_key) VALUES ('jud-ogh')`);
  for (let i = 1; i <= calls; i++) {
    await db.query("SELECT append_stage_history('jud-ogh', $1, 'test')", [`s${i}`]);
  }
  const r = await db.query<{ stages: string[] }>(
    "SELECT ARRAY(SELECT e->>'stage' FROM jsonb_array_elements(stage_history) e) AS stages FROM pipeline_state"
  );
  await db.close();
  return r.rows[0].stages;
}

describe("append_stage_history", () => {
  test("v140 appends in order", async () => {
    expect(await historyAfter(3, 140)).toEqual(["s1", "s2", "s3"]);
  });

  test("v140 keeps only the newest 20, oldest first", async () => {
    const stages = await historyAfter(25, 140);
    expect(stages.length).toBe(20);
    expect(stages[0]).toBe("s6");
    expect(stages[19]).toBe("s25");
  });

  test("v125 as corrected for fresh installs behaves the same", async () => {
    expect(await historyAfter(3, 125)).toEqual(["s1", "s2", "s3"]);
  });
});
