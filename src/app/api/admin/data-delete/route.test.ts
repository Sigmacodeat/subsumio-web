/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
// POST /api/admin/data-delete — the legal-hold gate must actually block a
// deletion, not just report that it "checked". Regression tests for the
// 2026-09-24 audit: the gate existed in code but shipped with zero tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/auth/rate-limit", () => ({
  hit: vi.fn().mockResolvedValue({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/engine", async () => ({
  ENGINE_URL: "http://engine.test",
  engineConfigurationResponse: () => null,
  requireEngineContext: vi.fn(),
  engineHeadersForBrain: (brainId: string) => ({ "x-subsumio-source": brainId }),
}));
vi.mock("@/lib/auth/api-key-auth", () => ({ verifyApiKey: vi.fn().mockResolvedValue(null) }));

const pool = vi.hoisted(() => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
const users = vi.hoisted(
  () =>
    ({
      u_target: { id: "u_target", brainId: "brain_personal", orgId: "org_a" },
    }) as Record<string, { id: string; brainId: string; orgId: string | null }>
);
vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => pool,
  getStore: () => ({ getById: async (id: string) => users[id] ?? null }),
  getOrgStore: () => ({
    getById: async (id: string) => (id === "org_a" ? { id, brainId: "brain_firm_a" } : null),
  }),
}));

const checkFirmLegalHolds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/legal-hold-check", () => ({ checkFirmLegalHolds }));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

const OPERATOR = {
  id: "op_1",
  email: "ops@subsumio.example",
  role: "admin",
  twoFactorEnabled: true,
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
};

function opCtx() {
  return { headers: { "x-op": "1" }, brainId: "brain_operator", plan: "team", user: OPERATOR };
}

function post(body: unknown, host = "ops.subsum.io") {
  return POST(
    new NextRequest("http://localhost:3000/api/admin/data-delete", {
      method: "POST",
      headers: {
        host,
        "Content-Type": "application/json",
        "x-csrf-token": "t",
        cookie: "sb_csrf=t",
      },
      body: JSON.stringify(body),
    })
  );
}

const REQUEST_BODY = { user_id: "u_target", reason: "gdpr_art17" as const };

beforeEach(() => {
  vi.clearAllMocks();
  pool.query.mockResolvedValue({ rows: [] });
  vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR.email);
  vi.mocked(requireEngineContext).mockResolvedValue(opCtx() as any);
});

describe("POST /api/admin/data-delete — legal hold gate", () => {
  it("proceeds when no matter is under legal hold", async () => {
    checkFirmLegalHolds.mockResolvedValue({ status: "clear" });
    const res = await post(REQUEST_BODY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.legal_hold_checked).toBe(true);
    expect(body.data.legal_hold_held_cases).toBe(0);
    expect(body.data.status).toBe("scheduled");
  });

  it("blocks with 409 when a matter is held and no override is given", async () => {
    checkFirmLegalHolds.mockResolvedValue({
      status: "held",
      cases: ["legal/case-1", "legal/case-2"],
    });
    const res = await post(REQUEST_BODY);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error?.code ?? body.code).toBe("legal_hold_active");
    // No deletion side effect ran — the gate returns before any pool write.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("proceeds when held but the operator passes legal_hold_override", async () => {
    checkFirmLegalHolds.mockResolvedValue({ status: "held", cases: ["legal/case-1"] });
    const res = await post({ ...REQUEST_BODY, legal_hold_override: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.legal_hold_held_cases).toBe(1);
    expect(body.data.legal_hold_override_applied).toBe(true);
  });

  it("fails closed with 503 when the hold status can't be determined", async () => {
    checkFirmLegalHolds.mockResolvedValue({ status: "unknown" });
    const res = await post(REQUEST_BODY);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error?.code ?? body.code).toBe("legal_hold_unknown");
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("checks the firm of the user being deleted, not the operator's own brain", async () => {
    checkFirmLegalHolds.mockResolvedValue({ status: "clear" });
    await post(REQUEST_BODY);
    expect(checkFirmLegalHolds).toHaveBeenCalledTimes(1);
    expect(checkFirmLegalHolds.mock.calls[0][0]).toEqual(
      expect.objectContaining({ "x-subsumio-source": "brain_firm_a" })
    );
    expect(checkFirmLegalHolds.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({ "x-op": "1" })
    );
  });

  it("an immediate deletion of a member of a held firm is blocked (409), nothing deleted", async () => {
    checkFirmLegalHolds.mockImplementation(async (headers: Record<string, string>) =>
      headers["x-subsumio-source"] === "brain_firm_a"
        ? { status: "held", cases: ["legal/case-1"] }
        : { status: "clear" }
    );
    const res = await post({ ...REQUEST_BODY, immediate: true });
    expect(res.status).toBe(409);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown user without deleting anything", async () => {
    const res = await post({ ...REQUEST_BODY, user_id: "u_missing" });
    expect(res.status).toBe(404);
    expect(checkFirmLegalHolds).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
