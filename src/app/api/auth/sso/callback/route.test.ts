// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = {
  get: vi.fn(() => ({ value: "state-1" })),
  delete: vi.fn(),
  set: vi.fn(),
};
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("@/lib/env", () => ({
  env: (k: string) => (k === "NEXT_PUBLIC_APP_URL" ? "https://app.test" : ""),
}));
vi.mock("@/lib/workos", () => ({ authenticateWithCode: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({ clientIp: () => "203.0.113.1" }));
vi.mock("@/lib/auth/account-status", () => ({
  ACCOUNT_BLOCKED_CODE: "account_deactivated",
  isAccountBlocked: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "sb_session",
  createSession: vi.fn(async () => ({ token: "sess", cookieOptions: {} })),
}));
vi.mock("@/lib/auth/tokens", () => ({
  CHALLENGE_TOKEN_TTL_SECONDS: 300,
  bindFragment: vi.fn(async (v: string) => `bind(${v})`),
  signActionToken: vi.fn(async () => "challenge-tok"),
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({ twoFactorPolicyFor: vi.fn() }));
const users = { getByEmail: vi.fn(), create: vi.fn(), update: vi.fn() };
const orgs = { getById: vi.fn() };
vi.mock("@/lib/auth/store", () => ({
  getStore: () => users,
  getOrgStore: () => orgs,
  buildNewUser: vi.fn(async (u: Record<string, unknown>) => ({ id: "new", role: "user", ...u })),
}));
vi.mock("@/lib/api-handler", () => ({
  createPublicHandler:
    (_opts: unknown, handler: (req: Request, body: unknown, q: unknown) => Promise<Response>) =>
    (req: Request) =>
      handler(req, null, Object.fromEntries(new URL(req.url).searchParams)),
  apiError: (code: string, _m: string, status: number) =>
    Response.json({ error: code }, { status }),
}));

import { GET } from "./route";
import { authenticateWithCode } from "@/lib/workos";
import { createSession } from "@/lib/auth/session";
import { twoFactorPolicyFor } from "@/lib/kanzlei-settings-server";

function workos(opts: { org?: string; verified?: boolean; id?: string } = {}) {
  vi.mocked(authenticateWithCode).mockResolvedValue({
    user: {
      id: opts.id ?? "wu_1",
      email: "lawyer@firm.example",
      first_name: "A",
      last_name: "B",
      email_verified: opts.verified ?? true,
    },
    organization_id: opts.org,
  });
}

const call = () =>
  (GET as unknown as (r: Request) => Promise<Response>)(
    new Request("https://app.test/api/auth/sso/callback?code=c&state=state-1")
  );

const existing = {
  id: "u1",
  email: "lawyer@firm.example",
  role: "user",
  orgId: "org-1",
  passwordHash: "pw-hash",
  workosUserId: null as string | null,
  twoFactorEnabled: false,
  twoFactorSecret: null as string | null,
};

describe("GET /api/auth/sso/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jar.get.mockReturnValue({ value: "state-1" });
    vi.mocked(twoFactorPolicyFor).mockResolvedValue("not_required");
    users.update.mockImplementation(async (_id: string, patch: object) => ({
      ...existing,
      ...patch,
    }));
  });

  it("does not sign into an existing account by e-mail match when the firm has no SSO tenant", async () => {
    workos();
    users.getByEmail.mockResolvedValue({ ...existing });
    orgs.getById.mockResolvedValue({ id: "org-1", workosOrganizationId: null });
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("error=sso_not_linked");
    expect(createSession).not.toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
  });

  it("refuses an identity from a foreign WorkOS organization", async () => {
    workos({ org: "org_other" });
    users.getByEmail.mockResolvedValue({ ...existing });
    orgs.getById.mockResolvedValue({ id: "org-1", workosOrganizationId: "org_firm" });
    const res = await call();
    expect(res.headers.get("location")).toContain("error=sso_not_linked");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("binds and signs in via the firm's own organization, applying the firm 2FA policy", async () => {
    workos({ org: "org_firm" });
    users.getByEmail.mockResolvedValue({ ...existing });
    orgs.getById.mockResolvedValue({ id: "org-1", workosOrganizationId: "org_firm" });
    vi.mocked(twoFactorPolicyFor).mockResolvedValue("required");
    const res = await call();
    expect(res.headers.get("location")).toBe("https://app.test/dashboard");
    expect(users.update).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ workosUserId: "wu_1" })
    );
    expect(createSession).toHaveBeenCalledWith(
      "u1",
      existing.email,
      "user",
      expect.objectContaining({ must2fa: true })
    );
  });

  it("fails closed when the firm 2FA policy cannot be read", async () => {
    workos();
    users.getByEmail.mockResolvedValue({ ...existing, workosUserId: "wu_1" });
    orgs.getById.mockResolvedValue({ id: "org-1" });
    vi.mocked(twoFactorPolicyFor).mockResolvedValue("unknown");
    const res = await call();
    expect(res.headers.get("location")).toContain("error=two_factor_policy_unavailable");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("requires the TOTP challenge for a user with 2FA enabled", async () => {
    workos();
    users.getByEmail.mockResolvedValue({
      ...existing,
      workosUserId: "wu_1",
      twoFactorEnabled: true,
      twoFactorSecret: "secret",
    });
    orgs.getById.mockResolvedValue({ id: "org-1" });
    const res = await call();
    const loc = res.headers.get("location") ?? "";
    expect(loc).toBe("https://app.test/at/login#sso2fa=challenge-tok");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("still provisions a brand-new account", async () => {
    workos();
    users.getByEmail.mockResolvedValue(null);
    users.create.mockImplementation(async (u: object) => u);
    const res = await call();
    expect(res.headers.get("location")).toBe("https://app.test/dashboard");
    expect(createSession).toHaveBeenCalledWith(
      "new",
      "lawyer@firm.example",
      "user",
      expect.objectContaining({ must2fa: false })
    );
  });
});
