/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));

const update = vi.fn(async () => ({ id: "u_1" }));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async () => ({ id: "u_1", orgId: "org_1", preferredModel: null }),
    update,
  }),
  getOrgStore: () => ({ getById: async () => ({ id: "org_1", modelPolicy: "any" }) }),
}));

import { GET, PATCH } from "./route";
import { requireEngineContext } from "@/lib/engine";

const USER = { id: "u_1", email: "anwalt@kanzlei.example", role: "lawyer", orgId: "org_1" };
const CTX = {
  headers: { "x-subsumio-source": "org_firm" },
  brainId: "org_firm",
  plan: "team",
  user: USER,
};

/** The engine's model-profile view, trimmed to the fields the picker needs. */
function profileResponse(minimum: string, picks: string[]) {
  return Response.json({ chatMinimumTier: minimum, allowedChatPicks: picks });
}

function patchRequest(modelId: string) {
  return new NextRequest("http://localhost:3000/api/settings/model", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    body: JSON.stringify({ modelId }),
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(requireEngineContext).mockResolvedValue(CTX as any);
});

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/settings/model", () => {
  it("passes the firm's chat minimum to the picker", async () => {
    fetchMock.mockResolvedValue(
      profileResponse("reasoning", ["claude-sonnet-5", "claude-opus-5", "claude-fable-5-1"])
    );
    const body = await (
      await GET(new NextRequest("http://localhost:3000/api/settings/model"))
    ).json();
    expect(body.data.chatMinimumTier).toBe("reasoning");
    expect(body.data.allowedChatPicks).not.toContain("claude-haiku-4-5");
    expect(body.data.models.length).toBeGreaterThan(0);
  });

  it("leaves the picker unrestricted when the engine cannot be asked", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const body = await (
      await GET(new NextRequest("http://localhost:3000/api/settings/model"))
    ).json();
    expect(body.data.chatMinimumTier).toBeNull();
    expect(body.data.allowedChatPicks).toBeNull();
  });
});

describe("PATCH /api/settings/model", () => {
  it("refuses a saved preference below the firm minimum", async () => {
    fetchMock.mockResolvedValue(profileResponse("reasoning", ["claude-sonnet-5", "claude-opus-5"]));
    const res = await PATCH(patchRequest("claude-haiku-4-5"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("below_firm_minimum");
    expect(update).not.toHaveBeenCalled();
  });

  it("stores a preference that clears the minimum", async () => {
    fetchMock.mockResolvedValue(profileResponse("reasoning", ["claude-sonnet-5", "claude-opus-5"]));
    const res = await PATCH(patchRequest("claude-opus-5"));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("u_1", { preferredModel: "claude-opus-5" });
  });

  it("still stores a preference when the minimum is unknown", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await PATCH(patchRequest("claude-haiku-4-5"));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("u_1", { preferredModel: "claude-haiku-4-5" });
  });
});
