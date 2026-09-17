/* eslint-disable @typescript-eslint/no-explicit-any */
// Every signup is admin of its own workspace. Joining a firm must not carry
// that role into the firm — otherwise any invited colleague could administer it.
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
vi.mock("@/lib/auth/tokens", () => ({
  verifyActionToken: vi.fn(async () => ({ bind: "bound" })),
  bindFragment: vi.fn(async () => "bound"),
}));

const users: Record<string, any> = {
  owner: { id: "owner", email: "owner@kanzlei.at", role: "admin", orgId: null, plan: "team" },
  invitee: { id: "invitee", email: "kollegin@kanzlei.at", role: "admin", orgId: null },
};
const update = vi.fn(async (id: string, patch: Record<string, unknown>) => ({
  ...users[id],
  ...patch,
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users[id] ?? null,
    listByOrg: async () => [],
    update,
  }),
  getOrgStore: () => ({
    getById: async (id: string) =>
      id === "org_a" ? { id, name: "Kanzlei A", ownerId: "owner" } : null,
  }),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

function join(userId: string) {
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "b",
    plan: "team",
    user: users[userId],
  } as any);
  return POST(
    new NextRequest("http://localhost:3000/api/org/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify({ token: "tok", org: "org_a", email: users[userId].email }),
    })
  );
}

describe("POST /api/org/join", () => {
  beforeEach(() => update.mockClear());

  it("an invited colleague joins as lawyer, not as administrator", async () => {
    const res = await join("invitee");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("invitee", { orgId: "org_a", role: "lawyer" });
  });

  it("the owner keeps the admin role when joining their own firm", async () => {
    const res = await join("owner");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("owner", { orgId: "org_a" });
  });
});
