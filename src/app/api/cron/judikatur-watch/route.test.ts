// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (b: string) => ({ "x-subsumio-source": b }),
}));
vi.mock("@/lib/cron-utils", () => ({
  getRecipientsByBrain: vi.fn(
    async () =>
      new Map([
        ["brain-a", []],
        ["brain-b", []],
      ])
  ),
}));
vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: Request) => Promise<Response>) => h,
}));

import { GET } from "./route";

const run = () =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/cron/judikatur-watch")
  );

describe("cron judikatur-watch", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("queues the watch once per firm, on the watch route — never the agent scan", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ success: true })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ brains_checked: 2, jobs_queued: 2 });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "http://engine.test/api/legal/judikatur-watch",
      "http://engine.test/api/legal/judikatur-watch",
    ]);
  });

  it("reports a failed firm as an error (500) instead of success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init?.headers as Record<string, string>)["x-subsumio-source"] === "brain-b"
          ? Response.json({ error: "down" }, { status: 503 })
          : Response.json({ success: true })
      )
    );
    const res = await run();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.jobs_queued).toBe(1);
    expect(body.errors.join("\n")).toMatch(/brain-b/);
  });
});
