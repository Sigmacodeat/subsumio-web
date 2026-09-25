// @vitest-environment node
// Audit QA-8: a failed engine read is an error (503), never an empty list.
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine-test:3001" }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", async () => {
  const { apiError, apiSuccess } = await import("@/lib/api-response");
  return {
    createHandler:
      (
        _opts: unknown,
        handler: (ctx: unknown, body: unknown, query: unknown, req: Request) => Promise<Response>
      ) =>
      async (req: Request) =>
        handler({ headers: { "x-subsumio-source": "brain-at" } }, {}, {}, req),
    apiError,
    apiSuccess,
    recordCreditConsumption: vi.fn(),
  };
});

import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/agents", () => {
  test("engine unreachable → 503 with error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const res = await GET(new Request("http://localhost/api/agents") as never);
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string; code: string };
    expect(json.code).toBe("service_unavailable");
    expect(json.error).toMatch(/konnten nicht geladen werden/);
  });

  test("engine answers 500 → 503, not an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 }))
    );
    const res = await GET(new Request("http://localhost/api/agents") as never);
    expect(res.status).toBe(503);
  });
});
