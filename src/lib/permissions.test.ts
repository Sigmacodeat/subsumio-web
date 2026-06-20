// @vitest-environment node

import { describe, test, expect } from "vitest";
import { PERMISSIONS, can, forbidden, auditActionFor, type RouteAction } from "./permissions";
import type { User } from "./auth/store";

function mockUser(role: User["role"]): User {
  return {
    id: "test-id",
    email: "test@example.com",
    name: "Test User",
    passwordHash: "x",
    role,
    plan: "free",
    locale: "de",
    referralCode: "TESTCODE",
    referredBy: null,
    brainId: "brain_test",
    stripeCustomerId: null,
    createdAt: new Date().toISOString(),
  };
}

describe("PERMISSIONS helper functions", () => {
  test("canCreateInvoice — admin and lawyer only", () => {
    expect(PERMISSIONS.canCreateInvoice("admin")).toBe(true);
    expect(PERMISSIONS.canCreateInvoice("lawyer")).toBe(true);
    expect(PERMISSIONS.canCreateInvoice("assistant")).toBe(false);
    expect(PERMISSIONS.canCreateInvoice("client_viewer")).toBe(false);
  });

  test("canEditSettings — admin only", () => {
    expect(PERMISSIONS.canEditSettings("admin")).toBe(true);
    expect(PERMISSIONS.canEditSettings("lawyer")).toBe(false);
  });

  test("canManageTeam — admin only", () => {
    expect(PERMISSIONS.canManageTeam("admin")).toBe(true);
    expect(PERMISSIONS.canManageTeam("lawyer")).toBe(false);
  });

  test("canViewBrain — not client_viewer", () => {
    expect(PERMISSIONS.canViewBrain("admin")).toBe(true);
    expect(PERMISSIONS.canViewBrain("lawyer")).toBe(true);
    expect(PERMISSIONS.canViewBrain("assistant")).toBe(true);
    expect(PERMISSIONS.canViewBrain("client_viewer")).toBe(false);
  });

  test("canUseAI — admin, lawyer, assistant", () => {
    expect(PERMISSIONS.canUseAI("admin")).toBe(true);
    expect(PERMISSIONS.canUseAI("lawyer")).toBe(true);
    expect(PERMISSIONS.canUseAI("assistant")).toBe(true);
    expect(PERMISSIONS.canUseAI("client_viewer")).toBe(false);
  });
});

describe("can (RBAC matrix)", () => {
  test("admin can do everything", () => {
    const user = mockUser("admin");
    const actions: RouteAction[] = [
      "brain.read", "brain.write", "brain.delete",
      "admin.*", "settings.write", "team.role_change",
      "billing.write", "connector.write",
    ];
    for (const action of actions) {
      expect(can(user, action)).toBe(true);
    }
  });

  test("lawyer can write brain but not admin actions", () => {
    const user = mockUser("lawyer");
    expect(can(user, "brain.write")).toBe(true);
    expect(can(user, "brain.delete")).toBe(true);
    expect(can(user, "admin.*")).toBe(false);
    expect(can(user, "settings.write")).toBe(false);
    expect(can(user, "team.role_change")).toBe(false);
  });

  test("assistant can read brain but not delete", () => {
    const user = mockUser("assistant");
    expect(can(user, "brain.read")).toBe(true);
    expect(can(user, "brain.write")).toBe(true);
    expect(can(user, "brain.delete")).toBe(false);
  });

  test("client_viewer can only read brain and settings", () => {
    const user = mockUser("client_viewer");
    expect(can(user, "brain.read")).toBe(true);
    expect(can(user, "brain.write")).toBe(false);
    expect(can(user, "brain.delete")).toBe(false);
    expect(can(user, "settings.read")).toBe(true);
    expect(can(user, "settings.write")).toBe(false);
  });

  test("contract_draft — lawyer only (not assistant)", () => {
    expect(can(mockUser("lawyer"), "legal.contract_draft")).toBe(true);
    expect(can(mockUser("assistant"), "legal.contract_draft")).toBe(false);
  });

  test("billing.read — admin and lawyer", () => {
    expect(can(mockUser("admin"), "billing.read")).toBe(true);
    expect(can(mockUser("lawyer"), "billing.read")).toBe(true);
    expect(can(mockUser("assistant"), "billing.read")).toBe(false);
  });
});

describe("forbidden", () => {
  test("returns 403 response", async () => {
    const res = forbidden("test-action");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.message).toContain("test-action");
  });

  test("works without action parameter", async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe("Insufficient permissions");
  });
});

describe("auditActionFor", () => {
  test("maps brain.read to case.view", () => {
    expect(auditActionFor("brain.read")).toBe("case.view");
  });

  test("maps brain.write to case.create", () => {
    expect(auditActionFor("brain.write")).toBe("case.create");
  });

  test("maps brain.delete to document.delete", () => {
    expect(auditActionFor("brain.delete")).toBe("document.delete");
  });

  test("maps settings.write to settings.update", () => {
    expect(auditActionFor("settings.write")).toBe("settings.update");
  });

  test("maps admin.* to settings.update", () => {
    expect(auditActionFor("admin.*")).toBe("settings.update");
  });

  test("maps legal actions correctly", () => {
    expect(auditActionFor("legal.conflict")).toBe("conflict.check");
    expect(auditActionFor("legal.anonymize")).toBe("legal.anonymize");
    expect(auditActionFor("legal.contract_draft")).toBe("legal.contract_draft");
  });
});
