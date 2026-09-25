import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "b1",
        headers: { "x-subsumio-source": "b1" },
        user: { id: "u1", role: "admin", email: "a@test" },
      };
      return handler(ctx, opts.body?.parse(await req.json()));
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { POST } from "./route";
import type { BulkImportResult } from "@/lib/bulk-cases";

interface EngineState {
  cases: Array<{ slug: string; frontmatter: Record<string, unknown> }>;
  listStatus: number;
  writeStatus: number;
  conflictNames: string[];
  writes: Array<{ slug: string; body: Record<string, unknown> }>;
}

let engine: EngineState;

function installEngine() {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/pages" && method === "GET") {
      if (engine.listStatus !== 200) return new Response("x", { status: engine.listStatus });
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 100);
      return Response.json(engine.cases.slice(offset, offset + limit));
    }
    if (url.pathname.startsWith("/api/pages/") && method === "GET") {
      const slug = decodeURIComponent(url.pathname.slice("/api/pages/".length));
      const found = engine.cases.find((c) => c.slug === slug);
      return found ? Response.json(found) : new Response("nf", { status: 404 });
    }
    if (url.pathname === "/api/legal/conflict-check") {
      const { name } = JSON.parse(String(init?.body)) as { name: string };
      return Response.json({
        matches: engine.conflictNames.includes(name)
          ? [{ name, slug: "contacts/x", type: "legal_contact" }]
          : [],
      });
    }
    if (url.pathname === "/api/pages" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (engine.writeStatus !== 200) {
        return Response.json({ error: "boom" }, { status: engine.writeStatus });
      }
      engine.writes.push({ slug: String(body.slug), body });
      return Response.json({ slug: body.slug });
    }
    return new Response("unexpected", { status: 599 });
  }) as unknown as typeof fetch;
}

async function importCsv(csv: string) {
  const res = await POST(
    new Request("http://x/api/bulk-cases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv_text: csv }),
    }) as unknown as NextRequest
  );
  return {
    status: res.status,
    json: (await res.json()) as {
      data: BulkImportResult & { results: Array<Record<string, unknown>> };
    },
  };
}

const HEADER = "aktenzeichen,mandant,gegner,gegenstand,klammer";

beforeEach(() => {
  engine = { cases: [], listStatus: 200, writeStatus: 200, conflictNames: [], writes: [] };
  installEngine();
});

describe("POST /api/bulk-cases", () => {
  it("reports an engine refusal as error, not as created (AKT-2 / QA-1a)", async () => {
    engine.writeStatus = 500;
    const { json } = await importCsv(`${HEADER}\n2026-001,Max,Gegner AG,Forderung,K1`);
    expect(json.data.created).toBe(0);
    expect(json.data.errors).toBe(1);
    expect(json.data.results[0].status).toBe("error");
  });

  it("leaves an existing matter untouched and reports the row as exists (AKT-1 / QA-1b)", async () => {
    engine.cases.push({
      slug: "legal/cases/2026-001",
      frontmatter: { case_number: "2026-001", deadlines: [{ id: "d1" }] },
    });
    const { json } = await importCsv(`${HEADER}\n2026-001,Max,Gegner AG,Forderung,K1`);
    expect(json.data.exists).toBe(1);
    expect(json.data.created).toBe(0);
    expect(json.data.results[0]).toMatchObject({ status: "exists", slug: "legal/cases/2026-001" });
    expect(engine.writes).toHaveLength(0);
  });

  it("imports only the first of two rows with the same Aktenzeichen", async () => {
    const { json } = await importCsv(
      `${HEADER}\n2026-002,Max,Gegner AG,Forderung,K1\n2026-002,Anna,Gegner AG,Anderes,K1`
    );
    expect(json.data.created).toBe(1);
    expect(json.data.exists).toBe(1);
    expect(json.data.results[1]).toMatchObject({ line: 3, status: "exists" });
    expect(engine.writes).toHaveLength(1);
  });

  it("does not create a matter with a conflict hit (QA-1c)", async () => {
    engine.conflictNames = ["Gegner AG"];
    const { json } = await importCsv(`${HEADER}\n2026-003,Max,Gegner AG,Forderung,K1`);
    expect(json.data.conflicts).toBe(1);
    expect(json.data.results[0]).toMatchObject({ status: "conflict", conflicts: ["Gegner AG"] });
    expect(engine.writes).toHaveLength(0);
  });

  it("creates with a server-generated slug and a checked conflict status", async () => {
    const { json } = await importCsv(`${HEADER}\n2026/004,Max,Gegner AG,Forderung,K1`);
    expect(json.data.created).toBe(1);
    expect(engine.writes[0]!.slug).toMatch(/^legal\/cases\/2026-004-[0-9a-f]{8}$/);
    expect(engine.writes[0]!.body.merge).toBeUndefined();
    expect((engine.writes[0]!.body.frontmatter as Record<string, unknown>).conflict_status).toBe(
      "conflict_cleared"
    );
  });

  it("writes nothing when the existing matters cannot be listed", async () => {
    engine.listStatus = 500;
    const { status } = await importCsv(`${HEADER}\n2026-005,Max,Gegner AG,Forderung,K1`);
    expect(status).toBe(503);
    expect(engine.writes).toHaveLength(0);
  });

  it("reads semicolon CSV with an Austrian Streitwert and reports invalid rows (UIS-2-4)", async () => {
    const { json } = await importCsv(
      "aktenzeichen;mandant;gegenstand;streitwert;klammer\n" +
        "2026-006;Max;Forderung;10.000,50;K1\n" +
        "2026-007;Anna;;5.000;K1\n" +
        "2026-008;Eva;Forderung;viel;K1"
    );
    expect(json.data.total).toBe(3);
    expect(json.data.created).toBe(1);
    expect(json.data.errors).toBe(2);
    expect((engine.writes[0]!.body.frontmatter as Record<string, unknown>).dispute_value).toBe(
      10000.5
    );
  });
});
