/**
 * Migration 141: one active page per RIS document and source.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await engine.executeRaw(
    `INSERT INTO sources (id, name) VALUES ('law-at-judikatur-bvwg', 'x'), ('law-at-judikatur-lvwg', 'y') ON CONFLICT DO NOTHING`
  );
});

afterAll(async () => {
  await engine.disconnect();
});

async function insert(slug: string, sourceId: string, frontmatter: Record<string, unknown>) {
  await engine.executeRaw(
    `INSERT INTO pages (slug, source_id, type, title, compiled_truth, frontmatter)
     VALUES ($1, $2, 'court_decision', $1, 'Text', $3::jsonb)`,
    [slug, sourceId, frontmatter]
  );
}

describe("pages_law_doc_id_uniq", () => {
  test("a second active page with the same RIS document number is rejected", async () => {
    await insert("legal/judikatur/at/bvwg/a", "law-at-judikatur-bvwg", { doc_id: "BVWGT_1" });
    await expect(
      insert("legal/judikatur/at/a", "law-at-judikatur-bvwg", { doc_id: "BVWGT_1" })
    ).rejects.toThrow();
  });

  test("the same number in another source is a different document", async () => {
    await insert("legal/judikatur/at/lvwg/a", "law-at-judikatur-lvwg", { doc_id: "BVWGT_1" });
  });

  test("a marked (deleted) copy does not block the active one", async () => {
    await insert("legal/judikatur/at/bvwg/b-old", "law-at-judikatur-bvwg", { doc_id: "BVWGT_2" });
    await engine.executeRaw(
      `UPDATE pages SET deleted_at = now() WHERE slug = 'legal/judikatur/at/bvwg/b-old'`
    );
    await insert("legal/judikatur/at/bvwg/b", "law-at-judikatur-bvwg", { doc_id: "BVWGT_2" });
  });

  test("pages without a document number are not constrained", async () => {
    await insert("legal/judikatur/at/bvwg/c1", "law-at-judikatur-bvwg", { title: "ohne" });
    await insert("legal/judikatur/at/bvwg/c2", "law-at-judikatur-bvwg", { title: "ohne" });
  });
});
