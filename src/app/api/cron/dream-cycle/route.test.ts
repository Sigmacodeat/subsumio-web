// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-handler", () => ({
  createCronHandler: (h: (req: NextRequest) => Promise<Response>) => h,
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/env", () => ({ env: (k: string) => (k === "SUBSUMIO_WEB_API_KEY" ? "k" : "") }));
vi.mock("@/lib/brain-learning", () => ({
  learningDisabledBrainIds: async () => ["org_off", "brain_solo_off"],
}));

import { GET } from "./route";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    Response.json({ status: "ok", duration_ms: 1, phases: [{ phase: "embed", status: "ok" }] })
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("nightly dream cron", () => {
  it("sends the complete list of firms that switched learning off", async () => {
    const res = await GET(new NextRequest("http://x/api/cron/dream-cycle"));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.test/api/admin/dream");
    expect((init.headers as Record<string, string>)["x-subsumio-api-key"]).toBe("k");
    expect(JSON.parse(String(init.body))).toEqual({
      learning_excluded_sources: ["org_off", "brain_solo_off"],
    });
    expect((await res.json()).learning_excluded_firms).toBe(2);
  });
});
