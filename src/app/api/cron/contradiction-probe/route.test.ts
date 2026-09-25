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

import { GET } from "./route";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ status: "ok", message: "done" }));
  vi.stubGlobal("fetch", fetchMock);
});

const call = (qs: string) => GET(new NextRequest(`http://x/api/cron/contradiction-probe${qs}`));

describe("contradiction-probe cron route", () => {
  it("refuses a call without parameters and never reaches the engine", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("?brain_id=firm-a")).status).toBe(400);
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
});
