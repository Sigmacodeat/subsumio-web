// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  blocked: new Set<string>(),
  brains: new Map<string, string | null>(),
}));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => mocks.users.get(id) ?? null }),
}));
vi.mock("@/lib/auth/account-status", () => ({
  isAccountBlocked: async (u: { id: string } | null) => !u || mocks.blocked.has(u.id),
}));
vi.mock("@/lib/engine", () => ({
  firmBrainIdFor: async (u: { id: string }) => mocks.brains.get(u.id) ?? null,
}));

import { GET } from "./route";

function request(query: string, key?: string): NextRequest {
  const headers = new Headers();
  if (key) headers.set("x-engine-webhook-key", key);
  return new NextRequest(`http://localhost/api/internal/engine-user-status?${query}`, { headers });
}

describe("GET /api/internal/engine-user-status", () => {
  beforeEach(() => {
    vi.stubEnv("ENGINE_WEBHOOK_API_KEY", "engine-secret");
    mocks.users.set("u1", { id: "u1", role: "lawyer" });
    mocks.brains.set("u1", "firm-a");
    mocks.users.set("u2", { id: "u2", role: "admin" });
    mocks.brains.set("u2", "firm-a");
  });
  afterEach(() => {
    mocks.users.clear();
    mocks.blocked.clear();
    mocks.brains.clear();
    vi.unstubAllEnvs();
  });

  it("requires the engine key", async () => {
    expect((await GET(request("uid=u1&source=firm-a"))).status).toBe(401);
    expect((await GET(request("uid=u1&source=firm-a", "wrong"))).status).toBe(401);
  });

  it("confirms an active member of the firm with the current role", async () => {
    const res = await GET(request("uid=u1&source=firm-a", "engine-secret"));
    expect(await res.json()).toEqual({ active: true, role: "lawyer" });
  });

  it("answers inactive for unknown, blocked, moved or other-firm users", async () => {
    const ask = async (q: string) =>
      (await (await GET(request(q, "engine-secret"))).json()) as { active: boolean };
    expect((await ask("uid=nobody&source=firm-a")).active).toBe(false);
    mocks.blocked.add("u2");
    expect((await ask("uid=u2&source=firm-a")).active).toBe(false);
    expect((await ask("uid=u1&source=firm-b")).active).toBe(false);
    mocks.brains.set("u1", null); // firm suspended
    expect((await ask("uid=u1&source=firm-a")).active).toBe(false);
  });

  it("rejects malformed queries", async () => {
    expect((await GET(request("uid=&source=firm-a", "engine-secret"))).status).toBe(400);
    expect((await GET(request("uid=u1&source=a%20b", "engine-secret"))).status).toBe(400);
  });
});
