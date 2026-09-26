// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  // Lockout falls back to a JSON file without Postgres — keep it out of the repo.
  process.env.SUBSUMIO_DATA_DIR = `${process.env.TMPDIR ?? "/tmp"}/subsumio-2fa-test-${process.pid}`;
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
  toPublic: (u: any) => ({ id: u.id, email: u.email }),
}));
vi.mock("@/lib/auth/tokens", () => ({
  verifyActionToken: vi.fn(async (token: string) =>
    token.startsWith("challenge-") ? { uid: "u1", purpose: "2fa_challenge", bind: "b" } : null
  ),
  bindFragment: vi.fn(async () => "b"),
}));
vi.mock("@/lib/auth/account-status", () => ({
  ACCOUNT_BLOCKED_CODE: "account_deactivated",
  ACCOUNT_BLOCKED_MESSAGE: "blocked",
  isAccountBlocked: vi.fn(async () => false),
}));
vi.mock("@/lib/auth/session", () => ({
  createSession: vi.fn(async () => ({
    token: "tok",
    cookieOptions: { httpOnly: true, secure: false, sameSite: "lax", maxAge: 60, path: "/" },
  })),
  SESSION_COOKIE: "sb_session",
}));
vi.mock("@/lib/audit-user", () => ({ logUserAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn(async () => ({ ok: true, retryAfterSeconds: 0 })),
  clientIp: () => "127.0.0.1",
}));
// Single-use claims (Postgres table in production) — in memory here.
const claimed = new Set<string>();
vi.mock("@/lib/caselaw-dedup", () => ({
  filterNewIds: vi.fn(async (scope: string, ns: string, ids: string[]) => {
    const fresh = new Set<number>();
    ids.forEach((id, i) => {
      const key = `${scope}:${ns}:${id}`;
      if (!claimed.has(key)) {
        claimed.add(key);
        fresh.add(i);
      }
    });
    return fresh;
  }),
}));

import { POST } from "./route";
import { generateSecret, generateTOTP } from "@/lib/totp";
import { clearSecondFactorLockout } from "@/lib/auth/lockout";

let secret: string;

function verify(token: string, challengeToken = `challenge-${Math.random()}`) {
  return POST(
    new NextRequest("http://localhost:3000/api/auth/2fa/login-verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeToken, token }),
    })
  );
}

describe("POST /api/auth/2fa/login-verify (SEC-3)", () => {
  beforeEach(async () => {
    claimed.clear();
    secret = generateSecret();
    users.set("u1", {
      id: "u1",
      email: "anwalt@kanzlei.example",
      role: "lawyer",
      brainId: "b1",
      passwordHash: "h",
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorBackupCodes: [],
      twoFactorLastStep: null,
    });
    await clearSecondFactorLockout("u1");
  });

  it("accepts a valid code once — the same code a second time is refused", async () => {
    const code = await generateTOTP(secret);
    expect((await verify(code)).status).toBe(200);
    expect((await verify(code)).status).toBe(400);
  });

  it("the challenge token is single-use", async () => {
    const first = await verify(await generateTOTP(secret), "challenge-fixed");
    expect(first.status).toBe(200);
    // Next time step's code, same challenge → refused.
    const later = await generateTOTP(secret, { time: Date.now() / 1000 + 30 });
    expect((await verify(later, "challenge-fixed")).status).toBe(401);
  });

  it("repeated wrong codes lock the second factor — also with a fresh challenge", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await verify("000000")).status);
    expect(statuses.slice(0, 4).every((s) => s === 400)).toBe(true);
    expect(statuses[4]).toBe(429);
    // Even a correct code with a brand-new challenge is refused while locked.
    expect((await verify(await generateTOTP(secret), "challenge-new")).status).toBe(429);
  });
});
