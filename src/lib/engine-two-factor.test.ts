// @vitest-environment node
//
// Firm-wide 2FA: the requirement is read from the FIRM's brain, a read error
// is never "not required", and a must2fa session reaches only the setup flow
// on every API route built on requireEngineContext().
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => new Map([["sb_session", { value: "tok" }]])),
}));
let session: { uid: string; must2fa?: boolean } = { uid: "member" };
vi.mock("@/lib/auth/session", () => ({
  verifySession: vi.fn(async () => session),
  SESSION_COOKIE: "sb_session",
}));
vi.mock("@/lib/env", () => ({ env: () => undefined }));
vi.mock("@/lib/auth/platform-operator", () => ({ isPlatformOperator: () => false }));
vi.mock("@/lib/support-session", () => ({ getActiveSupportSession: async () => null }));
const requireApiRate = vi.fn(async (): Promise<Response | null> => null);
vi.mock("@/lib/rate-limit-api", () => ({
  requireApiRate: (...args: unknown[]) => requireApiRate(...(args as [])),
}));
const checkCredits = vi.fn(async () => ({ ok: true, balance: 10, required: 1 }));
vi.mock("@/lib/billing/credits", () => ({
  checkCredits: (...args: unknown[]) => checkCredits(...(args as [])),
  ensureTrialCredits: vi.fn(async () => undefined),
  deductCredits: vi.fn(),
  checkAndSendBudgetAlert: vi.fn(),
  getBalance: vi.fn(),
  insufficientCreditsResponse: () =>
    Response.json({ error: "insufficient_credits" }, { status: 402 }),
  CREDIT_COSTS: { think: 1, frist_engine: 0 },
}));
const checkQuota = vi.fn(
  async (): Promise<{ ok: boolean; used: number; limit: number; reserved?: boolean }> => ({
    ok: true,
    used: 0,
    limit: 10,
  })
);
const incQuota = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/plans", () => ({
  checkQuota: (...args: unknown[]) => checkQuota(...(args as [])),
  incQuota: (...args: unknown[]) => incQuota(...args),
  quotaExceeded: () => Response.json({ error: "quota_exceeded" }, { status: 402 }),
}));

type U = {
  id: string;
  role: string;
  plan: string;
  brainId: string;
  orgId?: string | null;
  deactivatedAt?: null;
};
const users: Record<string, U> = {};
const orgs: Record<string, Record<string, unknown>> = {};
let orgStoreFails = false;
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getById: async (id: string) => users[id] ?? null,
    update: vi.fn(async () => null),
  }),
  getOrgStore: () => ({
    getById: async (id: string) => {
      if (orgStoreFails) throw new Error("db down");
      return orgs[id] ?? null;
    },
  }),
}));

import { applyUsageGuards, firmBrainIdFor, recordQuota, requireEngineContext } from "./engine";
import { readTwoFactorPolicy, twoFactorPolicyFor } from "./kanzlei-settings-server";

const fetchMock = vi.fn();

beforeEach(() => {
  session = { uid: "member" };
  orgStoreFails = false;
  requireApiRate.mockReset().mockResolvedValue(null);
  checkCredits.mockReset().mockResolvedValue({ ok: true, balance: 10, required: 1 });
  checkQuota.mockReset().mockResolvedValue({ ok: true, used: 0, limit: 10 });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(users, {
    solo: { id: "solo", role: "admin", plan: "pro", brainId: "b_solo" },
    founder: { id: "founder", role: "admin", plan: "team", brainId: "b_firm", orgId: "org-1" },
    // Invited member: user.brainId is the unused personal workspace from signup.
    member: { id: "member", role: "lawyer", plan: "free", brainId: "b_personal", orgId: "org-1" },
    suspended: { id: "suspended", role: "lawyer", plan: "free", brainId: "b_s", orgId: "org-9" },
  });
  Object.assign(orgs, {
    "org-1": { id: "org-1", brainId: "b_firm", ownerId: "founder" },
    "org-9": { id: "org-9", brainId: "b_s9", ownerId: "x", suspendedAt: "2026-09-01" },
  });
});

function sourceOfLastFetch(): string | undefined {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.["x-subsumio-source"];
}

describe("firmBrainIdFor", () => {
  test("a team member resolves to the firm's brain, not their personal one", async () => {
    expect(await firmBrainIdFor(users.member)).toBe("b_firm");
  });
  test("a lawyer working alone keeps their own brain", async () => {
    expect(await firmBrainIdFor(users.solo)).toBe("b_solo");
  });
  test("a dangling orgId falls back to the personal brain", async () => {
    expect(await firmBrainIdFor({ brainId: "b_x", orgId: "gone" })).toBe("b_x");
  });
  test("a suspended firm resolves to nothing", async () => {
    expect(await firmBrainIdFor(users.suspended)).toBeNull();
  });
});

describe("2FA policy read (fail-closed)", () => {
  test("require2FA on the firm's settings page → required, read from the firm brain", async () => {
    fetchMock.mockResolvedValue(Response.json({ frontmatter: { require2FA: true } }));
    expect(await twoFactorPolicyFor(users.member)).toBe("required");
    expect(sourceOfLastFetch()).toBe("b_firm");
  });

  test("settings page without the flag → not required", async () => {
    fetchMock.mockResolvedValue(Response.json({ frontmatter: { require2FA: false } }));
    expect(await readTwoFactorPolicy("b_firm")).toBe("not_required");
  });

  test("no settings page at all (404) → not required", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "not_found" }, { status: 404 }));
    expect(await readTwoFactorPolicy("b_firm")).toBe("not_required");
  });

  test.each([500, 502, 401, 403])(
    "engine answers %i → unknown, never 'not required'",
    async (s) => {
      fetchMock.mockResolvedValue(Response.json({ error: "x" }, { status: s }));
      expect(await readTwoFactorPolicy("b_firm")).toBe("unknown");
    }
  );

  test("engine unreachable → unknown", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await readTwoFactorPolicy("b_firm")).toBe("unknown");
  });

  test("unreadable body → unknown", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await readTwoFactorPolicy("b_firm")).toBe("unknown");
  });

  test("store error while resolving the firm → unknown", async () => {
    orgStoreFails = true;
    expect(await twoFactorPolicyFor(users.member)).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("nothing is cached: the next call re-evaluates after an outage", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await twoFactorPolicyFor(users.member)).toBe("unknown");
    fetchMock.mockResolvedValueOnce(Response.json({ frontmatter: {} }));
    expect(await twoFactorPolicyFor(users.member)).toBe("not_required");
  });
});

describe("requireEngineContext — must2fa sessions", () => {
  const req = (path: string, method = "GET") => new Request(`https://app.test${path}`, { method });

  test("a must2fa session is refused on ordinary routes with two_factor_setup_required", async () => {
    session = { uid: "member", must2fa: true };
    const res = await requireEngineContext(req("/api/pages"), "brain.read", "standard");
    expect(res).toBeInstanceOf(Response);
    const r = res as Response;
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe("two_factor_setup_required");
    // Refused before any rate/credit/quota bookkeeping.
    expect(requireApiRate).not.toHaveBeenCalled();
  });

  test.each([
    ["/api/auth/me", "GET", "settings.read"],
    ["/api/auth/2fa/setup", "POST", "auth.2fa"],
    ["/api/auth/2fa/verify", "POST", "auth.2fa"],
    ["/api/2fa/qrcode", "POST", "auth.2fa"],
    ["/api/auth/logout", "POST", "auth.logout"],
  ] as const)("a must2fa session may still reach %s %s", async (path, method, action) => {
    session = { uid: "member", must2fa: true };
    const res = await requireEngineContext(req(path, method), action, "standard");
    expect(res).not.toBeInstanceOf(Response);
  });

  test("a normal session is unaffected", async () => {
    const res = await requireEngineContext(req("/api/pages"), "brain.read", "standard");
    expect(res).not.toBeInstanceOf(Response);
    expect(requireApiRate).toHaveBeenCalledWith("member", "standard");
  });
});

describe("applyUsageGuards", () => {
  const ctx = {
    headers: {},
    brainId: "b_firm",
    plan: "team" as const,
    user: { id: "member" },
    billing: { ownerId: "founder", ownerType: "user" as const },
  } as unknown as Parameters<typeof applyUsageGuards>[0];

  test("passes when rate, credits and quota allow", async () => {
    expect(await applyUsageGuards(ctx, "heavy", "queries", "think")).toBeNull();
    expect(requireApiRate).toHaveBeenCalledWith("member", "heavy");
    expect(checkCredits).toHaveBeenCalledWith("founder", "user", 1);
    expect(checkQuota).toHaveBeenCalledWith("b_firm", "team", "queries");
  });

  test("returns the 429 of the rate limiter", async () => {
    requireApiRate.mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429 }));
    expect((await applyUsageGuards(ctx, "standard"))?.status).toBe(429);
  });

  test("refuses without credits", async () => {
    checkCredits.mockResolvedValueOnce({ ok: false, balance: 0, required: 1 });
    expect((await applyUsageGuards(ctx, "standard", undefined, "think"))?.status).toBe(402);
  });

  test("refuses over quota", async () => {
    checkQuota.mockResolvedValueOnce({ ok: false, used: 10, limit: 10 });
    expect((await applyUsageGuards(ctx, "standard", "queries"))?.status).toBe(402);
  });
});

describe("quota booked once per request (R11-10)", () => {
  const freshCtx = () =>
    ({
      headers: {},
      brainId: "b_firm",
      plan: "team" as const,
      user: { id: "member" },
      billing: { ownerId: "founder", ownerType: "user" as const },
    }) as unknown as Parameters<typeof applyUsageGuards>[0];

  test("the unit reserved by the guard is consumed by recordQuota, not booked again", async () => {
    incQuota.mockClear();
    checkQuota.mockResolvedValueOnce({ ok: true, used: 1, limit: 10, reserved: true });
    const ctx = freshCtx();
    expect(await applyUsageGuards(ctx, "search", "queries")).toBeNull();
    await recordQuota(ctx, "queries");
    expect(incQuota).not.toHaveBeenCalled();
  });

  test("amounts beyond the reserved unit are booked; other fields are booked in full", async () => {
    incQuota.mockClear();
    checkQuota.mockResolvedValueOnce({ ok: true, used: 1, limit: 10, reserved: true });
    const ctx = freshCtx();
    await applyUsageGuards(ctx, "standard", "uploads");
    await recordQuota(ctx, "uploads", 3);
    await recordQuota(ctx, "pages", 2);
    expect(incQuota.mock.calls).toEqual([
      ["b_firm", "uploads", 2],
      ["b_firm", "pages", 2],
    ]);
  });

  test("without a reservation (no atomic store) recordQuota books the full amount", async () => {
    incQuota.mockClear();
    const ctx = freshCtx();
    await applyUsageGuards(ctx, "search", "queries");
    await recordQuota(ctx, "queries");
    expect(incQuota).toHaveBeenCalledWith("b_firm", "queries", 1);
  });
});
