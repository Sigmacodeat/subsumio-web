// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  generateSpaceSlug,
  generateSourceId,
  canManageSpace,
  canEditSpace,
  canViewSpace,
  spaceRolePermissions,
  type SpaceMember,
} from "./shared-spaces";

describe("generateSpaceSlug", () => {
  test("creates slug with prefix and timestamp", () => {
    const slug = generateSpaceSlug("Muster Kanzlei");
    expect(slug).toMatch(/^shared-spaces\/muster-kanzlei-[a-z0-9]+$/);
  });

  test("normalizes umlauts and special characters", () => {
    const slug = generateSpaceSlug("Größe & Sicherheit!");
    expect(slug).toMatch(/^shared-spaces\/groesse-[-a-z]*sicherheit-/);
  });

  test("truncates long titles", () => {
    const slug = generateSpaceSlug("a".repeat(100));
    const base = slug.replace("shared-spaces/", "").replace(/-[a-z0-9]+$/, "");
    expect(base.length).toBeLessThanOrEqual(40);
  });
});

describe("generateSourceId", () => {
  test("prefixes space id", () => {
    expect(generateSourceId("abc-123")).toBe("space-abc-123");
  });
});

describe("space permission helpers", () => {
  const owner: SpaceMember = {
    org_id: "o1",
    org_name: "A",
    role: "owner",
    invited_by: "u1",
    invited_at: "t1",
    status: "active",
  };
  const admin: SpaceMember = { ...owner, role: "admin" };
  const editor: SpaceMember = { ...owner, role: "editor" };
  const viewer: SpaceMember = { ...owner, role: "viewer" };
  const pending: SpaceMember = { ...owner, role: "viewer", status: "pending" };

  test("canManageSpace returns true for owner and admin only", () => {
    expect(canManageSpace(owner)).toBe(true);
    expect(canManageSpace(admin)).toBe(true);
    expect(canManageSpace(editor)).toBe(false);
    expect(canManageSpace(viewer)).toBe(false);
    expect(canManageSpace(undefined)).toBe(false);
  });

  test("canEditSpace returns true for owner, admin, editor", () => {
    expect(canEditSpace(owner)).toBe(true);
    expect(canEditSpace(admin)).toBe(true);
    expect(canEditSpace(editor)).toBe(true);
    expect(canEditSpace(viewer)).toBe(false);
  });

  test("canViewSpace returns true only for active members", () => {
    expect(canViewSpace(viewer)).toBe(true);
    expect(canViewSpace(pending)).toBe(false);
    expect(canViewSpace(undefined)).toBe(false);
  });
});

describe("spaceRolePermissions", () => {
  test("owner has all permissions", () => {
    expect(spaceRolePermissions("owner")).toEqual({
      can_invite: true,
      can_share_resources: true,
      can_delete_space: true,
      can_manage_members: true,
    });
  });

  test("admin can manage but not delete", () => {
    expect(spaceRolePermissions("admin")).toEqual({
      can_invite: true,
      can_share_resources: true,
      can_delete_space: false,
      can_manage_members: true,
    });
  });

  test("editor can share resources only", () => {
    expect(spaceRolePermissions("editor")).toEqual({
      can_invite: false,
      can_share_resources: true,
      can_delete_space: false,
      can_manage_members: false,
    });
  });

  test("viewer has no permissions", () => {
    expect(spaceRolePermissions("viewer")).toEqual({
      can_invite: false,
      can_share_resources: false,
      can_delete_space: false,
      can_manage_members: false,
    });
  });
});
