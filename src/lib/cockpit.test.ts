import { describe, expect, it, vi, afterEach } from "vitest";
import { fetchPagesByType, fetchPagesByTypes, fetchStats, fetchRecentQueries } from "./cockpit";

const HEADERS = { "x-subsumio-api-key": "k" };

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => handler(String(url)))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchPagesByType", () => {
  it("returns parsed page arrays", async () => {
    mockFetch(() => Response.json([{ slug: "a", title: "Akte A", type: "legal_case" }]));
    const pages = await fetchPagesByType(HEADERS, "legal_case", 50);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.slug).toBe("a");
  });

  it("returns [] on engine error and on non-ok status", async () => {
    mockFetch(() => new Response("boom", { status: 500 }));
    expect(await fetchPagesByType(HEADERS, "legal_case", 50)).toEqual([]);

    mockFetch(() => Promise.reject(new Error("offline")));
    expect(await fetchPagesByType(HEADERS, "legal_case", 50)).toEqual([]);
  });
});

describe("fetchPagesByTypes", () => {
  it("maps each requested type to its result bucket", async () => {
    mockFetch((url) => {
      const type = new URL(url).searchParams.get("type");
      return Response.json([{ slug: `p-${type}`, type }]);
    });
    const out = await fetchPagesByTypes(HEADERS, { legal_case: 5, invoice: 5 });
    expect(out.legal_case?.[0]?.type).toBe("legal_case");
    expect(out.invoice?.[0]?.type).toBe("invoice");
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
