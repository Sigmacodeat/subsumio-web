// @vitest-environment node
//
// The SLO endpoint must say that no metrics source is attached instead of
// suggesting monitoring that does not happen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-handler", () => ({
  createHandler: (_opts: unknown, h: (...a: unknown[]) => Promise<Response>) => (req: Request) =>
    h({}, undefined, {}, req),
}));

import { GET } from "./route";

describe("GET /api/monitoring/slo", () => {
  it("reports that SLO metrics are not connected", async () => {
    const res = await (GET as unknown as (r: Request) => Promise<Response>)(
      new Request("http://localhost/api/monitoring/slo")
    );
    const body = (await res.json()) as {
      connected: boolean;
      alerts: unknown[];
      summary: { no_data: number; total: number };
    };
    expect(body.connected).toBe(false);
    expect(body.alerts).toEqual([]);
    expect(body.summary.no_data).toBe(body.summary.total);
  });
});
