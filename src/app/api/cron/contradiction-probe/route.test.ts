// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
}));
vi.mock("@/lib/engine", () => ({
  ENGINE_URL: "http://engine.test",
  engineHeadersForBrain: (id: string) => ({ "x-subsumio-source": id }),
}));
const billable = vi.fn<() => Promise<Map<string, unknown[]>>>();
vi.mock("@/lib/cron-utils", () => ({
  billableRecipientsByBrain: () => billable(),
}));

import { GET } from "./route";

const fetchMock = vi.fn();
beforeEach(() => {
  billable.mockReset();
  billable.mockResolvedValue(new Map());
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ status: "ok", message: "done" }));
  vi.stubGlobal("fetch", fetchMock);
});

const call = (qs: string) => GET(new NextRequest(`http://x/api/cron/contradiction-probe${qs}`));

describe("contradiction-probe cron route", () => {
  it("refuses incomplete manual calls and never reaches the engine", async () => {
    expect((await call("?doc_type=a")).status).toBe(400);
    expect((await call("?brain_id=firm-a")).status).toBe(400);
    expect((await call("?brain_id=firm-a&recent_hours=0")).status).toBe(400);
    expect((await call("?brain_id=firm-a&recent_hours=24&query=x")).status).toBe(400);
    expect((await call("?brain_id=firm-a&doc_type=a&query=b")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards an explicit doc_type for the named brain", async () => {
    const res = await call("?brain_id=firm-a&doc_type=schriftsatz");
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.test/api/admin/contradiction-probe");
    expect((init.headers as Record<string, string>)["x-subsumio-source"]).toBe("firm-a");
    expect(JSON.parse(String(init.body)).doc_type).toBe("schriftsatz");
  });

  it("nightly: one run per billable firm, each bound to its own brain", async () => {
    billable.mockResolvedValue(
      new Map([
        ["firm-a", []],
        ["firm-b", []],
        ["firm-c", []],
      ])
    );
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const brain = (init.headers as Record<string, string>)["x-subsumio-source"];
      if (brain === "firm-b") return Response.json({ error: "none" }, { status: 422 });
      if (brain === "firm-c") return Response.json({ error: "budget" }, { status: 429 });
      return Response.json({ status: "ok", message: "done" });
    });
    const res = await call("");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      mode: "nightly",
      brains: 3,
      ok: 1,
      no_documents: 1,
      budget_exhausted: 1,
      failed: 0,
    });
    const brains = fetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>)["x-subsumio-source"]
    );
    expect(brains.sort()).toEqual(["firm-a", "firm-b", "firm-c"]);
    for (const [, init] of fetchMock.mock.calls) {
      const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
      expect(sent.recent_hours).toBe(24);
      // The brain comes from the header only, never from the body.
      expect(sent.brain_id).toBeUndefined();
      expect(sent.source_id).toBeUndefined();
    }
  });

  it("nightly without firms calls nothing", async () => {
    const res = await call("");
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
