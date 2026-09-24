// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import {
  computeAndStoreInventory,
  latestSnapshotAt,
  readLatestInventory,
  recentWritesBySource,
} from "./corpus-inventory";

function fakePool(handler: (sql: string, params?: unknown[]) => unknown) {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => handler(sql, params)),
  } as unknown as Pool & {
    query: ReturnType<typeof vi.fn>;
  };
}

describe("computeAndStoreInventory", () => {
  it("stores the distinct document count alongside pages (migration 147)", async () => {
    const pool = fakePool((sql) => {
      if (sql.includes("FROM pages"))
        return {
          rows: [
            {
              source_id: "law-at-normen",
              pages: 150,
              documents: 12,
              statutes: 3,
              rs: 0,
              texte: 0,
              repealed: 1,
              is_decision: false,
              is_statute: true,
              last_updated: "2026-09-24T05:00:00.000Z",
            },
          ],
        };
      if (sql.includes("FROM content_chunks"))
        return { rows: [{ source_id: "law-at-normen", chunks: 400, embedded: 100 }] };
      return { rows: [] };
    });
    const rows = await computeAndStoreInventory(pool);
    expect(rows[0]).toMatchObject({
      source_id: "law-at-normen",
      pages: 150,
      documents: 12,
      chunks: 400,
    });
    const insert = pool.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO corpus_inventory_snapshot")
    );
    expect(insert).toBeDefined();
    expect(String(insert![0])).toContain("documents");
    // 4th array = documents
    expect(insert![1][3]).toEqual([12]);
  });
});

describe("readLatestInventory", () => {
  it("defaults documents to 0 for rows written before migration 147", async () => {
    const pool = fakePool(() => ({
      rows: [
        {
          source_id: "law-at",
          pages: 1,
          documents: null,
          chunks: 0,
          embedded: 0,
          last_updated: null,
          measured_at: "2026-09-24T05:00:00Z",
        },
      ],
    }));
    const rows = await readLatestInventory(pool);
    expect(rows[0].documents).toBe(0);
  });
});

describe("latestSnapshotAt", () => {
  it("returns the newest measured_at regardless of row order", () => {
    expect(
      latestSnapshotAt([
        { measured_at: "2026-09-24T05:00:00.000Z" },
        { measured_at: "2026-09-24T05:10:00.000Z" },
        { measured_at: "2026-09-24T04:50:00.000Z" },
      ])
    ).toBe("2026-09-24T05:10:00.000Z");
  });

  it("is null without rows", () => {
    expect(latestSnapshotAt([])).toBeNull();
  });
});

describe("recentWritesBySource", () => {
  it("only asks for the last 15 minutes and maps source → ISO time", async () => {
    const pool = fakePool((sql) => {
      expect(sql).toContain("interval '15 minutes'");
      return {
        rows: [{ source_id: "law-at-normen", last_write: new Date("2026-09-24T05:14:00Z") }],
      };
    });
    const m = await recentWritesBySource(pool);
    expect(m.get("law-at-normen")).toBe("2026-09-24T05:14:00.000Z");
  });
});
