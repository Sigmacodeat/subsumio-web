// @vitest-environment node
//
// api.cases.list feeds every matter picker (document requests, research,
// time, intake, communications, wiedervorlagen). It used the full-text
// search with an empty query, which always answers [] — so the pickers were
// empty. api.legal.allocateCaseNumber must unwrap the { data } envelope.
import { beforeEach, describe, expect, test, vi } from "vitest";

const csrfFetchMock = vi.fn();

vi.mock("@/lib/csrf", () => ({
  csrfFetch: (...args: unknown[]) => csrfFetchMock(...args),
  getCsrfToken: () => "test-token",
}));
vi.mock("@/lib/env", () => ({ env: () => "http://engine.test" }));

import { api } from "./api";

beforeEach(() => {
  csrfFetchMock.mockReset();
});

describe("api.cases.list", () => {
  test("returns every matter across batches (150 matters), not the search result", async () => {
    csrfFetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url, "http://app.test");
      expect(u.pathname).toBe("/api/pages");
      expect(u.searchParams.get("type")).toBe("legal_case");
      const cursor = Number(u.searchParams.get("cursor") ?? "0");
      const items = Array.from({ length: Math.min(100, 150 - cursor) }, (_, i) => ({
        slug: `legal/cases/a${cursor + i}`,
        title: `Akte ${cursor + i}`,
        type: "legal_case",
        frontmatter: {},
      }));
      return Response.json(
        cursor + 100 < 150 ? { items, nextCursor: String(cursor + 100) } : { items }
      );
    });
    const cases = await api.cases.list({ limit: 100 });
    expect(cases).toHaveLength(150);
  });
});

describe("api.legal.allocateCaseNumber", () => {
  test("unwraps the { data } envelope", async () => {
    csrfFetchMock.mockResolvedValue(Response.json({ data: { caseNumber: "26-0007" } }));
    await expect(api.legal.allocateCaseNumber()).resolves.toEqual({ caseNumber: "26-0007" });
  });

  test("a response without a number is an error, not undefined", async () => {
    csrfFetchMock.mockResolvedValue(Response.json({ data: {} }));
    await expect(api.legal.allocateCaseNumber()).rejects.toThrow();
  });
});
