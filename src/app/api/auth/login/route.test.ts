// @vitest-environment node
//
// Login and the firm-wide 2FA requirement: the policy is looked up for the
// user (firm brain resolution lives in twoFactorPolicyFor — see
// src/lib/engine-two-factor.test.ts), a "required" policy bakes must2fa into
// the session, and an unreadable policy issues NO session (503, retryable).
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TestUser = {
  id: string;
  email: string;
  role: string;
  brainId: string;
  orgId?: string | null;
  passwordHash: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
};
let user: TestUser | null = null;

vi.mock("@/lib/api-handler", () => ({
  createPublicHandler:
    (
      opts: { body?: { safeParse: (d: unknown) => { success: boolean; data?: unknown } } },
      handler: (req: Request, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const parsed = opts.body!.safeParse(await req.json());
      if (!parsed.success) return Response.json({ error: "validation_failed" }, { status: 400 });
      return handler(req, parsed.data);
    },
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, ...(details ? { details } : {}) }, { status }),
}));
const verifyPassword = vi.fn(async (_pw: string, _hash: string) => true);
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: (pw: string, hash: string) => verifyPassword(pw, hash),
  hashPassword: vi.fn(async () => "dummy-hash"),
}));
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getByEmail: async () => user }),
  toPublic: (u: TestUser) => ({ id: u.id, email: u.email }),
}));
const createSession = vi.fn(async (..._args: unknown[]) => ({
  token: "session-token",
  cookieOptions: { httpOnly: true, secure: false, sameSite: "lax", maxAge: 60, path: "/" },
}));
vi.mock("@/lib/auth/session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  SESSION_COOKIE: "sb_session",
}));
vi.mock("@/lib/auth/rate-limit", () => ({ clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth/tokens", () => ({
  signActionToken: vi.fn(async () => "challenge"),
  bindFragment: vi.fn(async () => "bind"),
  CHALLENGE_TOKEN_TTL_SECONDS: 300,
}));
vi.mock("@/lib/auth/lockout", () => ({
  isAccountLocked: vi.fn(async () => ({ locked: false, retryAfterSeconds: 0 })),
  recordFailedLogin: vi.fn(),
  clearLockout: vi.fn(async () => undefined),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit-user", () => ({ logUserAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/account-status", () => ({
  ACCOUNT_BLOCKED_CODE: "account_deactivated",
  ACCOUNT_BLOCKED_MESSAGE: "blocked",
  isAccountBlocked: vi.fn(async () => false),
}));
const twoFactorPolicyFor = vi.fn(async (_u: unknown) => "not_required");
vi.mock("@/lib/kanzlei-settings-server", () => ({
  twoFactorPolicyFor: (u: unknown) => twoFactorPolicyFor(u),
}));

import { POST } from "./route";

const login = () =>
  POST(
    new Request("https://app.test/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "member@firm.at", password: "correct horse" }),
    }) as unknown as NextRequest
  );

beforeEach(() => {
  createSession.mockClear();
  twoFactorPolicyFor.mockReset().mockResolvedValue("not_required");
  user = {
    id: "member",
    email: "member@firm.at",
    role: "lawyer",
    brainId: "b_personal",
    orgId: "org-1",
    passwordHash: "hash",
  };
});

describe("POST /api/auth/login — firm-wide 2FA", () => {
  it("looks the policy up for the user (firm membership included), not a bare brainId", async () => {
    await login();
    expect(twoFactorPolicyFor).toHaveBeenCalledWith(
      expect.objectContaining({ id: "member", orgId: "org-1", brainId: "b_personal" })
    );
  });

  it("a required policy bakes must2fa into the session", async () => {
    twoFactorPolicyFor.mockResolvedValue("required");
    const res = await login();
    expect(res.status).toBe(200);
    expect((await res.json()).must2fa).toBe(true);
    expect(createSession).toHaveBeenCalledWith(
      "member",
      "member@firm.at",
      "lawyer",
      expect.objectContaining({ must2fa: true })
    );
    expect(res.headers.get("set-cookie")).toContain("sb_session=session-token");
  });

  it("no requirement → an ordinary session", async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect((await res.json()).must2fa).toBe(false);
    expect(createSession).toHaveBeenCalledWith(
      "member",
      "member@firm.at",
      "lawyer",
      expect.objectContaining({ must2fa: false })
    );
  });

  it("an unreadable policy issues no session: 503, retryable", async () => {
    twoFactorPolicyFor.mockResolvedValue("unknown");
    const res = await login();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("two_factor_policy_unavailable");
    expect(createSession).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();

    // Nothing sticks: once the settings are readable again, login works.
    twoFactorPolicyFor.mockResolvedValue("not_required");
    expect((await login()).status).toBe(200);
  });

  it("users with their own 2FA get the challenge; the policy is not consulted", async () => {
    user = { ...user!, twoFactorEnabled: true, twoFactorSecret: "SECRET" };
    twoFactorPolicyFor.mockResolvedValue("unknown");
    const res = await login();
    expect(res.status).toBe(200);
    expect((await res.json()).error).toBe("2fa_required");
    expect(twoFactorPolicyFor).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("login — keine Konto-Aufzählung (SEC-19)", () => {
  beforeEach(() => {
    verifyPassword.mockReset();
    verifyPassword.mockResolvedValue(false);
  });

  it("unknown address and SSO-only account answer identically, both after a password check", async () => {
    user = null;
    const unknown = await login();
    const unknownBody = await unknown.json();

    user = {
      id: "u-sso",
      email: "member@firm.at",
      role: "lawyer",
      brainId: "b1",
      passwordHash: "",
    };
    const sso = await login();
    const ssoBody = await sso.json();

    expect(unknown.status).toBe(401);
    expect(sso.status).toBe(401);
    expect(ssoBody).toEqual(unknownBody);
    expect(JSON.stringify(ssoBody)).not.toContain("sso");
    // Both paths burned a real hash comparison (timing parity).
    expect(verifyPassword).toHaveBeenCalledTimes(2);
    expect(verifyPassword.mock.calls.every(([, hash]) => hash === "dummy-hash")).toBe(true);
  });

  it("a wrong password for a real account answers the same way", async () => {
    const { recordFailedLogin } = await import("@/lib/auth/lockout");
    vi.mocked(recordFailedLogin).mockResolvedValue({ locked: false, retryAfterSeconds: 0 });
    user = {
      id: "u1",
      email: "member@firm.at",
      role: "lawyer",
      brainId: "b1",
      passwordHash: "real-hash",
    };
    const res = await login();
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("invalid_credentials");
  });
});
