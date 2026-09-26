/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const update = vi.fn();
vi.mock("@/lib/auth/store", () => ({
  getStore: () => ({ update, countReferrals: vi.fn(async () => 0) }),
  toPublic: (u: unknown) => u,
}));
const logAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
  clientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  recordQuota: vi.fn(),
}));

import { POST } from "./route";
import { GET as ME } from "../me/route";
import { requireEngineContext } from "@/lib/engine";
import { LEGAL_VERSIONS } from "@/lib/auth/legal-acceptance";

function ctxFor(role: string, extra: Record<string, unknown> = {}) {
  return {
    headers: { "x-subsumio-source": "brain_a" },
    brainId: "brain_a",
    plan: "team",
    user: {
      id: "u1",
      email: "u1@kanzlei.example",
      role,
      name: "A",
      orgId: "org1",
      brainId: "brain_a",
      referralCode: "R",
    },
    ...extra,
  };
}

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/auth/legal-acceptance", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "t", cookie: "sb_csrf=t" },
      body: JSON.stringify(body),
    })
  );
}

const VERSIONS = { ...LEGAL_VERSIONS };

describe("POST /api/auth/legal-acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockImplementation(async (id: string, p: object) => ({ id, ...p }));
  });

  it("admin must accept the AVV on the firm's behalf", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor("admin") as any);
    expect((await post({ acceptTerms: true, versions: VERSIONS })).status).toBe(400);
    expect(update).not.toHaveBeenCalled();

    const res = await post({ acceptTerms: true, acceptDpa: true, versions: VERSIONS });
    expect(res.status).toBe(200);
    const [id, patch] = update.mock.calls[0];
    expect(id).toBe("u1");
    expect(patch.legalAcceptance).toMatchObject({
      termsVersion: LEGAL_VERSIONS.terms,
      privacyVersion: LEGAL_VERSIONS.privacy,
      dpaVersion: LEGAL_VERSIONS.dpa,
      method: "prompt",
      onBehalfOfFirm: true,
      orgId: "org1",
    });
    expect(patch.legalAcceptanceHistory).toHaveLength(1);
    expect(logAudit).toHaveBeenCalledWith(
      "user.legal_accepted",
      "user",
      expect.objectContaining({ brainId: "brain_a", userId: "u1" })
    );
  });

  it("team member confirms AGB/Datenschutz without binding the firm", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor("lawyer") as any);
    const res = await post({ acceptTerms: true, versions: VERSIONS });
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][1].legalAcceptance).toMatchObject({
      dpaVersion: null,
      onBehalfOfFirm: false,
    });
  });

  it("rejects without acceptTerms and on a stale version", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor("admin") as any);
    expect((await post({ acceptDpa: true, versions: VERSIONS })).status).toBe(400);
    const stale = await post({
      acceptTerms: true,
      acceptDpa: true,
      versions: { ...VERSIONS, terms: "2000-01-01" },
    });
    expect(stale.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("a support session cannot accept on the firm's behalf", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(
      ctxFor("admin", { supportSession: { orgName: "K" } }) as any
    );
    const res = await post({ acceptTerms: true, acceptDpa: true, versions: VERSIONS });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/me — legal state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an account without a record must confirm", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctxFor("admin") as any);
    const res = await ME(new NextRequest("http://localhost:3000/api/auth/me"));
    const body = await res.json();
    expect(body.legal).toMatchObject({ required: true, bindsFirm: true, versions: VERSIONS });
  });

  it("current record → no dialog; support session → never", async () => {
    const current = {
      termsVersion: LEGAL_VERSIONS.terms,
      privacyVersion: LEGAL_VERSIONS.privacy,
      dpaVersion: LEGAL_VERSIONS.dpa,
    };
    const ctx = ctxFor("admin");
    (ctx.user as Record<string, unknown>).legalAcceptance = current;
    vi.mocked(requireEngineContext).mockResolvedValue(ctx as any);
    let body = await (await ME(new NextRequest("http://localhost:3000/api/auth/me"))).json();
    expect(body.legal.required).toBe(false);

    vi.mocked(requireEngineContext).mockResolvedValue(
      ctxFor("admin", {
        supportSession: { orgName: "K", reason: "r", startedAt: "", expiresAt: "" },
      }) as any
    );
    body = await (await ME(new NextRequest("http://localhost:3000/api/auth/me"))).json();
    expect(body.legal.required).toBe(false);
  });
});
