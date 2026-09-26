// @vitest-environment node
/**
 * Signup concludes the contract: without an active confirmation of AGB +
 * Datenschutzerklärung and the AVV no account is created; with it the
 * versions and the server time are stored on the account and audit-logged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LEGAL_VERSIONS } from "@/lib/auth/legal-acceptance";

const created: Record<string, unknown>[] = [];
const audits: unknown[][] = [];

vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({
    getByEmail: async () => null,
    getByReferralCode: async () => null,
    create: async (u: Record<string, unknown>) => {
      created.push(u);
      return u;
    },
  }),
  buildNewUser: async (o: Record<string, unknown>) => ({
    id: "u1",
    email: o.email,
    name: o.name,
    role: "admin",
    orgId: null,
    brainId: "brain_x",
    locale: "de",
  }),
  toPublic: (u: unknown) => u,
}));
vi.mock("@/lib/auth/password", () => ({ hashPassword: async () => "hash" }));
vi.mock("@/lib/auth/session", () => ({
  SESSION_COOKIE: "sb_session",
  REF_COOKIE: "sb_ref",
  verifySession: async () => null,
  createSession: async () => ({ token: "t", cookieOptions: {} }),
}));
vi.mock("@/lib/auth/tokens", () => ({
  signActionToken: async () => "tok",
  bindFragment: async () => "b",
  VERIFY_TOKEN_TTL_SECONDS: 60,
}));
vi.mock("@/lib/mail", () => ({ sendMail: async () => {}, siteUrl: () => "http://x" }));
vi.mock("@/lib/provision", () => ({ provisionBrainAsync: () => {} }));
vi.mock("@/lib/audit", () => ({
  logAudit: async (...args: unknown[]) => {
    audits.push(args);
  },
}));

import { POST } from "./route";

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

const BASE = { email: "a@kanzlei.at", password: "SicheresPasswort1", name: "Dr. A" };

describe("POST /api/auth/signup — contract acceptance", () => {
  beforeEach(() => {
    created.length = 0;
    audits.length = 0;
  });

  it("rejects signup without acceptance — no account created", async () => {
    for (const body of [BASE, { ...BASE, acceptTerms: true }, { ...BASE, acceptDpa: true }]) {
      const res = await POST(req(body), { params: Promise.resolve({}) } as never);
      expect(res.status).toBe(400);
    }
    expect(created).toHaveLength(0);
  });

  it("stores versions, time and firm binding on the new account", async () => {
    const res = await POST(req({ ...BASE, acceptTerms: true, acceptDpa: true }), {
      params: Promise.resolve({}),
    } as never);
    expect(res.status).toBe(201);
    expect(created).toHaveLength(1);
    const rec = created[0].legalAcceptance as Record<string, unknown>;
    expect(rec).toMatchObject({
      termsVersion: LEGAL_VERSIONS.terms,
      privacyVersion: LEGAL_VERSIONS.privacy,
      dpaVersion: LEGAL_VERSIONS.dpa,
      method: "signup",
      onBehalfOfFirm: true,
      brainId: "brain_x",
    });
    expect(typeof rec.acceptedAt).toBe("string");
    expect(created[0].legalAcceptanceHistory).toEqual([rec]);
    expect(audits.some((a) => a[0] === "user.legal_accepted")).toBe(true);
  });
});
