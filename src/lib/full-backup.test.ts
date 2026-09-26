// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));

import { collectFullBackup } from "./full-backup";

let pages: Array<{ slug: string; title: string }>;
let statsTotal: number | null;
let failTextFor: Set<string>;
let emptyTextFor: Set<string>;
let brokenJsonFor: Set<string>;

beforeEach(() => {
  pages = [];
  statsTotal = null;
  failTextFor = new Set();
  emptyTextFor = new Set();
  brokenJsonFor = new Set();
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/stats") {
      return statsTotal === null
        ? new Response("x", { status: 500 })
        : Response.json({ total_pages: statsTotal });
    }
    if (url.pathname === "/api/pages") {
      const limit = Math.min(Number(url.searchParams.get("limit")), 100);
      const offset = Number(url.searchParams.get("offset"));
      // The list endpoint carries no texts.
      return Response.json(pages.slice(offset, offset + limit).map((p) => ({ ...p, content: "" })));
    }
    if (url.pathname.startsWith("/api/pages/")) {
      const slug = decodeURIComponent(url.pathname.slice("/api/pages/".length));
      if (failTextFor.has(slug)) return new Response("x", { status: 500 });
      if (brokenJsonFor.has(slug)) return new Response("{not json", { status: 200 });
      if (emptyTextFor.has(slug)) return Response.json({ slug, content: "" });
      return Response.json({ slug, content: `Text von ${slug}` });
    }
    return new Response("unexpected", { status: 599 });
  }) as unknown as typeof fetch;
});

describe("collectFullBackup (ENG-7)", () => {
  it("holds the text of every entry and reports the run complete", async () => {
    pages = [1, 2, 3].map((i) => ({ slug: `akten/a-${i}`, title: `A ${i}` }));
    statsTotal = 3;
    const out = await collectFullBackup({});
    expect(out.pages.map((p) => p.content)).toEqual([
      "Text von akten/a-1",
      "Text von akten/a-2",
      "Text von akten/a-3",
    ]);
    expect(out.completeness).toMatchObject({
      total_pages: 3,
      expected_pages: 3,
      pages_without_content: 0,
      complete: true,
      truncated: false,
    });
  });

  it("marks a run cut off at the ceiling as truncated, never as complete", async () => {
    pages = Array.from({ length: 10_050 }, (_, i) => ({ slug: `p/${i}`, title: `P ${i}` }));
    statsTotal = 10_050;
    const out = await collectFullBackup({}, { maxPages: 10_000 });
    expect(out.pages).toHaveLength(10_000);
    expect(out.completeness.truncated).toBe(true);
    expect(out.completeness.complete).toBe(false);
    expect(out.completeness.truncated_warning).toMatch(/abgeschnitten/);
  });

  it("names entries whose text could not be read", async () => {
    pages = [1, 2].map((i) => ({ slug: `p/${i}`, title: `P ${i}` }));
    statsTotal = 2;
    failTextFor.add("p/2");
    const out = await collectFullBackup({});
    expect(out.completeness.complete).toBe(false);
    expect(out.completeness.pages_without_content).toBe(1);
    expect(out.completeness.pages_without_content_slugs).toEqual(["p/2"]);
  });

  it("an entry whose text is deliberately empty is backed up, not reported as unreadable", async () => {
    pages = [
      { slug: "contacts/x", title: "Kontakt" },
      { slug: "p/1", title: "P" },
    ];
    statsTotal = 2;
    emptyTextFor.add("contacts/x");
    const out = await collectFullBackup({});
    expect(out.completeness.pages_without_content).toBe(0);
    expect(out.completeness.complete).toBe(true);
    expect(out.pages.find((p) => p.slug === "contacts/x")?.content).toBe("");
  });

  it("a read error still makes the run incomplete, next to an empty entry", async () => {
    pages = [
      { slug: "contacts/x", title: "Kontakt" },
      { slug: "p/2", title: "P" },
    ];
    statsTotal = 2;
    emptyTextFor.add("contacts/x");
    failTextFor.add("p/2");
    const out = await collectFullBackup({});
    expect(out.completeness.complete).toBe(false);
    expect(out.completeness.pages_without_content_slugs).toEqual(["p/2"]);
  });

  it("an unreadable answer body counts as a failed read", async () => {
    pages = [{ slug: "p/3", title: "P" }];
    statsTotal = 1;
    brokenJsonFor.add("p/3");
    const out = await collectFullBackup({});
    expect(out.completeness.complete).toBe(false);
    expect(out.completeness.pages_without_content_slugs).toEqual(["p/3"]);
  });

  it("is not complete when the entry count cannot be confirmed", async () => {
    pages = [{ slug: "p/1", title: "P" }];
    const out = await collectFullBackup({});
    expect(out.completeness.complete).toBe(false);
    expect(out.completeness.count_warning).toBeTruthy();
  });
});
