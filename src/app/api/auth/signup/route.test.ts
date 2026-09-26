// @vitest-environment node
/**
 * Signup never reveals whether an address has an account: a new address and
 * a taken one get the same answer ("please confirm your e-mail"), no session
 * in either case. A new address receives the confirmation link (the account
 * is created when it is opened — see ../verify/route.test.ts); an existing
 * account's owner receives a notice instead, and nothing is created. The
 * contract acceptance is still required up front.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const created: Record<string, unknown>[] = [];
const mails: Array<{ to: string; subject: string; text: string }> = [];
const EXISTING = { id: "u-old", email: "bestand@kanzlei.at", name: "Dr. Bestand", locale: "de" };

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getByEmail: async (email: string) => (email === EXISTING.email ? EXISTING : null),
    getByReferralCode: async () => null,
    create: async (u: Record<string, unknown>) => {
      created.push(u);
      return u;
    },
  }),
}));
const hashPassword = vi.fn(async () => "hash");
vi.mock("@/lib/auth/password", () => ({ hashPassword: () => hashPassword() }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  verifySession: async () => null,
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: async () => ({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "10.0.0.1",
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (m: { to: string; subject: string; text: string }) => {
    mails.push(m);
  },
  siteUrl: () => "http://app.test",
}));

import { POST } from "./route";
import { readPendingSignupToken } from "@/lib/auth/pending-signup";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`,
    },
    body: JSON.stringify(body),
  });
}

const BASE = { email: "neu@kanzlei.at", password: "SicheresPasswort1", name: "Dr. A" };
const ACCEPTED = { acceptTerms: true, acceptDpa: true };
const call = (body: Record<string, unknown>) =>
  POST(req(body), { params: Promise.resolve({}) } as never);

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    created.length = 0;
    mails.length = 0;
    hashPassword.mockClear();
    vi.unstubAllEnvs();
  });

  it("rejects signup without acceptance — nothing created, no mail", async () => {
    for (const body of [BASE, { ...BASE, acceptTerms: true }, { ...BASE, acceptDpa: true }]) {
      const res = await call(body);
      expect(res.status).toBe(400);
    }
    await flush();
    expect(created).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it("an existing address gets exactly the same answer as a new one", async () => {
    const fresh = await call({ ...BASE, ...ACCEPTED });
    const taken = await call({ ...BASE, email: EXISTING.email, ...ACCEPTED });
    expect(taken.status).toBe(fresh.status);
    expect(fresh.status).toBe(201);
    expect(await taken.json()).toEqual(await fresh.json());
    // No session in either case — nobody is signed in by a registration.
    expect(fresh.headers.get("set-cookie")).toBeNull();
    expect(taken.headers.get("set-cookie")).toBeNull();
    // Same work on both paths.
    expect(hashPassword).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(0);
  });

  it("a new address receives the confirmation link carrying the registration", async () => {
    await call({ ...BASE, ...ACCEPTED, next: "/dashboard/billing?checkout=pro" });
    await flush();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("neu@kanzlei.at");
    const link = /http:\/\/app\.test\/api\/auth\/verify\?token=(\S+)/.exec(mails[0].text);
    expect(link).not.toBeNull();
    const pending = await readPendingSignupToken(decodeURIComponent(link![1]));
    expect(pending).toMatchObject({
      email: "neu@kanzlei.at",
      name: "Dr. A",
      passwordHash: "hash",
      jurisdiction: "AT",
      next: "/dashboard/billing?checkout=pro",
    });
    expect(typeof pending?.acceptedAt).toBe("string");
  });

  it("the owner of an existing account gets a notice instead — nothing changes", async () => {
    await call({ ...BASE, email: EXISTING.email, ...ACCEPTED });
    await flush();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe(EXISTING.email);
    expect(mails[0].text).toMatch(/bereits ein Konto/);
    expect(mails[0].text).toMatch(/\/forgot/);
    expect(mails[0].text).not.toMatch(/token=/);
  });

  it("an unsafe next path is replaced by the dashboard", async () => {
    await call({ ...BASE, ...ACCEPTED, next: "https://phish.example" });
    await flush();
    const link = /token=(\S+)/.exec(mails[0].text);
    expect((await readPendingSignupToken(decodeURIComponent(link![1])))?.next).toBe("/dashboard");
  });

  it("the E2E harness (never set in production) receives the link for new addresses", async () => {
    vi.stubEnv("SUBSUMIO_E2E", "1");
    const body = await (await call({ ...BASE, ...ACCEPTED })).json();
    expect(body.e2eVerifyUrl).toMatch(/\/api\/auth\/verify\?token=/);
  });
});
