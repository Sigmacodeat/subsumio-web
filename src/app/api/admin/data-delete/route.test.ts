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
}));
vi.mock("@/lib/auth/api-key-auth", () => ({ verifyApiKey: vi.fn().mockResolvedValue(null) }));

const pool = vi.hoisted(() => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock("@/lib/auth/store", () => ({ getSharedPgPool: () => pool }));

const checkFirmLegalHolds = vi.hoisted(() => vi.fn());
vi.mock("@/lib/legal-hold-check", () => ({ checkFirmLegalHolds }));

import { POST } from "./route";
import { requireEngineContext } from "@/lib/engine";

const OPERATOR = {
  id: "op_1",
  email: "ops@subsumio.example",
  role: "admin",
  twoFactorEnabled: true,
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

  it("passes the operator's own signed headers to the hold check, not identity-less firm headers", async () => {
    checkFirmLegalHolds.mockResolvedValue({ status: "clear" });
    await post(REQUEST_BODY);
    expect(checkFirmLegalHolds).toHaveBeenCalledWith(expect.objectContaining({ "x-op": "1" }));
  });
});
