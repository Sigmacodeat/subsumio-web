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

beforeEach(() => {
  engine = createFakeEngine("http://engine.test", () => "2026-01-01T00:00:00Z");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      if (u.pathname === "/api/stats") return Response.json({ total_pages: 0 });
      if (u.pathname === "/api/queries/recent") return Response.json([]);
      // The real engine clamps every listing to 100 rows.
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

function seedCases(n: number) {
  for (let i = 0; i < n; i++) {
    engine.put({
      slug: `legal/cases/c${i}`,
      title: `Akte ${i}`,
      type: "legal_case",
      frontmatter: { status: "open" },
    });
  }
}

async function get(qs = "") {
  const res = await GET(
    new Request(`http://localhost/api/dashboard/cockpit${qs}`) as unknown as NextRequest
  );
  return (await res.json()) as {
    pages: Record<string, Array<{ slug: string }>>;
    degraded: boolean;
    capped_types: string[];
  };
}

describe("GET /api/dashboard/cockpit — vollständige Listen", () => {
  test("120 Akten → alle 120, nicht die erste Charge von 50/100", async () => {
    seedCases(120);
    const body = await get();
    expect(body.pages.legal_case).toHaveLength(120);
    expect(body.capped_types).not.toContain("legal_case");
    expect(body.degraded).toBe(false);
  });

  test("mehr Akten als das Budget → capped_types meldet es", async () => {
    seedCases(120);
    const body = await get("?types=legal_case:50");
    expect(body.pages.legal_case).toHaveLength(50);
    expect(body.capped_types).toEqual(["legal_case"]);
  });

  test("genau so viele Akten wie das Budget → nicht gekappt", async () => {
    seedCases(50);
    const body = await get("?types=legal_case:50");
    expect(body.pages.legal_case).toHaveLength(50);
    expect(body.capped_types).toEqual([]);
  });

  test("Rechnung mit Status tombstoned wird nicht gelistet", async () => {
    engine.put({ slug: "inv/1", title: "R1", type: "invoice", frontmatter: { status: "sent" } });
    engine.put({
      slug: "inv/2",
      title: "R2",
      type: "invoice",
      frontmatter: { status: "tombstoned" },
    });
    const body = await get("?types=invoice:50");
    expect(body.pages.invoice.map((p) => p.slug)).toEqual(["inv/1"]);
  });
});
