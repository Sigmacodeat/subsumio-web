// @vitest-environment node
// UIS-0-10: the time list reports every matching entry, not just the first 500.
import { describe, expect, it, vi } from "vitest";

const entries = Array.from({ length: 600 }, (_, i) => ({
  id: `t-${i}`,
  description: "Recherche",
  minutes: 60,
  date: "2026-09-01",
  rate: 100,
  billable: true,
  billed: false,
  case_slug: "cases/a",
}));

vi.mock("@/lib/server-brain", () => ({ createServerBrainClient: () => ({}) }));
vi.mock("@/lib/time-tracking", async (orig) => ({
  ...(await orig<typeof import("@/lib/time-tracking")>()),
  listAllTimeEntries: async () => entries,
}));
vi.mock("@/lib/realtime-bus", () => ({ broadcastSseEvent: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (_o: unknown, handler: (ctx: unknown, body: unknown, query: unknown) => Promise<Response>) =>
    async (req: Request) =>
      handler(
        { headers: {}, brainId: "b", user: { id: "u1" } },
        {},
        Object.fromEntries(new URL(req.url).searchParams)
      ),
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET } from "./route";

const get = (qs: string) =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request(`http://localhost/api/time?${qs}`)
  );

describe("GET /api/time — complete lists", () => {
  it("returns all 600 entries when asked, total = 600, not capped", async () => {
    const { data } = await (await get("limit=20000")).json();
    expect(data.entries).toHaveLength(600);
    expect(data.total).toBe(600);
    expect(data.capped).toBe(false);
    expect(data.summary.total_minutes).toBe(36_000);
  });

  it("a smaller page: total and sums still cover every entry, capped = true", async () => {
    const { data } = await (await get("limit=100")).json();
    expect(data.entries).toHaveLength(100);
    expect(data.total).toBe(600);
    expect(data.capped).toBe(true);
    expect(data.summary.total_minutes).toBe(36_000);
  });
});
