/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));
vi.mock("@/lib/comments", () => ({
  listNotifications: vi.fn(async () => []),
  markNotificationRead: vi.fn(async () => undefined),
  markAllNotificationsRead: vi.fn(async () => undefined),
  createDeadlineNotification: vi.fn(async () => undefined),
  deleteNotification: vi.fn(async () => undefined),
  deleteAllReadNotifications: vi.fn(async () => 0),
}));

import { POST, PATCH, DELETE } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { can, forbidden, type RouteAction } from "@/lib/permissions";
import {
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  createDeadlineNotification,
} from "@/lib/comments";

function ctxFor(role: string) {
  return {
    headers: { "x-subsumio-source": "org_firm" },
    brainId: "org_firm",
    plan: "team",
    user: { id: `u_${role}`, email: `${role}@kanzlei.example`, role, orgId: "org_1" },
  };
}

/** Real RBAC: the mock only replaces session lookup, not the role check. */
function asRole(role: string) {
  vi.mocked(requireEngineContext).mockImplementation(async (_req: Request, action: RouteAction) => {
    const ctx = ctxFor(role);
    return can(ctx.user as any, action) ? (ctx as any) : forbidden(action);
  });
}

function req(method: string, body?: unknown) {
  return new NextRequest("http://localhost:3000/api/notifications", {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/notifications write access", () => {
  for (const role of ["lawyer", "assistant", "admin"]) {
    it(`lets ${role} mark, persist and delete their own notifications`, async () => {
      asRole(role);
      expect((await PATCH(req("PATCH", { id: "n_1" }))).status).toBe(200);
      expect((await POST(req("POST", { id: "n_1" }))).status).toBe(200);
      expect((await POST(req("POST", {}))).status).toBe(200);
      expect(
        (
          await POST(
            req("POST", {
              deadlines: [
                {
                  caseSlug: "legal/cases/a",
                  caseTitle: "Akte A",
                  deadlineDate: "2026-10-01",
                  daysRemaining: 3,
                  isOverdue: false,
                },
              ],
            })
          )
        ).status
      ).toBe(200);
      expect((await DELETE(req("DELETE", { id: "n_1" }))).status).toBe(200);
      expect(createDeadlineNotification).toHaveBeenCalled();
      expect(markAllNotificationsRead).toHaveBeenCalled();
    });
  }

  it("scopes every write to the calling user, never to a foreign owner", async () => {
    asRole("lawyer");
    await PATCH(req("PATCH", { id: "n_foreign" }));
    await DELETE(req("DELETE", { id: "n_foreign" }));
    expect(markNotificationRead).toHaveBeenCalledWith("n_foreign", {
      userId: "u_lawyer",
      brainId: "org_firm",
    });
    expect(deleteNotification).toHaveBeenCalledWith("n_foreign", {
      userId: "u_lawyer",
      brainId: "org_firm",
    });
  });
});
