// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
// SEC-4 / SEC-19: no reset link for SSO-only accounts; per-address cap on
// reset mails independent of the requesting IP.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let user: any = null;
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ getByEmail: async () => user }),
}));
const sendMail = vi.fn(async (_m: unknown) => ({ sent: true }));
vi.mock("@/lib/mail", () => ({
  sendMail: (m: unknown) => sendMail(m),
  siteUrl: () => "https://app.test",
}));
vi.mock("@/lib/auth/tokens", () => ({
  signActionToken: vi.fn(async () => "reset-token"),
  bindFragment: vi.fn(async () => "bind"),
  RESET_TOKEN_TTL_SECONDS: 3600,
}));
// Real limiter semantics, in memory.
const counters = new Map<string, number>();
vi.mock("@/lib/auth/rate-limit", () => ({
  clientIp: (h: Headers) => h.get("x-real-ip") ?? "127.0.0.1",
  hit: vi.fn(async (key: string, max: number) => {
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return { ok: n <= max, retryAfterSeconds: n <= max ? 0 : 60 };
  }),
}));

import { POST } from "./route";

function forgot(email: string, ip: string) {
  return POST(
    new NextRequest("http://localhost:3000/api/auth/forgot", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ email }),
    })
  );
}

describe("POST /api/auth/forgot", () => {
  beforeEach(() => {
    counters.clear();
    sendMail.mockClear();
    user = {
      id: "u1",
      email: "anwalt@kanzlei.example",
      name: "A",
      locale: "de",
      passwordHash: "hash",
    };
  });

  it("sends a reset mail for a password account", async () => {
    const res = await forgot("anwalt@kanzlei.example", "10.0.0.1");
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("SSO-only account (no local password): no token, no mail — same 200", async () => {
    user = { ...user, passwordHash: "", ssoProvider: "workos" };
    const res = await forgot("anwalt@kanzlei.example", "10.0.0.1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("same address from 5 different IPs → at most 3 mails per hour", async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await forgot("anwalt@kanzlei.example", `10.0.0.${i}`);
      expect(res.status).toBe(200);
    }
    expect(sendMail).toHaveBeenCalledTimes(3);
  });
});
