/* eslint-disable @typescript-eslint/no-explicit-any */
// An SSO account (no local password) can switch 2FA off with its current code;
// an account with a password still needs it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ revokeAllSessions: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: async (pw: string, hash: string) => hash === "h" && pw === "richtig",
}));
vi.mock("@/lib/auth/second-factor", () => ({
  verifySecondFactor: async (_u: unknown, code: string) =>
    code === "123456" ? { ok: true } : { ok: false, reason: "invalid" },
}));
let user: any;
const update = vi.fn(async () => user);
vi.mock("@/lib/auth/store", () => ({ getStore: () => ({ getById: async () => user, update }) }));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

function disable(body: unknown) {
  vi.mocked(requireEngineContext).mockResolvedValue({
    headers: {},
    brainId: "b",
    plan: "team",
    user,
  } as any);
  return POST(
    new NextRequest("http://localhost:3000/api/auth/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => update.mockClear());

describe("POST /api/auth/2fa/disable", () => {
  it("an SSO account switches 2FA off with its current code", async () => {
    user = {
      id: "u",
      email: "u@k.example",
      role: "lawyer",
      passwordHash: "",
      twoFactorEnabled: true,
    };
    const res = await disable({ code: "123456" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it("an SSO account still needs a valid code", async () => {
    user = {
      id: "u",
      email: "u@k.example",
      role: "lawyer",
      passwordHash: "",
      twoFactorEnabled: true,
    };
    expect((await disable({ code: "000000" })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("an account with a password still needs the password", async () => {
    user = {
      id: "u",
      email: "u@k.example",
      role: "lawyer",
      passwordHash: "h",
      twoFactorEnabled: true,
    };
    expect((await disable({ code: "123456" })).status).toBe(403);
    expect((await disable({ code: "123456", password: "richtig" })).status).toBe(200);
  });
});
