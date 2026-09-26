/**
 * The web lists page newest-first by the keyset UPDATED_DESC_KEYSET_KEY.
 * Migration v150 indexes exactly that expression per (source, type), so a
 * list page reads the index in order instead of sorting the firm's pages.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import {
  UPDATED_DESC_KEYSET_KEY,
  UPDATED_DESC_KEYSET_ORDER,
  updatedDescKeysetCursor,
} from "../src/core/types.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
}, 120_000);

afterAll(async () => {
  await engine?.disconnect();
});

describe("list keyset index", () => {
  test("exists after migration", async () => {
    const rows = await engine.executeRaw<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'pages' AND indexname = 'pages_list_updated_keyset_idx'`
    );
    expect(rows).toHaveLength(1);
  });

  test("a typed list page with a cursor is served from the index without a sort", async () => {
    await engine.executeRaw(`SET enable_seqscan = off`);
    try {
      const plan = await engine.executeRaw<{ "QUERY PLAN": string }>(
        `EXPLAIN SELECT p.* FROM pages p
          WHERE p.source_id = 'default' AND p.type = 'legal_deadline' AND p.deleted_at IS NULL
            AND (${UPDATED_DESC_KEYSET_KEY}, p.id) < (${updatedDescKeysetCursor("'2026-01-01T00:00:00.000Z'")}, 100)
          ORDER BY ${UPDATED_DESC_KEYSET_ORDER}
          LIMIT 100`
      );
      const text = plan.map((r) => Object.values(r)[0]).join("\n");
      expect(text).toContain("pages_list_updated_keyset_idx");
      expect(text).not.toMatch(/\bSort\b/);
    } finally {
      await engine.executeRaw(`SET enable_seqscan = on`);
    }
  });
});
