// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://localhost:3001",
  engineHeadersForBrain: vi.fn((brainId: string) => ({ "x-subsumio-source": brainId })),
}));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: vi.fn(() => null),
  getStore: vi.fn(() => ({
    list: vi.fn(async () => []),
  })),
  getOrgStore: vi.fn(() => ({
    getById: vi.fn(async () => null),
  })),
}));

vi.mock("@/lib/schema-init", () => ({
  createSchemaInit: vi.fn(() => async () => {}),
}));

import { fetchPages, getRecipientsByBrain, createDailyDedup } from "./cron-utils";

describe("fetchPages", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("returns empty array on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const result = await fetchPages("brain-1", "case", 50);
    expect(result).toEqual([]);
  });

  test("returns empty array on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("error", { status: 500 }),
    );
    const result = await fetchPages("brain-1", "case", 50);
    expect(result).toEqual([]);
  });

  test("returns parsed array on success", async () => {
    const pages = [
      { slug: "case/1", title: "Case 1", type: "case" },
      { slug: "case/2", title: "Case 2", type: "case" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(pages), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchPages("brain-1", "case", 50);
    expect(result).toHaveLength(2);
    expect(result[0].slug).toBe("case/1");
  });

  test("returns empty array when response is not an array", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bad" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await fetchPages("brain-1", "case", 50);
    expect(result).toEqual([]);
  });
});

describe("getRecipientsByBrain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns empty map when no users", async () => {
    const result = await getRecipientsByBrain();
    expect(result.size).toBe(0);
  });
});

describe("createDailyDedup", () => {
  test("returns a function", () => {
    const dedup = createDailyDedup("test_dedup_table");
    expect(typeof dedup).toBe("function");
  });

  test("returns false in dev mode (no pool)", async () => {
    const dedup = createDailyDedup("test_dedup_table");
    const result = await dedup("brain-1");
    expect(result).toBe(false);
  });

  test("different table names produce independent functions", () => {
    const dedup1 = createDailyDedup("table_a");
    const dedup2 = createDailyDedup("table_b");
    expect(dedup1).not.toBe(dedup2);
  });
});
