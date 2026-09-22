// @vitest-environment node

import { describe, test, expect, vi } from "vitest";

vi.mock("./session", () => ({
  consumeDemoBudget: vi.fn(async () => ({ allowed: true, used: 1, cap: 8 })),
}));

import { demoGuard, DEMO_BLOCKED_ACTIONS, DEMO_BUDGET_ACTIONS } from "./guard";
import { consumeDemoBudget } from "./session";

const req = (pathname: string) => ({ nextUrl: { pathname } });

describe("demoGuard", () => {
  test("blocks dangerous actions with 403 demo_restricted", async () => {
    for (const action of [
      "billing.write",
      "admin.user_update",
      "workflow.start",
      "copilot.tool",
      "push.register",
    ] as const) {
      const res = await demoGuard(req("/api/x"), action, "sid-1");
      expect(res?.status).toBe(403);
      const body = await res!.json();
      expect(body.error).toBe("demo_restricted");
    }
  });

  test("blocks upload/email paths even for allowed actions", async () => {
    for (const path of ["/api/upload/file", "/api/email/send", "/api/admin/x"]) {
      const res = await demoGuard(req(path), "brain.write", "sid-1");
      expect(res?.status).toBe(403);
    }
  });

  test("auth routes stay reachable — logout ends the demo, login/signup is the upgrade path", async () => {
    for (const path of ["/api/auth/logout", "/api/auth/login", "/api/auth/signup"]) {
      const res = await demoGuard(req(path), "brain.read", "sid-1");
      expect(res).toBeNull();
    }
  });

  test("passes allowed read/write actions through without touching budget", async () => {
    vi.mocked(consumeDemoBudget).mockClear();
    for (const action of ["brain.read", "brain.write", "legal.ground"] as const) {
      const res = await demoGuard(req("/api/brain/pages"), action, "sid-1");
      expect(res).toBeNull();
    }
    expect(consumeDemoBudget).not.toHaveBeenCalled();
  });

  test("budget actions consume the session budget", async () => {
    vi.mocked(consumeDemoBudget).mockClear();
    const res = await demoGuard(req("/api/think"), "query.submit", "sid-1");
    expect(res).toBeNull();
    expect(consumeDemoBudget).toHaveBeenCalledWith("sid-1");
  });

  test("exhausted budget returns 429 demo_limit", async () => {
    vi.mocked(consumeDemoBudget).mockResolvedValueOnce({
      allowed: false,
      used: 8,
      cap: 8,
    });
    const res = await demoGuard(req("/api/think"), "query.submit", "sid-1");
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.error).toBe("demo_limit");
    expect(body.used).toBe(8);
  });

  test("sanity: every blocked action is a real RouteAction name", () => {
    // Guard against typos silently dead-lettering the denylist.
    expect(DEMO_BLOCKED_ACTIONS.has("admin.*")).toBe(true);
    expect(DEMO_BUDGET_ACTIONS.has("query.submit")).toBe(true);
  });
});
