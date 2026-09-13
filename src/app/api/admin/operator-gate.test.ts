/* eslint-disable @typescript-eslint/no-explicit-any */
// Operator routes must be unreachable for Kanzlei roles and outside the ops host.
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
vi.mock("@/lib/billing/saas-usage", () => ({
  getSaaSUsageOverview: vi.fn().mockResolvedValue({ byModel: [], byWorkflow: [], totals: {} }),
}));
vi.mock("@/lib/auth/api-key-auth", () => ({ verifyApiKey: vi.fn().mockResolvedValue(null) }));

import { GET as saasUsage } from "./saas-usage/route";
import { requireEngineContext } from "@/lib/engine";

const OPERATOR = "ops@subsumio.example";

function ctx(email: string, twoFactorEnabled = true) {
  return {
    headers: {},
    brainId: "brain",
    plan: "team",
    user: { id: "u1", email, role: "admin", twoFactorEnabled },
  };
}

function request(host = "ops.subsum.eu") {
  return new NextRequest("http://localhost:3000/api/admin/saas-usage", {
    headers: { host },
  });
}

describe("operator gate on /api/admin/saas-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("PLATFORM_OPERATOR_EMAILS", OPERATOR);
  });

  it("serves platform operators", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    expect((await saasUsage(request())).status).toBe(200);
  });

  it("rejects Kanzlei admins", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx("partner@kanzlei.example") as any);
    expect((await saasUsage(request())).status).toBe(403);
  });

  it("rejects operators without 2FA", async () => {
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR, false) as any);
    expect((await saasUsage(request())).status).toBe(403);
  });

  it("is not served outside the ops host in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.mocked(requireEngineContext).mockResolvedValue(ctx(OPERATOR) as any);
    expect((await saasUsage(request("subsum.eu"))).status).toBe(404);
  });
});
