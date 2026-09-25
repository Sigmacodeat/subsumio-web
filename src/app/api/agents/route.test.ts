import type { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const charge = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown, q: unknown, req: Request) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: { id: "u-1", role: "lawyer", email: "l@x.at", brainId: "firm-a" },
        billing: { ownerId: "org-a", ownerType: "org" },
      };
      const body = req.method === "GET" ? {} : opts.body!.parse(await req.json());
      return handler(ctx, body, {}, req);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
  recordCreditConsumption: charge,
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));

import { GET, POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  charge.mockClear();
});

describe("/api/agents", () => {
  it("GET: an engine failure is an error (503), not an empty job list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 }))
    );
    const res = await GET(new Request("http://x/api/agents") as unknown as NextRequest);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.jobs).toBeUndefined();
    expect(typeof body.error).toBe("string");
  });

  it("POST: a refused start returns a German error and books no credit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    );
    const res = await POST(
      new Request("http://x/api/agents", {
        method: "POST",
        body: JSON.stringify({ prompt: "Prüfe die Akte" }),
      }) as unknown as NextRequest
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Auftrag konnte nicht gestartet werden");
    expect(charge).not.toHaveBeenCalled();
  });
});
