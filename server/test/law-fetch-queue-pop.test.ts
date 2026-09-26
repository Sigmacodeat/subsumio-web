/**
 * The pipeline takes the head of law_fetch_queue atomically: entries the
 * Ops route appends afterwards survive, and the key disappears only while
 * the list is empty.
 */
import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { LAW_FETCH_QUEUE_LEN_SQL, LAW_FETCH_QUEUE_POP_SQL } from "../scripts/corpus-pipeline.ts";

// Same upsert as src/app/api/admin/corpus-law-coverage/refetch/route.ts.
const APPEND = `INSERT INTO pipeline_config (key, value, updated_at)
  VALUES ('law_fetch_queue', jsonb_build_array($1::jsonb), now())
  ON CONFLICT (key) DO UPDATE SET value = pipeline_config.value || jsonb_build_array($1::jsonb), updated_at = now()`;

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE TABLE pipeline_config (
    key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  return db;
}

async function pop(db: PGlite): Promise<unknown> {
  const results = await db.exec(LAW_FETCH_QUEUE_POP_SQL);
  const row = results.find((r) => r.rows.length > 0)?.rows[0] as
    | Record<string, unknown>
    | undefined;
  return row ? Object.values(row)[0] : null;
}

async function queue(db: PGlite): Promise<unknown> {
  const r = await db.query<{ value: unknown }>(
    "SELECT value FROM pipeline_config WHERE key = 'law_fetch_queue'"
  );
  return r.rows[0]?.value ?? null;
}

describe("law_fetch_queue pop", () => {
  test("takes the head; an entry appended after the pop is kept", async () => {
    const db = await setup();
    await db.query(APPEND, [JSON.stringify({ source: "law-at-normen", gnr: "10001" })]);
    await db.query(APPEND, [JSON.stringify({ source: "law-at-normen", gnr: "10002" })]);
    expect(await pop(db)).toEqual({ source: "law-at-normen", gnr: "10001" });
    await db.query(APPEND, [JSON.stringify({ source: "law-at-normen", gnr: "10003" })]);
    expect(await queue(db)).toEqual([
      { source: "law-at-normen", gnr: "10002" },
      { source: "law-at-normen", gnr: "10003" },
    ]);
    await db.close();
  });

  test("popping the last entry removes the key; a later append starts a new list", async () => {
    const db = await setup();
    await db.query(APPEND, [JSON.stringify({ source: "law-at-normen", gnr: "10001" })]);
    await pop(db);
    expect(await queue(db)).toBeNull();
    await db.query(APPEND, [JSON.stringify({ source: "law-at-normen", gnr: "10009" })]);
    expect(await queue(db)).toEqual([{ source: "law-at-normen", gnr: "10009" }]);
    const len = await db.query<Record<string, number>>(LAW_FETCH_QUEUE_LEN_SQL);
    expect(Object.values(len.rows[0]!)[0]).toBe(1);
    await db.close();
  });

  test("an empty queue pops nothing", async () => {
    const db = await setup();
    expect(await pop(db)).toBeNull();
    await db.close();
  });
});
