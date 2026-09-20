import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { titleOf, writeIngestLog } from "../scripts/ingest-log.ts";

let engine: PGLiteEngine;
beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
});
afterAll(async () => engine.disconnect());

describe("corpus ingest log", () => {
  test("events land as rows; detail is a JSON object, not a double-encoded string", async () => {
    await writeIngestLog(engine, [
      {
        source_id: "law-at-normen",
        doc_id: "NOR1",
        slug: "legal/statutes/at/abgb/p-1",
        title: "ABGB",
        action: "added",
        origin: "test",
        detail: { ris_changed: "2026-09-19" },
      },
      {
        source_id: "law-at-judikatur-vwgh",
        doc_id: "JWT_1",
        slug: "legal/judikatur/at/vwgh/x",
        action: "updated",
        origin: "test",
      },
    ]);
    const rows = (await engine.executeRaw(
      `SELECT source_id, doc_id, action, jsonb_typeof(detail) AS t, detail->>'ris_changed' AS rc FROM corpus_ingest_log ORDER BY id`
    )) as Array<Record<string, string>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      doc_id: "NOR1",
      action: "added",
      t: "object",
      rc: "2026-09-19",
    });
    expect(rows[1]).toMatchObject({ doc_id: "JWT_1", action: "updated", t: "object" });
  });

  test("an invalid action is rejected by the table, and the writer does not throw", async () => {
    await writeIngestLog(engine, [
      { source_id: "x", doc_id: null, slug: "s", action: "bogus" as any, origin: "test" },
    ]);
    const [{ n }] = (await engine.executeRaw(
      `SELECT count(*)::int AS n FROM corpus_ingest_log WHERE slug = 's'`
    )) as Array<{ n: number }>;
    expect(n).toBe(0);
  });

  test("titleOf reads the frontmatter title", () => {
    expect(
      titleOf('---\nschema_version: 1\ntitle: "Allgemeines bürgerliches Gesetzbuch"\n---\nText')
    ).toBe("Allgemeines bürgerliches Gesetzbuch");
    expect(titleOf("kein frontmatter")).toBeNull();
  });
});
