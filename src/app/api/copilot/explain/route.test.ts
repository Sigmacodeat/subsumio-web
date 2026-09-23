// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const CALLER_HEADERS = vi.hoisted(() => ({
  "x-subsumio-source": "brain-1",
  "x-subsumio-identity-token": "signed-identity",
}));

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: () => {
    throw new Error("explain must not use the identity-less firm headers");
  },
}));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { brainId: "brain-1", user: { id: "u1" }, headers: CALLER_HEADERS };
      return handler(ctx, opts.body ? opts.body.parse(await req.json()) : undefined);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));

vi.mock("@/lib/matter-context", () => ({
  explainRetrieval: vi.fn(async () => []),
}));

import { POST } from "./route";
import { explainRetrieval } from "@/lib/matter-context";

describe("POST /api/copilot/explain", () => {
  it("retrieves sources with the caller's identity-bearing headers", async () => {
    const res = await POST(
      new Request("http://x/api/copilot/explain", {
        method: "POST",
        body: JSON.stringify({ query: "Frist?", answer: "§ 1 ABGB" }),
      }) as never
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(explainRetrieval).mock.calls[0][2]).toBe(CALLER_HEADERS);
  });
});
