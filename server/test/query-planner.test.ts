import { describe, it, expect } from "bun:test";
import {
  planQuery,
  executeQueryPlan,
  planAndExecute,
  validateIntent,
  validateSubQueries,
  validateSourceType,
  fallbackPlan,
  type QueryPlan,
  type SubQuery,
} from "../src/core/think/query-planner.ts";

describe("validateIntent", () => {
  it("accepts valid intents", () => {
    expect(validateIntent("statute_lookup")).toBe("statute_lookup");
    expect(validateIntent("case_analysis")).toBe("case_analysis");
    expect(validateIntent("internal_doc_search")).toBe("internal_doc_search");
    expect(validateIntent("mixed")).toBe("mixed");
  });

  it("defaults to mixed for invalid values", () => {
    expect(validateIntent("unknown")).toBe("mixed");
    expect(validateIntent(123)).toBe("mixed");
    expect(validateIntent(null)).toBe("mixed");
  });
});

describe("validateSourceType", () => {
  it("accepts valid source types", () => {
    expect(validateSourceType("statutes")).toBe("statutes");
    expect(validateSourceType("internal")).toBe("internal");
    expect(validateSourceType("all")).toBe("all");
  });

  it("defaults to all for invalid values", () => {
    expect(validateSourceType("unknown")).toBe("all");
    expect(validateSourceType(123)).toBe("all");
  });
});

describe("validateSubQueries", () => {
  it("returns fallback for empty array", () => {
    const result = validateSubQueries([], "original question");
    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("original question");
    expect(result[0].source_type).toBe("all");
  });

  it("returns fallback for non-array input", () => {
    const result = validateSubQueries("not an array", "original question");
    expect(result).toHaveLength(1);
    expect(result[0].query).toBe("original question");
  });

  it("validates and caps at 3 sub-queries", () => {
    const raw = [
      { query: "q1", source_type: "statutes" },
      { query: "q2", source_type: "internal" },
      { query: "q3", source_type: "all" },
      { query: "q4", source_type: "all" },
    ];
    const result = validateSubQueries(raw, "original");
    expect(result).toHaveLength(3);
  });

  it("uses original query when sub-query query is empty", () => {
    const raw = [{ query: "", source_type: "statutes" }];
    const result = validateSubQueries(raw, "original question");
    expect(result[0].query).toBe("original question");
  });

  it("passes through jurisdiction when provided", () => {
    const raw = [{ query: "test", source_type: "statutes", jurisdiction: "DE" }];
    const result = validateSubQueries(raw, "original", "at");
    expect(result[0].jurisdiction).toBe("de");
  });

  it("uses default jurisdiction when sub-query has none", () => {
    const raw = [{ query: "test", source_type: "statutes" }];
    const result = validateSubQueries(raw, "original", "de");
    expect(result[0].jurisdiction).toBe("de");
  });
});

describe("fallbackPlan", () => {
  it("creates a single-query plan with source_type all", () => {
    const plan = fallbackPlan({ question: "test question" });
    expect(plan.intent).toBe("mixed");
    expect(plan.sub_queries).toHaveLength(1);
    expect(plan.sub_queries[0].source_type).toBe("all");
    expect(plan.decomposed).toBe(false);
  });

  it("includes jurisdiction when provided", () => {
    const plan = fallbackPlan({ question: "test", jurisdiction: "de" });
    expect(plan.sub_queries[0].jurisdiction).toBe("de");
  });
});

describe("planQuery", () => {
  it("returns a valid plan with at least one sub-query", async () => {
    const plan = await planQuery({ question: "Was sagt § 138 BGB?" });
    expect(plan.sub_queries.length).toBeGreaterThanOrEqual(1);
    expect(plan.sub_queries[0].query.length).toBeGreaterThan(0);
    expect(["statute_lookup", "case_analysis", "internal_doc_search", "mixed"]).toContain(plan.intent);
  });
});
