/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));

const users: Record<string, any> = {
  owner: { id: "owner", role: "admin", orgId: "org_a" },
  member: { id: "member", role: "lawyer", orgId: "org_a" },
  foreign: { id: "foreign", role: "admin", orgId: "org_b" },
  solo: { id: "solo", role: "admin", orgId: null },
};
const baseUsers = structuredClone(users);
const update = vi.fn(async (id: string, patch: Record<string, unknown>) => ({
  ...users[id],
  ...patch,
}));

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users[id] ?? null,
    listByOrg: async (orgId: string) => Object.values(users).filter((u) => u.orgId === orgId),
    update,
  }),
  getOrgStore: () => ({
    getById: async (id: string) =>
      id === "org_a"
        ? { id, ownerId: "owner" }
        : id === "org_b"
          ? { id, ownerId: "foreign" }
          : null,
  }),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

function as(userId: string) {
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "b",
    plan: "team",
    user: users[userId],
  } as any);
}

function body(userId: string, role: string) {
  return new NextRequest("http://localhost:3000/api/team/role", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    body: JSON.stringify({ userId, role }),
  });
}

describe("POST /api/team/role", () => {
  beforeEach(() => {
    update.mockClear();
    for (const k of Object.keys(users)) delete users[k];
    Object.assign(users, structuredClone(baseUsers));
  });

  it("lets the firm owner change a member's role", async () => {
    as("owner");
    const res = await POST(body("member", "assistant"));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith("member", { role: "assistant" });
  });

  it("refuses targets outside the owner's firm", async () => {
    as("owner");
    expect((await POST(body("foreign", "client_viewer"))).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses admins without a firm (no cross-tenant role changes)", async () => {
    as("solo");
    expect((await POST(body("member", "admin"))).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("the owner cannot give up the admin role, even with a second admin", async () => {
    users.admin2 = { id: "admin2", role: "admin", orgId: "org_a" };
    as("owner");
    const res = await POST(body("owner", "lawyer"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("owner_must_stay_admin");
    expect(update).not.toHaveBeenCalled();
  });

  it("a deactivated admin does not count as the remaining admin", async () => {
    // Legacy record: the owner is not an admin.
    users.owner.role = "lawyer";
    users.admin2 = { id: "admin2", role: "admin", orgId: "org_a" };
    users.admin3 = { id: "admin3", role: "admin", orgId: "org_a", deactivatedAt: "2026-01-01" };
    as("owner");
    const res = await POST(body("admin2", "lawyer"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("last_admin");
    expect(update).not.toHaveBeenCalled();
  });

  it("records the old and the new role", async () => {
    as("owner");
    await POST(body("member", "assistant"));
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(logAudit)).toHaveBeenCalledWith(
      "team.role_change",
      "user",
      expect.objectContaining({ details: { oldRole: "lawyer", newRole: "assistant" } })
    );
  });
});
