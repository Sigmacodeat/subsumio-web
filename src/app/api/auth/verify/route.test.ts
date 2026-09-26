// @vitest-environment node
/**
 * Opening the confirmation link of a registration creates the account (with
 * the contract acceptance of the signup), marks the address verified and
 * signs the person in. A second link for the same address, or a tampered
 * one, creates nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LEGAL_VERSIONS } from "@/lib/auth/legal-acceptance";

const users = new Map<string, Record<string, unknown>>();
const audits: unknown[][] = [];

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
    getById: async (id: string) => users.get(id) ?? null,
    create: async (u: Record<string, unknown>) => {
      users.set(String(u.id), u);
      return u;
    },
    update: async () => null,
  }),
  buildNewUser: async (o: Record<string, unknown>) => ({
    id: `u-${users.size + 1}`,
    email: o.email,
    name: o.name,
    passwordHash: o.passwordHash,
    role: "admin",
    orgId: null,
    brainId: `brain-${users.size + 1}`,
    locale: o.locale,
    jurisdiction: o.jurisdiction,
  }),
}));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  createSession: async (uid: string) => ({ token: `session-${uid}`, cookieOptions: {} }),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: async () => ({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "10.0.0.1",
}));
vi.mock("@/lib/provision", () => ({ provisionBrainAsync: () => {} }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (...args: unknown[]) => {
    audits.push(args);
  },
}));

import { GET } from "./route";
import { createPendingSignupToken, type PendingSignup } from "@/lib/auth/pending-signup";

const ACCEPTED_AT = "2099-02-01T09:00:00.000Z";
const PENDING: PendingSignup = {
  email: "neu@kanzlei.at",
  name: "Dr. Neu",
  locale: "de",
  jurisdiction: "AT",
  passwordHash: "hash-neu",
  referredBy: null,
  demoSid: null,
  demoPersona: null,
  acceptedAt: ACCEPTED_AT,
  next: "/dashboard/billing?checkout=pro",
};

function open(token: string) {
  return GET(
    new NextRequest(`http://localhost/api/auth/verify?token=${encodeURIComponent(token)}`),
    { params: Promise.resolve({}) } as never
  );
}

describe("GET /api/auth/verify — registration confirmation", () => {
  beforeEach(() => {
    users.clear();
    audits.length = 0;
  });

  it("creates the account, records the acceptance of the signup and signs in", async () => {
    const res = await open(await createPendingSignupToken(PENDING));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/dashboard\/billing\?checkout=pro$/);
    expect(res.headers.get("set-cookie")).toMatch(/session-u-1/);

    const user = [...users.values()][0];
    expect(user).toMatchObject({ email: "neu@kanzlei.at", passwordHash: "hash-neu" });
    expect(typeof user.emailVerifiedAt).toBe("string");
    expect(user.legalAcceptance).toMatchObject({
      termsVersion: LEGAL_VERSIONS.terms,
      privacyVersion: LEGAL_VERSIONS.privacy,
      dpaVersion: LEGAL_VERSIONS.dpa,
      method: "signup",
      acceptedAt: ACCEPTED_AT,
    });
    expect(audits.some((a) => a[0] === "user.legal_accepted")).toBe(true);
  });

  it("a second link for an address that has an account creates nothing", async () => {
    const first = await createPendingSignupToken(PENDING);
    const second = await createPendingSignupToken({ ...PENDING, passwordHash: "other" });
    await open(first);
    const res = await open(second);
    expect(res.headers.get("location")).toMatch(/\/login\?verify=exists$/);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(users.size).toBe(1);
    expect([...users.values()][0].passwordHash).toBe("hash-neu");
  });

  it("a tampered link creates nothing", async () => {
    const token = await createPendingSignupToken(PENDING);
    const [body, sig] = [
      token.slice(0, token.lastIndexOf(".")),
      token.slice(token.lastIndexOf(".") + 1),
    ];
    const res = await open(`${body}x.${sig}`);
    expect(res.headers.get("location")).toMatch(/\/login\?verify=invalid$/);
    expect(users.size).toBe(0);
  });
});
