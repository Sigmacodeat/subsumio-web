/* eslint-disable @typescript-eslint/no-explicit-any */
// Removing a founder after a change of owner: the firm keeps its brain, the
// founder gets a new personal one.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));

const users: Record<string, any> = {};
const update = vi.fn(async (id: string, patch: Record<string, unknown>) => {
  users[id] = { ...users[id], ...patch };
  return users[id];
});
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getById: async (id: string) => users[id] ?? null, update }),
  getOrgStore: () => ({
    getById: async (id: string) =>
      id === "org_a" ? { id, ownerId: "owner", brainId: "brain_founder" } : null,
    update: async () => ({}),
  }),
  withInviteRevoked: () => ({}),
}));

import { DELETE } from "./route";
import { requireEngineContext } from "@/lib/engine";

function remove(userId: string) {
  return new NextRequest("http://localhost:3000/api/org/member", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    body: JSON.stringify({ userId }),
  });
}

beforeEach(() => {
  update.mockClear();
  users.owner = { id: "owner", role: "admin", orgId: "org_a", brainId: "brain_owner" };
  users.founder = { id: "founder", role: "admin", orgId: "org_a", brainId: "brain_founder" };
  users.member = { id: "member", role: "lawyer", orgId: "org_a", brainId: "brain_member" };
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "brain_founder",
    plan: "team",
    user: users.owner,
  } as any);
});

describe("DELETE /api/org/member", () => {
  it("gives a removed founder a new personal brain", async () => {
    const res = await DELETE(remove("founder"));
    expect(res.status).toBe(200);
    expect(users.founder.orgId).toBeNull();
    expect(users.founder.brainId).not.toBe("brain_founder");
  });

  it("leaves a removed member's own brain as it is", async () => {
    const res = await DELETE(remove("member"));
    expect(res.status).toBe(200);
    expect(users.member.orgId).toBeNull();
    expect(users.member.brainId).toBe("brain_member");
  });

  it("a second administrator removes members but never the owner", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: {},
      brainId: "brain_founder",
      plan: "team",
      user: users.founder,
    } as any);
    expect((await DELETE(remove("owner"))).status).toBe(403);
    expect((await DELETE(remove("member"))).status).toBe(200);
  });

  it("a lawyer does not manage the team", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: {},
      brainId: "brain_founder",
      plan: "team",
      user: users.member,
    } as any);
    expect((await DELETE(remove("founder"))).status).toBe(403);
  });
});
