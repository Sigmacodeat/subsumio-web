import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../../src/core/pglite-engine.ts";
import { hybridSearch } from "../../src/core/search/hybrid.ts";
import type { ChunkInput } from "../../src/core/types.ts";

let engine: PGLiteEngine;

async function embeddingDim(): Promise<number> {
  const db = (engine as unknown as {
    db: { query: (sql: string) => Promise<{ rows: Array<{ atttypmod: number }> }> };
  }).db;
  const result = await db.query(
    `SELECT atttypmod FROM pg_attribute
      WHERE attrelid = 'content_chunks'::regclass AND attname = 'embedding'`
  );
  return result.rows[0].atttypmod;
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await engine.executeRaw(
    `INSERT INTO sources (id, name, jurisdiction, config)
     VALUES ('law-at', 'law-at', 'at', '{"federated":true,"legal_reference":true}'::jsonb)
     ON CONFLICT (id) DO NOTHING`
  );
  const dim = await embeddingDim();
  const vector = new Float32Array(dim);
  vector[0] = 1;
  const versions = [
    { slug: "legal/statutes/at/abgb/p-1489--v-2020-01-01", date: "2020-01-01", text: "Verjährung historische Fassung zwanzig" },
    { slug: "legal/statutes/at/abgb/p-1489--v-2023-01-01", date: "2023-01-01", text: "Verjährung historische Fassung dreiundzwanzig" },
    { slug: "legal/statutes/at/abgb/p-1489", date: "2025-01-01", text: "Verjährung aktuelle Fassung fünfundzwanzig" },
  ];
  for (const version of versions) {
    await engine.putPage(
      version.slug,
      {
        type: "law",
        title: "§ 1489 ABGB",
        compiled_truth: version.text,
        timeline: "",
        frontmatter: { jurisdiction: "at", version_date: version.date },
      },
      { sourceId: "law-at" }
    );
    await engine.upsertChunks(
      version.slug,
      [{ chunk_index: 0, chunk_text: version.text, chunk_source: "compiled_truth", embedding: vector, token_count: 4 }] satisfies ChunkInput[],
      { sourceId: "law-at" }
    );
  }
}, 60_000);

afterAll(async () => {
  await engine.disconnect();
});

describe("historical legal retrieval (PGLite E2E)", () => {
  test("as_of selects the latest version not newer than the cutoff", async () => {
    const results = await hybridSearch(engine, "Verjährung historische Fassung", {
      sourceId: "law-at",
      jurisdiction: "at",
      asOfDate: "2024-01-01",
      expansion: false,
      limit: 10,
    });
    const slugs = results.map((result) => result.slug);
    expect(slugs).toContain("legal/statutes/at/abgb/p-1489--v-2023-01-01");
    expect(slugs).not.toContain("legal/statutes/at/abgb/p-1489");
    expect(slugs).not.toContain("legal/statutes/at/abgb/p-1489--v-2020-01-01");
  }, 30_000);
});
