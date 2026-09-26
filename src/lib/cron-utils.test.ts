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
    list: vi.fn(async () => mockUsers),
  })),
  getOrgStore: vi.fn(() => ({
    getById: vi.fn(async (id: string) => mockOrgs.find((o) => o.id === id) ?? null),
    list: vi.fn(async () => mockOrgs),
  })),
}));

vi.mock("@/lib/schema-init", () => ({
  createSchemaInit: vi.fn(() => async () => {}),
}));

import { fetchPages, getRecipientsByBrain, createDailyDedup } from "./cron-utils";

let mockUsers: Array<Record<string, unknown>> = [];
let mockOrgs: Array<Record<string, unknown>> = [];

describe("fetchPages", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("returns empty array on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const result = await fetchPages("brain-1", "case", 50);
    expect(result).toEqual([]);
  });

  test("returns empty array on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("error", { status: 500 }));
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
      })
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
      })
    );
    const result = await fetchPages("brain-1", "case", 50);
    expect(result).toEqual([]);
  });
});

describe("fetchPages beyond the engine's per-request cap", () => {
  beforeEach(() => vi.restoreAllMocks());

  test("reads all matters in batches and leaves out deleted records", async () => {
    const all = Array.from({ length: 450 }, (_, i) => ({
      slug: `legal/cases/${i}`,
      title: `Akte ${i}`,
      frontmatter: i === 7 ? { status: "tombstoned" } : { status: "open" },
    }));
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      calls.push(`${url.searchParams.get("limit")}@${url.searchParams.get("offset")}`);
      const limit = Number(url.searchParams.get("limit"));
      const offset = Number(url.searchParams.get("offset"));
      // The engine never returns more than 100, whatever is asked for.
      const batch = all.slice(offset, offset + Math.min(limit, 100));
      return new Response(JSON.stringify(batch), { status: 200 });
    });
    const result = await fetchPages("brain-1", "legal_case", 10_000);
    expect(calls).toEqual(["100@0", "100@100", "100@200", "100@300", "100@400"]);
    expect(result).toHaveLength(449);
    expect(result.some((p) => p.slug === "legal/cases/7")).toBe(false);
    const withDeleted = await fetchPages("brain-1", "legal_case", 10_000, {
      includeTombstoned: true,
    });
    expect(withDeleted).toHaveLength(450);
  });

  test("keeps what was read when a later batch fails", async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({ slug: `d/${i}`, title: "x" }));
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 200 }))
      .mockResolvedValueOnce(new Response("down", { status: 503 }));
    expect(await fetchPages("brain-1", "legal_deadline", 1000)).toHaveLength(100);
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

  it("does not deliver a firm brain to someone who left the firm it came from", async () => {
    mockOrgs = [{ id: "org-1", brainId: "brain_founder" }];
    mockUsers = [
      { id: "founder", brainId: "brain_founder", orgId: null },
      { id: "partner", brainId: "brain_partner", orgId: "org-1" },
      { id: "solo", brainId: "brain_solo", orgId: null },
    ];
    const result = await getRecipientsByBrain();
    expect(result.get("brain_founder")?.map((u) => u.id)).toEqual(["partner"]);
    expect(result.get("brain_solo")?.map((u) => u.id)).toEqual(["solo"]);
    mockUsers = [];
    mockOrgs = [];
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
