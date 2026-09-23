import type { NextRequest } from "next/server";
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  engineOk: true,
  lastBody: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "firm-a",
        headers: { "x-subsumio-source": "firm-a" },
        user: { id: "u-lawyer", role: "lawyer", email: "l@x.at", brainId: "firm-a" },
        billing: { ownerId: "u-owner", ownerType: "user" },
      };
      const body = opts.body ? opts.body.parse(await req.json()) : {};
      return handler(ctx, body);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
  recordCreditConsumption: vi.fn(async () => undefined),
}));

vi.mock("@/lib/engine", async (orig) => ({
  ...(await orig<typeof import("@/lib/engine")>()),
  ENGINE_URL: "http://engine-test:3001",
}));

import { POST } from "./route";

function call(body: Record<string, unknown>) {
  return POST(
    new Request("http://x/api/agents/next-steps", {
      method: "POST",
      body: JSON.stringify(body),
    }) as unknown as NextRequest
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/agents/next-steps", () => {
  it("submits a case-scoped supervisor job", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        state.lastBody = JSON.parse(String(init?.body ?? "{}"));
        return Response.json({ jobId: 42 });
      })
    );
    const res = await call({ case_slug: "fall-2026-001" });
    expect(res.status).toBe(200);
    expect(state.lastBody?.name).toBe("next-steps:fall-2026-001");
    expect(String(state.lastBody?.prompt)).toContain("fall-2026-001");
    expect(state.lastBody?.role).toBe("planning");
    // The matter binds the run (the engine authorizes it and loads its context).
    expect(state.lastBody?.case_slug).toBe("fall-2026-001");
    const data = await res.json();
    expect(data.jobId).toBe(42);
  });

  it("rejects missing case_slug", async () => {
    await expect(call({})).rejects.toThrow();
  });

  it("maps engine failure to 503-style error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 }))
    );
    const res = await call({ case_slug: "fall-1" });
    expect(res.status).toBe(500);
  });
});
