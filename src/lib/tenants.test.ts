import { describe, expect, it } from "vitest";
import { isSoloTenantId, tenantIdForUser, tenantsFrom } from "@/lib/tenants";
import type { Org, User } from "@/lib/auth/store";

const user = (over: Partial<User>): User =>
  ({
    id: "u1",
    email: "a@example.at",
    name: "Anna Berger",
    role: "admin",
    brainId: "brain_a",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...over,
  }) as User;

const org: Org = {
  id: "org-1",
  name: "Kanzlei Huber",
  brainId: "brain_h",
  ownerId: "u2",
  createdAt: "2026-09-10T00:00:00.000Z",
};

describe("tenants", () => {
  it("lists firms and lawyers working alone, newest first", () => {
    const tenants = tenantsFrom(
      [org],
      [
        user({ id: "u1" }),
        user({ id: "u2", orgId: "org-1" }),
        user({ id: "u3", role: "client_viewer" }),
      ]
    );
    expect(tenants.map((t) => [t.id, t.kind])).toEqual([
      ["org-1", "org"],
      ["solo-u1", "solo"],
    ]);
  });

  it("a solo practice is billed and supported on the lawyer's own brain", () => {
    const [solo] = tenantsFrom([], [user({ id: "u1" })]);
    expect(solo).toMatchObject({
      name: "Kanzlei Anna Berger",
      brainId: "brain_a",
      billing: { ownerId: "u1", ownerType: "user" },
    });
    expect(isSoloTenantId(solo.id)).toBe(true);
  });

  it("links a user to their firm; portal guests have none", () => {
    expect(tenantIdForUser({ id: "u2", orgId: "org-1", role: "lawyer" })).toBe("org-1");
    expect(tenantIdForUser({ id: "u1", orgId: null, role: "admin" })).toBe("solo-u1");
    expect(tenantIdForUser({ id: "u3", orgId: null, role: "client_viewer" })).toBeNull();
  });
});
