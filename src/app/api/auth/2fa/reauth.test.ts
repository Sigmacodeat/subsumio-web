// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// SEC-14: an active second factor can only be replaced or switched off with
// proof of BOTH factors — a session alone is not enough.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.SUBSUMIO_DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/subsumio-2fa-reauth-${process.pid}`;
});

const users = new Map<string, any>();
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => null,
  getStore: () => ({
    getById: async (id: string) => (users.has(id) ? { ...users.get(id) } : null),
    update: async (id: string, patch: object) => {
      const next = { ...users.get(id), ...patch };
      users.set(id, next);
      return next;
    },
  }),
}));
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: vi.fn(async (pw: string) => pw === "richtig"),
}));
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), SYSTEM_BRAIN: "system" }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { POST as SETUP } from "./setup/route";
import { POST as DISABLE } from "./disable/route";
import { requireEngineContext } from "@/lib/engine";
import { generateSecret, generateTOTP } from "@/lib/totp";
import { clearSecondFactorLockout } from "@/lib/auth/lockout";

let secret: string;

function call(handler: typeof SETUP, path: string, body?: unknown) {
  return handler(
    new NextRequest(`http://localhost:3000${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

describe("2FA re-authentication (SEC-14)", () => {
  beforeEach(async () => {
    secret = generateSecret();
    const user = {
      id: "u1",
      email: "anwalt@kanzlei.example",
      role: "lawyer",
      brainId: "b1",
      passwordHash: "h",
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorBackupCodes: [],
      twoFactorLastStep: null,
    };
    users.set("u1", user);
    vi.mocked(requireEngineContext).mockResolvedValue({
      headers: {},
      brainId: "b1",
      plan: "team",
      user,
    } as any);
    await clearSecondFactorLockout("u1");
  });

  it("setup with active 2FA and no re-authentication → 403, secret unchanged", async () => {
    const res = await call(SETUP, "/api/auth/2fa/setup");
    expect(res.status).toBe(403);
    expect(users.get("u1").pendingTwoFactorSecret).toBeUndefined();
  });

  it("setup with active 2FA, correct password but wrong code → 403", async () => {
    const res = await call(SETUP, "/api/auth/2fa/setup", { password: "richtig", code: "000000" });
    expect(res.status).toBe(403);
  });

  it("setup with active 2FA, password + current code → new pending secret", async () => {
    const res = await call(SETUP, "/api/auth/2fa/setup", {
      password: "richtig",
      code: await generateTOTP(secret),
    });
    expect(res.status).toBe(200);
    expect(users.get("u1").pendingTwoFactorSecret).toBeTruthy();
  });

  it("first-time setup (2FA not active) still works without a body", async () => {
    users.set("u1", { ...users.get("u1"), twoFactorEnabled: false, twoFactorSecret: null });
    const res = await call(SETUP, "/api/auth/2fa/setup");
    expect(res.status).toBe(200);
  });

  it("disable without the current code → 403, 2FA stays on", async () => {
    const res = await call(DISABLE, "/api/auth/2fa/disable", { password: "richtig" });
    expect(res.status).toBe(403);
    expect(users.get("u1").twoFactorEnabled).toBe(true);
  });

  it("disable with password + current code → off", async () => {
    const res = await call(DISABLE, "/api/auth/2fa/disable", {
      password: "richtig",
      code: await generateTOTP(secret),
    });
    expect(res.status).toBe(200);
    expect(users.get("u1").twoFactorEnabled).toBe(false);
  });
});
