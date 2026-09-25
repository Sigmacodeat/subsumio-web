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

  test("legacy batchListPages keeps returning only results", async () => {
    csrfFetchMock.mockImplementation(async () =>
      Response.json({ results: { legal_case: [page("a")] }, errors: ["invoice"] })
    );
    const r = await api.brain.batchListPages(["legal_case", "invoice"], 200);
    expect(r.legal_case).toHaveLength(1);
    expect("errors" in r).toBe(false);
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
