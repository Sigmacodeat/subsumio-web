/**
 * list_pages frontmatter filter: a matter's pages (and single records by a
 * business key) are selected in SQL instead of the caller reading the whole
 * type. Migration v151 backs the case_slug form with a keyset index.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { operations, type OperationContext } from "../src/core/operations.ts";
import {
  UPDATED_DESC_KEYSET_ORDER,
  normalizeFrontmatterFilter,
} from "../src/core/types.ts";

let engine: PGLiteEngine;
const list_pages = operations.find((o) => o.name === "list_pages")!;

function ctx(): OperationContext {
  return {
    engine: engine as any,
    config: {} as any,
    logger: console as any,
    dryRun: false,
    remote: false,
    sourceId: "default",
  };
}

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  for (let i = 0; i < 30; i++) {
    await engine.putPage(`legal/deadlines/fm-${i}`, {
      type: "legal_deadline",
      title: `Frist ${i}`,
      compiled_truth: "x",
      frontmatter: { case_slug: i % 10 === 0 ? "legal/cases/a" : `legal/cases/other-${i}` },
    });
  }
  await engine.putPage("legal/deadlines/fm-by-title", {
    type: "legal_deadline",
    title: "Frist per Titel",
    compiled_truth: "x",
    frontmatter: { case_title: "Akte A" },
  });
  await engine.putPage("legal/invoices/inv-1", {
    type: "invoice",
    title: "RE-1",
    compiled_truth: "x",
    frontmatter: { invoice_number: "RE-2026-0001" },
  });
}, 120_000);

afterAll(async () => {
  await engine?.disconnect();
});

describe("PageFilters.frontmatterAny", () => {
  test("returns exactly the matching pages of the type", async () => {
    const pages = await engine.listPages({
      type: "legal_deadline",
      frontmatterAny: [["case_slug", "legal/cases/a"]],
      limit: 100,
    });
    expect(pages.map((p) => p.slug).sort()).toEqual([
      "legal/deadlines/fm-0",
      "legal/deadlines/fm-10",
      "legal/deadlines/fm-20",
    ]);
  });

  test("OR-combines several keys", async () => {
    const pages = await engine.listPages({
      type: "legal_deadline",
      frontmatterAny: [
        ["case_slug", "legal/cases/a"],
        ["case_title", "Akte A"],
      ],
      limit: 100,
    });
    expect(pages).toHaveLength(4);
  });

  test("rejects keys that are not plain identifiers", () => {
    expect(() => normalizeFrontmatterFilter([["case_slug' OR 1=1 --", "x"]])).toThrow();
    expect(() =>
      normalizeFrontmatterFilter(Array.from({ length: 6 }, (_, i) => [`k${i}`, "v"]))
    ).toThrow();
  });

  test("the list_pages op applies frontmatter_any and fails on an invalid filter", async () => {
    const hit = (await list_pages.handler(ctx(), {
      type: "invoice",
      frontmatter_any: { invoice_number: "RE-2026-0001" },
      include_frontmatter: true,
    })) as Array<{ slug: string }>;
    expect(hit.map((p) => p.slug)).toEqual(["legal/invoices/inv-1"]);
    const miss = (await list_pages.handler(ctx(), {
      type: "invoice",
      frontmatter_any: { invoice_number: "RE-2026-9999" },
    })) as unknown[];
    expect(miss).toHaveLength(0);
    await expect(
      list_pages.handler(ctx(), { type: "invoice", frontmatter_any: { "bad key": "x" } })
    ).rejects.toThrow();
    await expect(
      list_pages.handler(ctx(), { type: "invoice", frontmatter_any: { invoice_number: { a: 1 } } })
    ).rejects.toThrow();
  });

  test("migration v151 index serves the case_slug filter in keyset order", async () => {
    const idx = await engine.executeRaw<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'pages' AND indexname = 'pages_list_case_slug_keyset_idx'`
    );
    expect(idx).toHaveLength(1);
    await engine.executeRaw(`SET enable_seqscan = off`);
    try {
      const plan = await engine.executeRaw<Record<string, string>>(
        `EXPLAIN SELECT p.* FROM pages p
          WHERE p.source_id = 'default' AND p.type = 'legal_deadline' AND p.deleted_at IS NULL
            AND (p.frontmatter->>'case_slug' = 'legal/cases/a')
          ORDER BY ${UPDATED_DESC_KEYSET_ORDER}
          LIMIT 100`
      );
      const text = plan.map((r) => Object.values(r)[0]).join("\n");
      expect(text).toContain("pages_list_case_slug_keyset_idx");
      expect(text).not.toMatch(/\bSort\b/);
    } finally {
      await engine.executeRaw(`SET enable_seqscan = on`);
    }
  });
});
