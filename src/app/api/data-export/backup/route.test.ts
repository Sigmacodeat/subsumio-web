import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler: (_opts: unknown, handler: (ctx: unknown) => Promise<Response>) => async () =>
    handler({
      headers: { "x-subsumio-source": "b1" },
      user: { id: "u1", email: "admin@test" },
    }),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}));

import { GET } from "./route";

let pages: Array<{ slug: string; title: string }>;
let statsTotal: number | null;
/** Offset whose batch comes back short although more pages follow. */
let shortBatchAt: number | null;
let listCalls: number;

beforeEach(() => {
  pages = Array.from({ length: 350 }, (_, i) => ({ slug: `p/${i}`, title: `P ${i}` }));
  statsTotal = 350;
  shortBatchAt = null;
  listCalls = 0;
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/stats") {
      return statsTotal === null
        ? new Response("x", { status: 500 })
        : Response.json({ total_pages: statsTotal });
    }
    if (url.pathname === "/api/pages") {
      listCalls++;
      // The engine answers at most 100 rows, whatever limit was asked for.
      const limit = Math.min(Number(url.searchParams.get("limit")), 100);
      const offset = Number(url.searchParams.get("offset"));
      let batch = pages.slice(offset, offset + limit);
      if (offset === shortBatchAt) batch = batch.slice(0, 60);
      return Response.json(batch.map((p) => ({ ...p, content: "" })));
    }
    if (url.pathname.startsWith("/api/pages/")) {
      return Response.json({ content: "Text" });
    }
    return new Response("unexpected", { status: 599 });
  }) as unknown as typeof fetch;
});

async function backup() {
  const res = await GET(new Request("http://x/api/data-export/backup") as unknown as NextRequest);
  return (await res.json()) as {
    export_metadata: Record<string, unknown>;
    data: unknown[];
  };
}

describe("GET /api/data-export/backup (AKT-28)", () => {
  it("pages past the engine's 100-row cap and holds every entry", async () => {
    const out = await backup();
    expect(out.data).toHaveLength(350);
    expect(out.export_metadata).toMatchObject({
      total_pages: 350,
      expected_pages: 350,
      complete: true,
    });
  });

  it("keeps going after a short batch and stops only at an empty one", async () => {
    shortBatchAt = 100;
    const out = await backup();
    // 40 entries of the short batch are missing — reported, not hidden.
    expect(out.data).toHaveLength(310);
    expect(listCalls).toBe(5);
    expect(out.export_metadata.complete).toBe(false);
    expect(String(out.export_metadata.count_warning)).toContain("310 von 350");
  });

  it("is incomplete when the count differs from the engine's total", async () => {
    statsTotal = 400;
    const out = await backup();
    expect(out.export_metadata.complete).toBe(false);
    expect(out.export_metadata.count_warning).toBeTruthy();
  });

  it("is incomplete when the total cannot be read", async () => {
    statsTotal = null;
    const out = await backup();
    expect(out.data).toHaveLength(350);
    expect(out.export_metadata.complete).toBe(false);
  });
});
