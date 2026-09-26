import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchPagesByTypeResult,
  fetchPagesByTypesResult,
  fetchStats,
  fetchRecentQueries,
} from "./cockpit";

const HEADERS = { "x-subsumio-api-key": "k" };

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => handler(String(url)))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchPagesByTypesResult", () => {
  it("maps each requested type to its result bucket", async () => {
    mockFetch((url) => {
      const type = new URL(url).searchParams.get("type");
      return Response.json([{ slug: `p-${type}`, type }]);
    });
    const out = await fetchPagesByTypesResult(HEADERS, { legal_case: 5, invoice: 5 });
    expect(out.pages.legal_case?.[0]?.type).toBe("legal_case");
    expect(out.pages.invoice?.[0]?.type).toBe("invoice");
    expect(out.failedTypes).toEqual([]);
    expect(out.cappedTypes).toEqual([]);
  });

  it("reports failed and capped types separately", async () => {
    mockFetch((url) => {
      const u = new URL(url);
      if (u.searchParams.get("type") === "invoice") return new Response("x", { status: 500 });
      const n = Number(u.searchParams.get("limit"));
      return Response.json(Array.from({ length: n }, (_, i) => ({ slug: `c${i}` })));
    });
    const out = await fetchPagesByTypesResult(HEADERS, { legal_case: 5, invoice: 5 });
    expect(out.failedTypes).toEqual(["invoice"]);
    expect(out.cappedTypes).toEqual(["legal_case"]);
    expect(out.pages.legal_case).toHaveLength(5);
  });
});

describe("fetchStats", () => {
  it("marks engine_reachable=false when the engine is down", async () => {
    mockFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    const stats = await fetchStats(HEADERS);
    expect(stats?.engine_reachable).toBe(false);
    expect(stats?.total_pages).toBe(0);
  });

  it("marks engine_reachable=true with live stats", async () => {
    mockFetch(() => Response.json({ total_pages: 7 }));
    const stats = await fetchStats(HEADERS);
    expect(stats?.engine_reachable).toBe(true);
    expect(stats?.total_pages).toBe(7);
  });
});

describe("fetchRecentQueries", () => {
  it("returns [] on failure and list on success", async () => {
    mockFetch(() => new Response("x", { status: 502 }));
    expect(await fetchRecentQueries(HEADERS, 5)).toEqual([]);

    mockFetch(() => Response.json([{ query: "Streitwert?", created_at: "t" }]));
    expect(await fetchRecentQueries(HEADERS, 5)).toHaveLength(1);
  });
});

describe("fetchPagesByTypeResult", () => {
  it("reports a failed read instead of passing it off as an empty list", async () => {
    mockFetch(() => new Response("boom", { status: 500 }));
    expect(await fetchPagesByTypeResult(HEADERS, "legal_deadline", 50)).toEqual({
      pages: [],
      ok: false,
      capped: false,
    });

    mockFetch(() => Promise.reject(new Error("offline")));
    expect((await fetchPagesByTypeResult(HEADERS, "legal_deadline", 50)).ok).toBe(false);

    mockFetch(() => Response.json([]));
    expect(await fetchPagesByTypeResult(HEADERS, "legal_deadline", 50)).toEqual({
      pages: [],
      ok: true,
      capped: false,
    });
  });
});
