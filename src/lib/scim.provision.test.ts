// @vitest-environment node
// SCIM auto-provisioning (SEC-10): a person created by the firm's IdP never
// becomes a firm admin; an existing user keeps their role on update.
import { beforeEach, describe, expect, it, vi } from "vitest";

const created: Array<Record<string, unknown>> = [];
const updates: Array<Record<string, unknown>> = [];
let existing: Record<string, unknown> | null = null;

vi.mock("@/lib/auth/store", () => ({
  // Mirrors the real default: a brand-new signup founds a firm as admin.
  buildNewUser: async (input: Record<string, unknown>) => ({
    id: "new-user",
    brainId: "brain-new",
    role: "admin",
    ...input,
  }),
  getStore: () => ({
    getByScimExternalId: async () => existing,
    getByEmail: async () => existing,
    create: async (u: Record<string, unknown>) => {
      created.push(u);
      return u;
    },
    update: async (id: string, patch: Record<string, unknown>) => {
      updates.push(patch);
      return { ...(existing ?? {}), id, ...patch };
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/provision", () => ({ provisionBrainAsync: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/revoke-access", () => ({
  revokeUserAccess: vi.fn(async () => ({ keysRevoked: 0 })),
}));

import {
  SCIM_DEFAULT_ROLE,
  parseScimBoolean,
  provisionOrUpdateUser,
  type SCIMUser,
} from "./scim";
import { revokeUserAccess } from "@/lib/auth/revoke-access";

const scimUser: SCIMUser = {
  schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
  userName: "sekretariat@kanzlei.example",
  externalId: "idp-1",
  name: { givenName: "Sek", familyName: "Retariat" },
  emails: [{ value: "sekretariat@kanzlei.example", primary: true }],
  active: true,
} as SCIMUser;

beforeEach(() => {
  vi.mocked(revokeUserAccess).mockClear();
  created.length = 0;
  updates.length = 0;
  existing = null;
});

describe("provisionOrUpdateUser", () => {
  it("creates a new user with a non-admin default role", async () => {
    const { user, created: isNew } = await provisionOrUpdateUser(scimUser, "org-1");
    expect(isNew).toBe(true);
    expect(user.role).toBe(SCIM_DEFAULT_ROLE);
    expect(user.role).not.toBe("admin");
    expect(created[0].orgId).toBe("org-1");
  });

  it("does not touch the role of an existing member on update", async () => {
    existing = { id: "u-1", orgId: "org-1", role: "lawyer", email: "sekretariat@kanzlei.example" };
    const { user } = await provisionOrUpdateUser(scimUser, "org-1");
    expect(user.role).toBe("lawyer");
    expect(updates[0]).not.toHaveProperty("role");
  });
});

describe("active attribute", () => {
  const withoutActive = { ...scimUser } as SCIMUser;
  delete (withoutActive as { active?: boolean }).active;

  it("creates an active account when active is absent", async () => {
    await provisionOrUpdateUser(withoutActive, "org-1");
    expect(created[0].deactivatedAt).toBeUndefined();
  });

  it("leaves an existing account unchanged when active is absent", async () => {
    existing = { id: "u-1", orgId: "org-1", role: "lawyer", deactivatedAt: null };
    await provisionOrUpdateUser(withoutActive, "org-1");
    expect(updates[0]).not.toHaveProperty("deactivatedAt");
    expect(revokeUserAccess).not.toHaveBeenCalled();
  });

  it("deactivates on explicit false and ends standing access", async () => {
    existing = { id: "u-1", orgId: "org-1", role: "lawyer", deactivatedAt: null };
    await provisionOrUpdateUser({ ...scimUser, active: false }, "org-1");
    expect(updates[0].deactivatedAt).toBeTruthy();
    expect(revokeUserAccess).toHaveBeenCalledWith("u-1");
  });
});

describe("parseScimBoolean", () => {
  it("accepts JSON booleans and true/false strings in any case", () => {
    expect(parseScimBoolean(false)).toBe(false);
    expect(parseScimBoolean("False")).toBe(false);
    expect(parseScimBoolean("false")).toBe(false);
    expect(parseScimBoolean(true)).toBe(true);
    expect(parseScimBoolean("True")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const v of ["yes", "0", 0, 1, null, undefined, {}]) expect(parseScimBoolean(v)).toBeNull();
  });
});
