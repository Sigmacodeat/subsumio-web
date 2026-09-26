// @vitest-environment node
// Directory changes that SCIM applies: e-mail changes (only to a free
// address, audited, sessions end) and the firm's group → role mapping (never
// admin, admins/owner untouched, leaving all mapped groups never raises).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

type U = {
  id: string;
  email: string;
  name: string;
  role: string;
  orgId: string | null;
  scimExternalId?: string | null;
  deactivatedAt?: string | null;
};
const users = new Map<string, U>();
const org = {
  id: "org-1",
  brainId: "brain-org-1",
  ownerId: "owner",
  scimGroupRoles: {} as Record<string, string>,
};

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => null,
  buildNewUser: async (input: Record<string, unknown>) => ({ id: "new", role: "admin", ...input }),
  getOrgStore: () => ({ getById: async (id: string) => (id === org.id ? org : null) }),
  getStore: () => ({
    getById: async (id: string) => users.get(id) ?? null,
    getByEmail: async (email: string) =>
      [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null,
    getByScimExternalId: async (ext: string) =>
      [...users.values()].find((u) => u.scimExternalId === ext) ?? null,
    update: async (id: string, patch: Partial<U>) => {
      const next = { ...users.get(id)!, ...patch };
      users.set(id, next);
      return next;
    },
    create: async (u: U) => u,
  }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/audit-user", () => ({ auditBrainForOrg: async () => "brain-org-1" }));
vi.mock("@/lib/provision", () => ({ provisionBrainAsync: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/revoke-access", () => ({ revokeUserAccess: vi.fn(async () => undefined) }));
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => undefined) }));

import { applyScimGroupRoles, provisionOrUpdateUser, syncRolesAfterGroupChange } from "./scim";
import { FileScimGroupStore, setScimGroupStoreForTests, type StoredScimGroup } from "./scim-groups";
import { logAudit } from "@/lib/audit";
import { revokeAllSessions } from "@/lib/auth/session";
import { sendMail } from "@/lib/mail";

function user(id: string, role: string, extra: Partial<U> = {}): U {
  return { id, email: `${id}@kanzlei.example`, name: id, role, orgId: org.id, ...extra };
}

function grp(id: string, displayName: string, members: string[]): StoredScimGroup {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    id,
    displayName,
    members: members.map((value) => ({ value })),
    _orgId: org.id,
  } as StoredScimGroup;
}

let dir: string;
let store: FileScimGroupStore;

beforeEach(() => {
  vi.clearAllMocks();
  users.clear();
  org.scimGroupRoles = {};
  dir = mkdtempSync(path.join(tmpdir(), "scim-dir-"));
  store = new FileScimGroupStore(path.join(dir, "groups.json"));
  setScimGroupStoreForTests(store);
});
afterEach(() => {
  setScimGroupStoreForTests(null);
  rmSync(dir, { recursive: true, force: true });
});

describe("SCIM e-mail changes", () => {
  const scim = (email: string) =>
    ({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: email,
      externalId: "idp-1",
      emails: [{ value: email, primary: true }],
    }) as Parameters<typeof provisionOrUpdateUser>[0];

  it("takes over a new, free address; sessions end and the old address is told", async () => {
    users.set("u1", user("u1", "assistant", { scimExternalId: "idp-1" }));
    const { user: updated } = await provisionOrUpdateUser(scim("neu@kanzlei.example"), org.id);
    expect(updated.email).toBe("neu@kanzlei.example");
    expect(revokeAllSessions).toHaveBeenCalledWith("u1");
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "u1@kanzlei.example" }));
    expect(logAudit).toHaveBeenCalledWith(
      "user.email_changed",
      "user",
      expect.objectContaining({ entityId: "u1" })
    );
  });

  it("keeps the address when another account uses it, and records the conflict", async () => {
    users.set("u1", user("u1", "assistant", { scimExternalId: "idp-1" }));
    users.set("other", user("other", "lawyer", { orgId: "org-2" }));
    const { user: updated } = await provisionOrUpdateUser(scim("other@kanzlei.example"), org.id);
    expect(updated.email).toBe("u1@kanzlei.example");
    expect(users.get("other")?.email).toBe("other@kanzlei.example");
    expect(revokeAllSessions).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      "scim.user_updated",
      "user",
      expect.objectContaining({ details: expect.objectContaining({ emailConflict: true }) })
    );
  });
});

describe("SCIM group → role mapping", () => {
  it("a member of a mapped group gets its role; admin and owner are never changed", async () => {
    org.scimGroupRoles = { anwälte: "lawyer" };
    users.set("u1", user("u1", "assistant"));
    users.set("adm", user("adm", "admin"));
    users.set("owner", user("owner", "lawyer"));
    const g = grp("g1", "Anwälte", ["u1", "adm", "owner"]);
    await store.put(g);
    await syncRolesAfterGroupChange(org.id, null, g);
    expect(users.get("u1")?.role).toBe("lawyer");
    expect(users.get("adm")?.role).toBe("admin");
    expect(users.get("owner")?.role).toBe("lawyer");
    expect(logAudit).toHaveBeenCalledWith(
      "team.role_change",
      "user",
      expect.objectContaining({
        details: { from: "assistant", to: "lawyer", source: "scim_group" },
      })
    );
  });

  it("an admin mapping is ignored — nobody becomes admin through a group", async () => {
    org.scimGroupRoles = { chefs: "admin" };
    users.set("u1", user("u1", "assistant"));
    const g = grp("g1", "Chefs", ["u1"]);
    await store.put(g);
    await applyScimGroupRoles(org.id, ["u1"]);
    expect(users.get("u1")?.role).toBe("assistant");
  });

  it("leaving every mapped group drops to the default, never higher than before", async () => {
    org.scimGroupRoles = { anwälte: "lawyer", mandanten: "client_viewer" };
    users.set("u1", user("u1", "lawyer"));
    users.set("u2", user("u2", "client_viewer"));
    const before = grp("g1", "Anwälte", ["u1"]);
    const after = grp("g1", "Anwälte", []);
    await store.put(after);
    await syncRolesAfterGroupChange(org.id, before, after);
    expect(users.get("u1")?.role).toBe("assistant");

    const mBefore = grp("g2", "Mandanten", ["u2"]);
    await store.put(grp("g2", "Mandanten", []));
    await syncRolesAfterGroupChange(org.id, mBefore, grp("g2", "Mandanten", []));
    expect(users.get("u2")?.role).toBe("client_viewer");
  });

  it("changes in unmapped groups and people of other firms are left alone", async () => {
    org.scimGroupRoles = { anwälte: "lawyer" };
    users.set("u1", user("u1", "lawyer"));
    users.set("x", user("x", "assistant", { orgId: "org-2" }));
    await syncRolesAfterGroupChange(org.id, grp("g9", "Sport", ["u1"]), grp("g9", "Sport", []));
    expect(users.get("u1")?.role).toBe("lawyer");
    const g = grp("g1", "Anwälte", ["x"]);
    await store.put(g);
    await syncRolesAfterGroupChange(org.id, null, g);
    expect(users.get("x")?.role).toBe("assistant");
  });
});
