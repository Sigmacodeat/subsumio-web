// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// SCIM PATCH as the common IdPs send it: a path-less replace with an object
// value (Okta) and string booleans (Microsoft Entra ID) must deactivate, and a
// deactivation ends the person's standing access.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/audit-user", () => ({ auditBrainForOrg: async () => "brain-org" }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/provision", () => ({ provisionBrainAsync: vi.fn() }));
vi.mock("@/lib/auth/revoke-access", () => ({
  revokeUserAccess: vi.fn(async () => ({ keysRevoked: 0 })),
}));

let current: Record<string, any>;
const update = vi.fn(async (id: string, patch: Record<string, unknown>) => {
  current = { ...current, id, ...patch };
  return current;
});

vi.mock("@/lib/auth/store", () => ({
  buildNewUser: async (input: Record<string, unknown>) => ({ id: "new", brainId: "b", ...input }),
  getStore: () => ({
    getById: async (id: string) => (id === current.id ? current : null),
    getByScimExternalId: async (ext: string) => (ext === current.scimExternalId ? current : null),
    getByEmail: async (email: string) => (email === current.email ? current : null),
    update,
    create: async (u: any) => u,
  }),
}));

vi.mock("@/lib/scim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scim")>();
  return { ...actual, requireScimAuth: async () => ({ orgId: "org-1" }) };
});

import { PATCH, PUT } from "./route";
import { revokeUserAccess } from "@/lib/auth/revoke-access";

const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

function patch(operations: unknown[]) {
  const req = new NextRequest("http://localhost:3000/api/scim/Users/u-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/scim+json", authorization: "Bearer x" },
    body: JSON.stringify({ schemas: [PATCH_SCHEMA], Operations: operations }),
  });
  return PATCH(req, { params: Promise.resolve({ id: "u-1" }) } as any);
}

beforeEach(() => {
  update.mockClear();
  vi.mocked(revokeUserAccess).mockClear();
  current = {
    id: "u-1",
    orgId: "org-1",
    email: "ra@kanzlei.example",
    name: "Ra Example",
    role: "lawyer",
    scimExternalId: "idp-1",
    deactivatedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
});

describe("PATCH /api/scim/Users/:id — deactivation", () => {
  it("deactivates with a path-less replace (Okta form)", async () => {
    const res = await patch([{ op: "replace", value: { active: false } }]);
    expect(res.status).toBe(200);
    expect((await res.json()).active).toBe(false);
    expect(current.deactivatedAt).toBeTruthy();
    expect(revokeUserAccess).toHaveBeenCalledWith("u-1");
  });

  it('deactivates with the string "False" (Entra form)', async () => {
    const res = await patch([{ op: "Replace", path: "active", value: "False" }]);
    expect(res.status).toBe(200);
    expect((await res.json()).active).toBe(false);
    expect(current.deactivatedAt).toBeTruthy();
    expect(revokeUserAccess).toHaveBeenCalledWith("u-1");
  });

  it('reactivates with "True"', async () => {
    current.deactivatedAt = "2026-02-01T00:00:00.000Z";
    const res = await patch([{ op: "Replace", path: "active", value: "True" }]);
    expect(res.status).toBe(200);
    expect(current.deactivatedAt).toBeNull();
    expect(revokeUserAccess).not.toHaveBeenCalled();
  });

  it("refuses a value that is not a boolean", async () => {
    const res = await patch([{ op: "replace", path: "active", value: "yes" }]);
    expect(res.status).toBe(400);
    expect((await res.json()).scimType).toBe("invalidValue");
    expect(update).not.toHaveBeenCalled();
    expect(current.deactivatedAt).toBeNull();
  });

  it("applies other attributes of a path-less replace and keeps the account active", async () => {
    const res = await patch([
      { op: "replace", value: { displayName: "Neu Name", name: { givenName: "Neu" } } },
    ]);
    expect(res.status).toBe(200);
    expect(current.name).toBe("Neu Name");
    expect(current.deactivatedAt).toBeNull();
    expect(revokeUserAccess).not.toHaveBeenCalled();
  });
});

describe("PUT /api/scim/Users/:id — missing active", () => {
  it("leaves an active account active when active is absent", async () => {
    const req = new NextRequest("http://localhost:3000/api/scim/Users/u-1", {
      method: "PUT",
      headers: { "Content-Type": "application/scim+json", authorization: "Bearer x" },
      body: JSON.stringify({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        userName: "ra@kanzlei.example",
        emails: [{ value: "ra@kanzlei.example", primary: true }],
        displayName: "Ra Example",
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "u-1" }) } as any);
    expect(res.status).toBe(200);
    expect(current.deactivatedAt).toBeNull();
    expect(revokeUserAccess).not.toHaveBeenCalled();
  });
});
