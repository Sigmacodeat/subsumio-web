/* eslint-disable @typescript-eslint/no-explicit-any */
// Operator deactivation keeps every firm administrable: never the owner alone,
// never the last active admin.
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
vi.mock("@/lib/auth/revoke-access", () => ({ revokeUserAccess: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit-user", () => ({
  auditBrainForUser: async (u: any) => (u.orgId === "org_a" ? "b" : u.brainId),
}));

const users: Record<string, any> = {};
const update = vi.fn(async (id: string, patch: Record<string, unknown>) => {
  users[id] = { ...users[id], ...patch };
  return users[id];
});
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users[id] ?? null,
    listByOrg: async (orgId: string) => Object.values(users).filter((u) => u.orgId === orgId),
    update,
  }),
  getOrgStore: () => ({
    getById: async (id: string) =>
      id === "org_a" ? { id, ownerId: "owner", brainId: "b", name: "A", createdAt: "x" } : null,
  }),
}));

import { DELETE, PATCH } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { revokeUserAccess } from "@/lib/auth/revoke-access";
import { logAudit } from "@/lib/audit";

function call(method: "DELETE" | "PATCH", id: string, body?: unknown) {
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "ops",
    plan: "enterprise",
    user: {
      id: "operator",
      email: "ops@subsumio.example",
      role: "admin",
      orgId: null,
      twoFactorEnabled: true,
      emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
  } as any);
  const req = new NextRequest(`http://localhost:3000/api/admin/users/${id}`, {
    method,
    headers: {
      host: "ops.subsum.io",
      "Content-Type": "application/json",
      "x-csrf-token": "t",
      cookie: "sb_csrf=t",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const handler = method === "DELETE" ? DELETE : PATCH;
  return handler(req, { params: Promise.resolve({ id }) } as any);
}

beforeEach(() => {
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", "ops@subsumio.example");
  update.mockClear();
  vi.mocked(revokeUserAccess).mockClear();
  for (const k of Object.keys(users)) delete users[k];
  users.owner = { id: "owner", role: "admin", orgId: "org_a" };
  users.lawyer = { id: "lawyer", role: "lawyer", orgId: "org_a" };
});

describe("operator deactivation", () => {
  it("DELETE refuses the owner of a firm", async () => {
    const res = await call("DELETE", "owner");
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("owner_must_stay_active");
    expect(update).not.toHaveBeenCalled();
  });

  it("PATCH deactivatedAt refuses the last active admin", async () => {
    users.owner.role = "lawyer";
    users.admin2 = { id: "admin2", role: "admin", orgId: "org_a" };
    const res = await call("PATCH", "admin2", { deactivatedAt: "2026-09-26T00:00:00.000Z" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("last_admin");
    expect(update).not.toHaveBeenCalled();
  });

  it("DELETE deactivates another member and ends their access", async () => {
    const res = await call("DELETE", "lawyer");
    expect(res.status).toBe(200);
    expect(users.lawyer.deactivatedAt).toBeTruthy();
    expect(revokeUserAccess).toHaveBeenCalledWith("lawyer");
  });

  it("records the change with its target in the operator's and the firm's protocol", async () => {
    vi.mocked(logAudit).mockClear();
    await call("DELETE", "lawyer");
    const calls = vi.mocked(logAudit).mock.calls.filter((c) => c[0] === "admin.user_deactivate");
    expect(calls.map((c) => (c[2] as any).brainId).sort()).toEqual(["b", "ops"]);
    for (const c of calls) expect((c[2] as any).entityId).toBe("lawyer");
  });
});
