import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Org, User } from "@/lib/auth/store";

const users = new Map<string, User>();
const orgs = new Map<string, Org>();

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users.get(id) ?? null,
    listByOrg: async (orgId: string) => [...users.values()].filter((u) => u.orgId === orgId),
    update: async (id: string, patch: Partial<User>) => {
      const next = { ...users.get(id)!, ...patch };
      users.set(id, next);
      return next;
    },
  }),
  getOrgStore: () => ({
    getById: async (id: string) => orgs.get(id) ?? null,
    update: async (id: string, patch: Partial<Org>) => {
      const next = { ...orgs.get(id)!, ...patch };
      orgs.set(id, next);
      return next;
    },
  }),
}));
const revoked: string[] = [];
vi.mock("@/lib/auth/session", () => ({
  revokeAllSessions: async (id: string) => void revoked.push(id),
}));

import { getTenant } from "@/lib/tenants";
import {
  reactivateTenant,
  setMemberRole,
  suspendTenant,
  transferOwnership,
  TenantAdminFailure,
} from "@/lib/tenant-admin";
import { isAccountBlocked } from "@/lib/auth/account-status";

const member = (id: string, role: User["role"], over: Partial<User> = {}): User =>
  ({
    id,
    email: `${id}@example.at`,
    name: id,
    role,
    orgId: "org-1",
    brainId: "b",
    createdAt: "2026-09-01",
    ...over,
  }) as User;

async function firm() {
  return (await getTenant("org-1"))!;
}
async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (err) {
    return err instanceof TenantAdminFailure ? err.code : String(err);
  }
}

beforeEach(() => {
  users.clear();
  orgs.clear();
  revoked.length = 0;
  orgs.set("org-1", {
    id: "org-1",
    name: "Kanzlei Huber",
    brainId: "b",
    ownerId: "owner",
    createdAt: "2026-09-01",
  });
  users.set("owner", member("owner", "admin"));
  users.set("lawyer", member("lawyer", "lawyer"));
  users.set("left", member("left", "assistant", { deactivatedAt: "2026-09-02" }));
  users.set("solo", member("solo", "admin", { orgId: null }));
});

describe("suspending a firm", () => {
  it("signs out and blocks every active member, and restores exactly those", async () => {
    const { signedOut } = await suspendTenant(await firm(), {
      reason: "Zahlungsverzug seit 60 Tagen",
      operatorEmail: "ops@x",
    });
    expect(signedOut).toBe(2);
    expect(revoked.sort()).toEqual(["lawyer", "owner"]);
    expect(await isAccountBlocked(users.get("owner"))).toBe(true);
    expect(
      await code(
        suspendTenant(await firm(), { reason: "noch einmal sperren", operatorEmail: "ops@x" })
      )
    ).toBe("already_suspended");

    await reactivateTenant(await firm());
    expect(users.get("owner")!.deactivatedAt).toBeNull();
    expect(users.get("lawyer")!.deactivatedAt).toBeNull();
    // deactivated by the firm itself before the suspension: stays deactivated
    expect(users.get("left")!.deactivatedAt).toBe("2026-09-02");
    expect(orgs.get("org-1")!.suspendedAt).toBeNull();
  });

  it("blocks an account added after the suspension through the firm status", async () => {
    await suspendTenant(await firm(), {
      reason: "Zahlungsverzug seit 60 Tagen",
      operatorEmail: "ops@x",
    });
    expect(await isAccountBlocked(member("late", "lawyer"))).toBe(true);
    expect(await isAccountBlocked(member("other", "lawyer", { orgId: "org-2" }))).toBe(false);
  });

  it("works for a solo practice", async () => {
    const solo = (await getTenant("solo-solo"))!;
    await suspendTenant(solo, {
      reason: "Missbrauch gemeldet und geprüft",
      operatorEmail: "ops@x",
    });
    expect(await isAccountBlocked(users.get("solo"))).toBe(true);
    await reactivateTenant(solo);
    expect(await isAccountBlocked(users.get("solo"))).toBe(false);
  });
});

describe("roles and ownership", () => {
  it("keeps the owner admin and never leaves a firm without an admin", async () => {
    expect(await code(setMemberRole(await firm(), "owner", "lawyer"))).toBe(
      "owner_must_stay_admin"
    );
    await setMemberRole(await firm(), "lawyer", "admin");
    await transferOwnership(await firm(), "lawyer");
    expect(orgs.get("org-1")!.ownerId).toBe("lawyer");
    await setMemberRole(await firm(), "owner", "lawyer");
    expect(await code(setMemberRole(await firm(), "lawyer", "assistant"))).toBe(
      "owner_must_stay_admin"
    );
  });

  it("refuses the last admin even when they are not the owner", async () => {
    orgs.set("org-1", { ...orgs.get("org-1")!, ownerId: "lawyer" });
    users.set("lawyer", member("lawyer", "lawyer"));
    expect(await code(setMemberRole(await firm(), "owner", "assistant"))).toBe("last_admin");
  });

  it("a new owner becomes admin, signs in again, and must be an active member", async () => {
    await transferOwnership(await firm(), "lawyer");
    expect(users.get("lawyer")!.role).toBe("admin");
    // whoever paid keeps paying
    expect(orgs.get("org-1")!.billingUserId).toBe("owner");
    expect(revoked).toContain("lawyer");
    expect(await code(transferOwnership(await firm(), "left"))).toBe("member_deactivated");
    expect(await code(transferOwnership(await firm(), "solo"))).toBe("not_a_member");
  });
});
