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
const revokeSession = vi.fn(async () => true);
const revokeAllSessions = vi.fn(async () => undefined);
vi.mock("@/lib/auth/session-registry", () => ({
  revokeSession: (...a: unknown[]) => revokeSession(...(a as [])),
}));
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "sb_session",
  revokeAllSessions: (...a: unknown[]) => revokeAllSessions(...(a as [])),
}));
const unregisterPushEndpoint = vi.fn(async () => 1);
vi.mock("@/lib/push-token-store", () => ({
  unregisterPushEndpoint: (...a: unknown[]) => unregisterPushEndpoint(...(a as [])),
}));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";
import { logAudit } from "@/lib/audit";

const USER = { id: "u_1", email: "anwalt@kanzlei.example", role: "lawyer", orgId: "org_1" };

function logout(body?: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "org_firm",
    user: USER,
    sessionId: "sid_1",
  } as any);
});

describe("POST /api/auth/logout", () => {
  it("records the sign-out exactly once, in the firm's protocol", async () => {
    await logout();
    const entries = vi.mocked(logAudit).mock.calls.filter((c) => c[0] === "user.logout");
    expect(entries).toHaveLength(1);
    expect(entries[0][2]).toEqual(expect.objectContaining({ brainId: "org_firm", userId: "u_1" }));
  });

  it("ends this device's push registration together with the session", async () => {
    const res = await logout({ pushEndpoint: "https://push.example/device-1" });
    expect(res.status).toBe(200);
    expect(revokeSession).toHaveBeenCalledWith("u_1", "sid_1");
    expect(unregisterPushEndpoint).toHaveBeenCalledWith("u_1", "https://push.example/device-1");
  });

  it("still signs out without a body", async () => {
    const res = await logout();
    expect(res.status).toBe(200);
    expect(revokeSession).toHaveBeenCalled();
    expect(unregisterPushEndpoint).not.toHaveBeenCalled();
  });
});
