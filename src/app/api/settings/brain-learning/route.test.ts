import type { NextRequest } from "next/server";
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "admin",
  orgId: "org-1" as string | null,
  supportSession: undefined as unknown,
  users: new Map<string, Record<string, unknown>>(),
  orgs: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => state.users.get(id) ?? null,
    update: async (id: string, patch: Record<string, unknown>) => {
      const u = state.users.get(id);
      if (!u) return null;
      const next = { ...u, ...patch };
      state.users.set(id, next);
      return next;
    },
  }),
  getOrgStore: () => ({
    getById: async (id: string) => state.orgs.get(id) ?? null,
    update: async (id: string, patch: Record<string, unknown>) => {
      const o = state.orgs.get(id);
      if (!o) return null;
      const next = { ...o, ...patch };
      state.orgs.set(id, next);
      return next;
    },
  }),
}));
vi.mock("@/lib/engine", () => ({ ENGINE_URL: "http://engine.test" }));
vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = {
        brainId: "org_brain1",
        headers: { "x-subsumio-source": "org_brain1", "x-subsumio-api-key": "k" },
        user: { id: "u1", role: state.role, orgId: state.orgId },
        supportSession: state.supportSession,
      };
      const body =
        opts.body && req.method !== "GET" ? opts.body.parse(await req.json()) : undefined;
      return handler(ctx, body);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: { code, message } }, { status }),
  apiSuccess: (data: unknown) => Response.json({ data }),
}));

import { GET, PATCH } from "./route";

const fetchMock = vi.fn();
const get = async () =>
  (
    await (
      await GET(new Request("http://x/api/settings/brain-learning") as unknown as NextRequest)
    ).json()
  ).data;
const patch = (enabled: boolean) =>
  PATCH(
    new Request("http://x/api/settings/brain-learning", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }) as unknown as NextRequest
  );

beforeEach(() => {
  state.role = "admin";
  state.orgId = "org-1";
  state.supportSession = undefined;
  state.users = new Map([["u1", { id: "u1", orgId: "org-1", brainId: "brain_u1" }]]);
  state.orgs = new Map([["org-1", { id: "org-1", brainId: "org_brain1" }]]);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

describe("/api/settings/brain-learning", () => {
  it("is ON by default, for a firm and for a lawyer working alone", async () => {
    expect(await get()).toEqual({ enabled: true, scope: "org", canEdit: true });
    state.orgId = null;
    state.users.set("u1", { id: "u1", orgId: null, brainId: "brain_u1" });
    expect(await get()).toEqual({ enabled: true, scope: "solo", canEdit: true });
  });

  it("non-admins read it but cannot change it", async () => {
    state.role = "lawyer";
    expect((await get()).canEdit).toBe(false);
    const res = await patch(false);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.orgs.get("org-1")?.brainLearning).toBeUndefined();
  });

  it("an admin switches it off: engine first (own brain, server headers), then the org", async () => {
    const res = await patch(false);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://engine.test/api/brain/learning");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["x-subsumio-source"]).toBe("org_brain1");
    expect(JSON.parse(String(init.body))).toEqual({ enabled: false });
    expect(state.orgs.get("org-1")?.brainLearning).toBe(false);
    expect(await get()).toMatchObject({ enabled: false, scope: "org" });
  });

  it("solo lawyers store it on their own account", async () => {
    state.orgId = null;
    state.users.set("u1", { id: "u1", orgId: null, brainId: "brain_u1" });
    expect((await patch(false)).status).toBe(200);
    expect(state.users.get("u1")?.brainLearning).toBe(false);
  });

  it("does not save when the engine could not take the change", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    expect((await patch(false)).status).toBe(502);
    expect(state.orgs.get("org-1")?.brainLearning).toBeUndefined();
  });

  it("a platform operator in a support session cannot change it", async () => {
    state.supportSession = { id: "s1" };
    expect((await get()).canEdit).toBe(false);
    expect((await patch(false)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
