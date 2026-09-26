// @vitest-environment node
//
// The password lockout neither reveals which addresses have an account nor
// lets someone lock a lawyer out from another network (real lockout module).
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: async (pw: string, hash: string) => hash === "real-hash" && pw === "richtig123!",
  hashPassword: async () => "dummy-hash",
}));
const known = {
  id: "u1",
  email: "anwalt@kanzlei.example",
  role: "lawyer",
  brainId: "b1",
  passwordHash: "real-hash",
};
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getByEmail: async (email: string) => (email === known.email ? known : null),
  }),
  getSharedPgPool: () => null,
  toPublic: (u: { id: string; email: string }) => ({ id: u.id, email: u.email }),
}));
vi.mock("@/lib/auth/session", () => ({
  createSession: async () => ({ token: "t", cookieOptions: { path: "/" } }),
  SESSION_COOKIE: "sb_session",
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  clientIp: (h: Headers) => h.get("x-forwarded-for") ?? "0.0.0.0",
}));
vi.mock("@/lib/audit-user", () => ({ logUserAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/account-status", () => ({
  ACCOUNT_BLOCKED_CODE: "account_deactivated",
  ACCOUNT_BLOCKED_MESSAGE: "blocked",
  isAccountBlocked: async () => false,
}));
vi.mock("@/lib/kanzlei-settings-server", () => ({ twoFactorPolicyFor: async () => "not_required" }));
vi.mock("@/lib/env", () => ({
  env: (k: string) => (k === "SUBSUMIO_DATA_DIR" ? `/tmp/subsumio-lockout-test-${process.pid}` : undefined),
}));

import { POST } from "./route";

let run = 0;
function attempt(email: string, password: string, ip: string) {
  return POST(
    new Request("https://app.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password }),
    }) as never
  );
}

beforeEach(() => {
  run++;
});

describe("login lockout", () => {
  it("answers identically for unknown and existing addresses, also after the threshold", async () => {
    const ip = `10.0.${run}.1`;
    const unknown: Array<[number, unknown]> = [];
    const existing: Array<[number, unknown]> = [];
    for (let i = 0; i < 6; i++) {
      const a = await attempt(`niemand-${run}@kanzlei.example`, "falsch-000", ip);
      unknown.push([a.status, (await a.json()).code]);
      const b = await attempt(known.email, "falsch-000", ip);
      existing.push([b.status, (await b.json()).code]);
    }
    expect(existing).toEqual(unknown);
    expect(existing.at(-1)).toEqual([429, "account_locked"]);
  });

  it("failed attempts from one network do not lock the account for another", async () => {
    for (let i = 0; i < 6; i++) await attempt(known.email, "falsch-000", `10.1.${run}.1`);
    const blocked = await attempt(known.email, "richtig123!", `10.1.${run}.1`);
    expect(blocked.status).toBe(429);
    const ok = await attempt(known.email, "richtig123!", `10.2.${run}.1`);
    expect(ok.status).toBe(200);
  });
});
