/**
 * The BM25 keyword path (Postgres + pg_search) applies the same date filters
 * as searchKeyword — above all the as-of date that keeps statute pages to the
 * version in force on that day. When pg_search is missing, the BM25 path
 * falls back once and then goes straight to searchKeyword (no failing
 * round-trip and error log per query).
 */
import { describe, expect, test } from "bun:test";
import { PostgresEngine, buildPageDateClauses } from "../src/core/postgres-engine.ts";

function engineCapturing(onQuery: (sql: string, params: unknown[]) => unknown[]) {
  const engine = new PostgresEngine();
  const tx = {
    unsafe: async (sql: string, params?: unknown[]) => onQuery(sql, params ?? []),
  };
  (engine as unknown as Record<string, unknown>)._sql = {
    begin: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return engine;
}

describe("searchKeywordBM25 date filters", () => {
  test("as-of, after and before dates reach the SQL with their values", async () => {
    let captured = { sql: "", params: [] as unknown[] };
    const engine = engineCapturing((sql, params) => {
      if (sql.includes("paradedb")) captured = { sql, params };
      return [];
    });
    await engine.searchKeywordBM25("Kündigung", {
      asOfDate: "2020-01-01",
      afterDate: "2019-01-01",
      beforeDate: "2021-01-01",
    });
    expect(captured.sql).toContain("(p.frontmatter->>'version_date')::date <=");
    expect(captured.sql).toContain("COALESCE(p.updated_at, p.created_at) >");
    expect(captured.sql).toContain("COALESCE(p.updated_at, p.created_at) <");
    expect(captured.params).toContain("2020-01-01");
    expect(captured.params).toContain("2019-01-01");
    expect(captured.params).toContain("2021-01-01");
    // Every pushed parameter is referenced in the statement.
    for (let i = 1; i <= captured.params.length; i++) {
      expect(captured.sql).toContain(`$${i}`);
    }
  });

  test("the shared helper builds nothing without dates", () => {
    const params: unknown[] = [];
    expect(buildPageDateClauses({}, params)).toBe("");
    expect(params).toHaveLength(0);
  });

  test("a missing pg_search is detected once; later queries skip BM25", async () => {
    let attempts = 0;
    const engine = engineCapturing(() => {
      attempts++;
      throw new Error("function paradedb.parse(text) does not exist");
    });
    let fallbacks = 0;
    (engine as unknown as { searchKeyword: () => Promise<unknown[]> }).searchKeyword = async () => {
      fallbacks++;
      return [];
    };
    await engine.searchKeywordBM25("Frist");
    await engine.searchKeywordBM25("Frist");
    await engine.searchKeywordBM25("Frist");
    expect(attempts).toBe(1);
    expect(fallbacks).toBe(3);
  });
});
