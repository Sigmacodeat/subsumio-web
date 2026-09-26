// @vitest-environment node
//
// api.brain.listAllPages must follow the relayed keyset cursor
// ({items, nextCursor}) so a batch shortened by matter-scope/ACL filters is
// not mistaken for the end of the list; batchListPagesDetailed surfaces
// per-type errors instead of silently presenting "empty".
import { beforeEach, describe, expect, test, vi } from "vitest";

const csrfFetchMock = vi.fn();

vi.mock("@/lib/csrf", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetchMock(...args),
  getCsrfToken: () => "test-token",
}));
vi.mock("@/lib/env", () => ({ env: () => "http://engine.test" }));

import { api } from "./api";

function page(slug: string, frontmatter: Record<string, unknown> = {}) {
  return { slug, title: slug, type: "legal_case", frontmatter };
}

beforeEach(() => {
  csrfFetchMock.mockReset();
});

describe("api.brain.listAllPagesDetailed (R11-9)", () => {
  test("a list stopped at max while more pages exist is reported as capped", async () => {
    let n = 0;
    csrfFetchMock.mockImplementation(async () =>
      Response.json({
        items: Array.from({ length: 100 }, () => page(`p${n++}`)),
        nextCursor: `c${n}`,
      })
    );
    const r = await api.brain.listAllPagesDetailed({ type: "legal_case", max: 300 });
    expect(r.pages).toHaveLength(300);
    expect(r.capped).toBe(true);
  });

  test("a complete list is not capped; the signature request at position 150 is there", async () => {
    csrfFetchMock.mockImplementation(async (url: string) => {
      const cursor = new URL(url, "http://app.test").searchParams.get("cursor");
      const start = cursor ? Number(cursor) : 0;
      const rows = Array.from({ length: Math.min(100, 250 - start) }, (_, i) =>
        page(`sig-${start + i}`)
      );
      return Response.json(
        start + 100 < 250 ? { items: rows, nextCursor: String(start + 100) } : { items: rows }
      );
    });
    const r = await api.brain.listAllPagesDetailed({ type: "signature_request", max: 10_000 });
    expect(r.capped).toBe(false);
    expect(r.pages.some((p) => p.slug === "sig-150")).toBe(true);
  });

  test("relays the frontmatter filter as fm.<key>", async () => {
    csrfFetchMock.mockImplementation(async () => Response.json([]));
    await api.brain.listAllPagesDetailed({
      type: "legal_case",
      frontmatter: { portal_enabled: "true" },
    });
    const u = new URL(String(csrfFetchMock.mock.calls[0][0]), "http://app.test");
    expect(u.searchParams.get("fm.portal_enabled")).toBe("true");
  });
});

describe("api.brain.listAllPages", () => {
  test("follows nextCursor across batches, including an empty filtered batch", async () => {
    csrfFetchMock.mockImplementation(async (url: string) => {
      const cursor = new URL(url, "http://app.test").searchParams.get("cursor");
      if (!cursor) {
        return Response.json({ items: [page("a")], nextCursor: "c1" });
      }
      if (cursor === "c1") {
        // Everything in this window was filtered upstream — still not the end.
        return Response.json({ items: [], nextCursor: "c2" });
      }
      return Response.json({ items: [page("b")] });
    });
    const pages = await api.brain.listAllPages({ type: "legal_case" });
    expect(pages.map((p) => p.slug)).toEqual(["a", "b"]);
    expect(csrfFetchMock).toHaveBeenCalledTimes(3);
    expect(String(csrfFetchMock.mock.calls[2][0])).toContain("cursor=c2");
  });

  test("stops when the route repeats the same cursor", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ items: [page("a")], nextCursor: "same" })
    );
    const pages = await api.brain.listAllPages({ type: "legal_case" });
    expect(pages).toHaveLength(1);
    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
  });

  test("offset-fallback for a bare-array engine (no cursor)", async () => {
    csrfFetchMock.mockImplementation(async (url: string) => {
      const offset = Number(new URL(url, "http://app.test").searchParams.get("offset") ?? 0);
      const rows = Array.from({ length: Math.max(0, Math.min(100, 150 - offset)) }, (_, i) =>
        page(`p${offset + i}`)
      );
      return Response.json(rows);
    });
    const pages = await api.brain.listAllPages({ type: "legal_case" });
    expect(pages).toHaveLength(150);
    expect(csrfFetchMock).toHaveBeenCalledTimes(2);
  });

  test("filters tombstoned pages from the final result", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json([page("a"), page("b", { status: "tombstoned" })])
    );
    const pages = await api.brain.listAllPages({ type: "legal_case" });
    expect(pages.map((p) => p.slug)).toEqual(["a"]);
  });

  test("honours max", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ items: [page("a"), page("b")], nextCursor: "c1" })
    );
    const pages = await api.brain.listAllPages({ type: "legal_case", max: 2 });
    expect(pages).toHaveLength(2);
    expect(csrfFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("api.brain.batchListPagesDetailed", () => {
  test("returns per-type errors", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ results: { legal_case: [page("a")] }, errors: ["invoice"] })
    );
    const r = await api.brain.batchListPagesDetailed(["legal_case", "invoice"], 200);
    expect(r.results.legal_case).toHaveLength(1);
    expect(r.errors).toEqual(["invoice"]);
  });

  test("legacy batchListPages returns only results when every type loaded", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ results: { legal_case: [page("a")] }, errors: [] })
    );
    const r = await api.brain.batchListPages(["legal_case"], 200);
    expect(r.legal_case).toHaveLength(1);
    expect("errors" in r).toBe(false);
  });

  test("legacy batchListPages rejects when a type failed — never an empty list", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ results: { legal_case: [page("a")] }, errors: ["invoice"] })
    );
    await expect(api.brain.batchListPages(["legal_case", "invoice"], 200)).rejects.toMatchObject({
      status: 503,
      code: "batch_list_incomplete",
    });
  });
});

describe("request() error envelope", () => {
  test("apiError shape: text from `error`, code from `code`", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json(
        { error: "Die Auslage ist bereits abgerechnet.", code: "expense_billed" },
        { status: 409 }
      )
    );
    await expect(api.brain.batchListPagesDetailed(["x"])).rejects.toMatchObject({
      status: 409,
      code: "expense_billed",
      message: "Die Auslage ist bereits abgerechnet.",
    });
  });

  test("legacy shape: code from `error`, text from `message`", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ error: "page_exists", message: "Existiert bereits." }, { status: 409 })
    );
    await expect(api.brain.batchListPagesDetailed(["x"])).rejects.toMatchObject({
      code: "page_exists",
      message: "Existiert bereits.",
    });
  });
});

describe("api.brain.listPages", () => {
  test("unwraps the {items,nextCursor} relay so single-page callers get an array", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ items: [page("a")], nextCursor: "c1" })
    );
    const pages = await api.brain.listPages({ type: "legal_case", limit: 100 });
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.map((p) => p.slug)).toEqual(["a"]);
  });
});
