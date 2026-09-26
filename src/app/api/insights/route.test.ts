import type { NextRequest } from "next/server";
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeEngine, type FakeEngine } from "@/test/fake-engine-pages";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (
    opts: { query?: { parse: (d: unknown) => unknown } },
    handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>
  ) => {
    const ctx = { headers: { "x-subsumio-source": "brain-at" } };
    return async (req: Request) => {
      const query = Object.fromEntries(new URL(req.url).searchParams);
      return handler(ctx, undefined, opts.query ? opts.query.parse(query) : query);
    };
  },
}));

import { GET } from "./route";

let engine: FakeEngine;
let failingTypes: string[] = [];

beforeEach(() => {
  engine = createFakeEngine("http://engine.test", () => "2026-01-01T00:00:00Z");
  failingTypes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      if (u.pathname === "/api/legal/fristenbuch") {
        return Response.json({ heute: "", eintraege: [], zusammenfassung: {} });
      }
      if (u.pathname === "/api/pages" && failingTypes.includes(u.searchParams.get("type") ?? "")) {
        return new Response("boom", { status: 500 });
      }
      if (u.pathname === "/api/pages" && Number(u.searchParams.get("limit")) > 100) {
        u.searchParams.set("limit", "100");
      }
      return engine.fetch(u.toString(), init);
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function get(qs = "") {
  const res = await GET(
    new Request(`http://localhost/api/insights${qs}`) as unknown as NextRequest
  );
  return (await res.json()) as {
    insights: Array<{ title: string; caseSlug?: string }>;
    partial?: boolean;
  };
}

describe("GET /api/insights", () => {
  test("caseSlug einer Akte außerhalb der 200 zuletzt geänderten liefert deren Insights", async () => {
    engine.put({
      slug: "legal/cases/alt",
      title: "Alte Akte",
      type: "legal_case",
      frontmatter: {
        status: "open",
        deadlines: [{ id: "d1", title: "Berufung", due_date: "2020-01-01" }],
      },
    });
    for (let i = 0; i < 250; i++) {
      engine.put({
        slug: `legal/cases/n${i}`,
        title: `Akte ${i}`,
        type: "legal_case",
        frontmatter: { status: "open" },
      });
    }
    const body = await get("?caseSlug=legal/cases/alt");
    expect(body.insights.some((i) => i.title === "Frist versäumt")).toBe(true);
    expect(body.insights.every((i) => i.caseSlug === "legal/cases/alt")).toBe(true);
    expect(body.partial).toBeUndefined();
  });

  test("Frist nur als legal_deadline-Seite → kein 'Keine Fristen gesetzt'", async () => {
    engine.put({
      slug: "legal/cases/a",
      title: "Akte A",
      type: "legal_case",
      frontmatter: { status: "open", timeline: [{ date: "2026-01-01", type: "filing" }] },
    });
    engine.put({
      slug: "legal/deadlines/a",
      title: "Klagebeantwortung",
      type: "legal_deadline",
      frontmatter: { case_slug: "legal/cases/a", due_date: "2099-01-01", status: "open" },
    });
    const body = await get();
    expect(body.insights.some((i) => i.title === "Keine Fristen gesetzt")).toBe(false);
  });

  test("Lesefehler → partial: true statt stiller Lücke", async () => {
    failingTypes = ["legal_deadline"];
    const body = await get();
    expect(body.partial).toBe(true);
  });
});
