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
// Mutable so tests can attach inviteRevokedAt cutoffs.
const orgA: Record<string, any> = { id: "org_a", name: "Kanzlei A", ownerId: "owner" };
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users[id] ?? null,
    listByOrg: async () => [],
    update,
  }),
  getOrgStore: () => ({
    getById: async (id: string) => (id === "org_a" ? orgA : null),
  }),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { verifyActionToken } from "@/lib/auth/tokens";

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
  beforeEach(() => {
    update.mockClear();
    delete orgA.inviteRevokedAt;
    vi.mocked(verifyActionToken).mockResolvedValue({ bind: "bound" } as never);
  });

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

  it("rejects an invite minted before the member's removal (invite revoked)", async () => {
    // The member was removed at T — their outstanding invite links die.
    orgA.inviteRevokedAt = { "kollegin@kanzlei.at": "2026-06-01T00:00:00.000Z" };
    // Token without iat (minted before the field existed) counts as ancient.
    const res = await join("invitee");
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invite whose iat is at/before the revocation cutoff", async () => {
    orgA.inviteRevokedAt = { "kollegin@kanzlei.at": "2026-06-01T12:00:00.000Z" };
    vi.mocked(verifyActionToken).mockResolvedValue({
      bind: "bound",
      iat: Math.floor(Date.parse("2026-06-01T11:00:00.000Z") / 1000),
    } as never);
    const res = await join("invitee");
    expect(res.status).toBe(403);
  });

  it("accepts a fresh invite minted after the cutoff (re-invite works)", async () => {
    orgA.inviteRevokedAt = { "kollegin@kanzlei.at": "2020-01-01T00:00:00.000Z" };
    vi.mocked(verifyActionToken).mockResolvedValue({
      bind: "bound",
      iat: Math.floor(Date.now() / 1000),
    } as never);
    const res = await join("invitee");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("invitee", { orgId: "org_a", role: "lawyer" });
  });
});
