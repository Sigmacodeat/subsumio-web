/**
 * Migration v149 (jsonb_double_encoded_rows_normalize) — behavioral test on
 * PGLite (ENG-4).
 *
 * Seeds the shape the old `JSON.stringify` → bare `$N::jsonb` writes left on
 * Postgres (a JSON string holding object/array text) and checks that the
 * migration lifts it back to an object/array, leaves genuine strings and
 * malformed text untouched, handles the nested fan-out `children_ids`, and is
 * a no-op on a second run.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { MIGRATIONS } from "../src/core/migrate.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  // Fresh brain: runs every migration including v149 on empty tables.
  await engine.initSchema();
});

afterAll(async () => {
  await engine.disconnect();
});

function v149Sql(): string {
  const m = MIGRATIONS.find((x) => x.version === 149);
  if (!m) throw new Error("v149 migration not found");
  return m.sql;
}

async function seedSource(id: string, configText: string) {
  // to_jsonb(text) produces exactly the stored shape of the old bug:
  // a JSON string scalar whose content is the object text.
  await engine.executeRaw(
    `INSERT INTO sources (id, name, config) VALUES ($1, $1, to_jsonb($2::text))
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config`,
    [id, configText]
  );
}

async function configOf(id: string) {
  const rows = await engine.executeRaw<{ t: string; v: unknown }>(
    `SELECT jsonb_typeof(config) AS t, config AS v FROM sources WHERE id = $1`,
    [id]
  );
  return rows[0];
}

describe("v149 double-encoded jsonb normalization", () => {
  test("lifts object/array text to real jsonb, leaves other strings alone", async () => {
    await seedSource("eng4-obj", '{"federated":true,"n":2}');
    await seedSource("eng4-arr", "[1,2,3]");
    await seedSource("eng4-plain", "hello");
    await seedSource("eng4-broken", "{not json");

    await engine.executeRaw(v149Sql());

    const obj = await configOf("eng4-obj");
    expect(obj.t).toBe("object");
    expect(obj.v).toEqual({ federated: true, n: 2 });
    expect((await configOf("eng4-arr")).t).toBe("array");
    expect((await configOf("eng4-plain")).t).toBe("string");
    const broken = await configOf("eng4-broken");
    expect(broken.t).toBe("string");
    expect(broken.v).toBe("{not json");
  });

  test("lifts the nested fan-out children_ids and keeps the rest of data", async () => {
    const rows = await engine.executeRaw<{ id: number }>(
      `INSERT INTO minion_jobs (name, data)
       VALUES ('eng4-parent', jsonb_build_object('children_ids', to_jsonb('[7,8]'::text), 'keep', 1))
       RETURNING id`
    );
    const id = rows[0].id;

    await engine.executeRaw(v149Sql());

    const after = await engine.executeRaw<{ t: string; data: Record<string, unknown> }>(
      `SELECT jsonb_typeof(data -> 'children_ids') AS t, data FROM minion_jobs WHERE id = $1`,
      [id]
    );
    expect(after[0].t).toBe("array");
    expect(after[0].data.children_ids).toEqual([7, 8]);
    expect(after[0].data.keep).toBe(1);
  });

  test("is idempotent", async () => {
    await seedSource("eng4-again", '{"a":1}');
    await engine.executeRaw(v149Sql());
    const first = await configOf("eng4-again");
    await engine.executeRaw(v149Sql());
    const second = await configOf("eng4-again");
    expect(second).toEqual(first);
    expect(second.t).toBe("object");
  });

  test("is registered as an idempotent migration", () => {
    const m = MIGRATIONS.find((x) => x.version === 149);
    expect(m?.idempotent).toBe(true);
  });
});
