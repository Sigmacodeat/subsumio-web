/* eslint-disable @typescript-eslint/no-explicit-any */
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

const org: Record<string, any> = { id: "org-1", ownerId: "admin-1", scimGroupRoles: {} };
const orgUpdate = vi.fn(async (_id: string, patch: Record<string, unknown>) => {
  Object.assign(org, patch);
  return org;
});
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => null,
  getOrgStore: () => ({
    getById: async (id: string) => (id === org.id ? org : null),
    update: (id: string, patch: Record<string, unknown>) => orgUpdate(id, patch),
  }),
}));
const applyScimGroupRoles = vi.fn(async (_orgId: string, _ids: Set<string>) => 1);
vi.mock("@/lib/scim", () => ({
  applyScimGroupRoles: (orgId: string, ids: Set<string>) => applyScimGroupRoles(orgId, ids),
}));
vi.mock("@/lib/scim-groups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scim-groups")>();
  return {
    ...actual,
    listGroupsForOrg: async () => [
      { id: "g1", displayName: "Anwälte", members: [{ value: "u1" }], _orgId: "org-1" },
      { id: "g2", displayName: "Sport", members: [{ value: "u2" }], _orgId: "org-1" },
    ],
  };
});

import { GET, PUT } from "./route";
import { requireEngineContext } from "@/lib/engine";

const ADMIN = { id: "admin-1", email: "a@kanzlei.example", role: "admin", orgId: "org-1" };

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost:3000/api/scim/group-roles", {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("/api/scim/group-roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    org.scimGroupRoles = {};
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: {},
      brainId: "brain-org-1",
      plan: "team",
      user: ADMIN,
    } as any);
  });

  it("never accepts admin as a group role", async () => {
    const res = await PUT(req("PUT", { mapping: { Chefs: "admin" } }));
    expect(res.status).toBe(400);
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  it("stores the mapping (normalised) and applies it to members of changed groups only", async () => {
    const res = await PUT(req("PUT", { mapping: { " Anwälte ": "lawyer", Sport: null } }));
    expect(res.status).toBe(200);
    expect(org.scimGroupRoles).toEqual({ anwälte: "lawyer" });
    expect(applyScimGroupRoles).toHaveBeenCalledWith("org-1", new Set(["u1"]));
  });

  it("lists the firm's groups with their mapped role", async () => {
    org.scimGroupRoles = { anwälte: "lawyer" };
    const { data } = await (await GET(req("GET"))).json();
    expect(data.groups).toEqual([
      { id: "g1", displayName: "Anwälte", memberCount: 1, role: "lawyer" },
      { id: "g2", displayName: "Sport", memberCount: 1, role: null },
    ]);
  });

  it("is admin only", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: {},
      brainId: "brain-org-1",
      plan: "team",
      user: { ...ADMIN, role: "lawyer" },
    } as any);
    expect((await PUT(req("PUT", { mapping: {} }))).status).toBe(403);
  });
});
