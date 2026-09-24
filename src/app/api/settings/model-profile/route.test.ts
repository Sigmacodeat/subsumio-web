/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) =>
      id === "u_admin" ? { id, name: "Dr. Admin", email: "admin@kanzlei.example" } : null,
  }),
}));

import { GET, PUT } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

const ADMIN = { id: "u_admin", email: "admin@kanzlei.example", role: "admin", orgId: "org_1" };
const LAWYER = { id: "u_lawyer", email: "anwalt@kanzlei.example", role: "lawyer", orgId: "org_1" };

function ctxFor(user: Record<string, unknown>) {
  return {
    headers: { "x-subsumio-source": "org_firm", "x-subsumio-api-key": "k" },
    brainId: "org_firm",
    plan: "team",
    user,
  };
}

const ENGINE_VIEW = {
  profile: {
    areas: {
      chat: "auto",
      erfassung: "auto",
      analyse: "auto",
      fristen: "deep",
      entwuerfe: "auto",
      qualitaet: "auto",
    },
    updated_at: "2026-09-19T10:00:00.000Z",
    updated_by: "u_admin",
  },
  areas: [],
  pricing: {},
};

function putRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/settings/model-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    body: JSON.stringify(body),
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/settings/model-profile", () => {
  it("proxies the tenant's profile and resolves who changed it", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(ADMIN) as any);
    fetchMock.mockResolvedValue(Response.json(ENGINE_VIEW));

    const res = await GET(new NextRequest("http://localhost:3000/api/settings/model-profile"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.areas.fristen).toBe("deep");
    expect(body.updatedByName).toBe("Dr. Admin");
    expect(body.canEdit).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://engine.test/api/settings/model-profile");
    expect((init as RequestInit).headers).toMatchObject({ "x-subsumio-source": "org_firm" });
  });

  it("marks the profile read-only for non-admins", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(LAWYER) as any);
    fetchMock.mockResolvedValue(Response.json(ENGINE_VIEW));
    const body = await (
      await GET(new NextRequest("http://localhost:3000/api/settings/model-profile"))
    ).json();
    expect(body.canEdit).toBe(false);
  });

  it("answers 503 when the engine is unreachable", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(ADMIN) as any);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await GET(new NextRequest("http://localhost:3000/api/settings/model-profile"));
    expect(res.status).toBe(503);
  });
});

describe("PUT /api/settings/model-profile", () => {
  it("is declared as settings.write (admin-only in requireEngineContext)", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(ADMIN) as any);
    fetchMock.mockResolvedValue(Response.json(ENGINE_VIEW));
    await PUT(putRequest({ areas: { fristen: "deep" } }));
    expect(vi.mocked(requireEngineContext).mock.calls[0]![1]).toBe("settings.write");
  });

  it("forwards the change with the acting user and audits it", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(ADMIN) as any);
    fetchMock.mockResolvedValue(Response.json(ENGINE_VIEW));

    const res = await PUT(putRequest({ areas: { fristen: "deep" } }));
    expect(res.status).toBe(200);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      areas: { fristen: "deep" },
      updated_by: "u_admin",
    });
    expect(logAudit).toHaveBeenCalledWith(
      "settings.update",
      "model_profile",
      expect.objectContaining({ details: { areas: { fristen: "deep" } }, userId: "u_admin" })
    );
  });

  it("passes the engine's floor rejection through as 400 with its code, without auditing", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(ADMIN) as any);
    fetchMock.mockResolvedValue(
      Response.json(
        { error: "below_floor", message: 'Area "fristen" cannot run below the reasoning tier' },
        { status: 400 }
      )
    );
    const res = await PUT(putRequest({ areas: { fristen: "utility" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("below_floor");
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([[{ areas: { billing: "deep" } }], [{ areas: { chat: "opus" } }], [{ areas: {} }], [{}]])(
    "rejects malformed body %j before calling the engine",
    async (body) => {
      vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(ADMIN) as any);
      const res = await PUT(putRequest(body));
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("maps other engine failures to 502", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor(ADMIN) as any);
    fetchMock.mockResolvedValue(Response.json({ error: "model_profile_failed" }, { status: 500 }));
    const res = await PUT(putRequest({ areas: { chat: "deep" } }));
    expect(res.status).toBe(502);
  });
});
