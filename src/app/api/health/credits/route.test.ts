/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
//
// The credits check makes paid provider calls and reveals whether the
// service runs without AI credit — operators only, never anonymous callers.
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
const getCreditsHealth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/credits-health-shared", () => ({ getCreditsHealth }));

import { GET } from "./route";
import { requireEngineContext } from "@/lib/engine";

const OPERATOR = "ops@subsumio.example";
const ctx = (email: string) => ({
  headers: {},
  brainId: "brain",
  plan: "team",
  user: {
    id: "u1",
    email,
    role: "admin",
    twoFactorEnabled: true,
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  },
});
const request = () =>
  new NextRequest("http://localhost:3000/api/health/credits", {
    headers: { host: "ops.subsum.io" },
  });

describe("GET /api/health/credits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
    getCreditsHealth.mockResolvedValue({ providers: {}, allOk: true, checkedAt: "x" });
  });

  it("refuses anonymous callers without any provider call", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(
      Response.json({ error: "unauthorized" }, { status: 401 }) as any
    );
    expect((await GET(request())).status).toBe(401);
    expect(getCreditsHealth).not.toHaveBeenCalled();
  });

  it("refuses Kanzlei admins", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx("partner@kanzlei.example") as any);
    expect((await GET(request())).status).toBe(403);
    expect(getCreditsHealth).not.toHaveBeenCalled();
  });

  it("serves platform operators", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    expect((await GET(request())).status).toBe(200);
    expect(getCreditsHealth).toHaveBeenCalledTimes(1);
  });
});
