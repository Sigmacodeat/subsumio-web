import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCreditReservation: vi.fn(),
  refundCredits: vi.fn(),
  deductCredits: vi.fn(),
  getBalance: vi.fn(),
}));

vi.mock("@/lib/billing/credits", () => ({
  ...mocks,
  checkAndSendBudgetAlert: vi.fn(),
}));

import { POST } from "./route";

const validBody = {
  pipeline_key: "pipeline-real",
  case_slug: "akte-1",
  reserved_credits: 20,
  actual_credits_override: 5,
  token_usage: [],
  owner_id: "org-1",
  owner_type: "org" as const,
};

function request(body = validBody, key?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (key) headers.set("x-engine-webhook-key", key);
  return new NextRequest("http://localhost/api/billing/pipeline-settle", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/pipeline-settle", () => {
  beforeEach(() => {
    vi.stubEnv("ENGINE_WEBHOOK_API_KEY", "engine-secret");
    mocks.getCreditReservation.mockResolvedValue({
      reservedCredits: 20,
      balanceAfterReservation: 80,
    });
    mocks.refundCredits.mockResolvedValue({ refunded: 15, balanceAfter: 95 });
    mocks.deductCredits.mockResolvedValue({ ok: true, balance: 80 });
    mocks.getBalance.mockResolvedValue({ balance: 95 });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects browser/session calls without the engine key", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.getCreditReservation).not.toHaveBeenCalled();
  });

  it("rejects an invalid engine key", async () => {
    const response = await POST(request(validBody, "wrong-secret"));

    expect(response.status).toBe(401);
  });

  it("rejects a forged pipeline key", async () => {
    mocks.getCreditReservation.mockResolvedValue(null);

    const response = await POST(request(validBody, "engine-secret"));

    expect(response.status).toBe(404);
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("rejects a caller-supplied amount that differs from the ledger", async () => {
    const response = await POST(
      request({ ...validBody, reserved_credits: 10_000 }, "engine-secret")
    );

    expect(response.status).toBe(409);
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("settles only a verified owner-scoped reservation", async () => {
    const response = await POST(request(validBody, "engine-secret"));

    expect(response.status).toBe(200);
    expect(mocks.getCreditReservation).toHaveBeenCalledWith("org-1", "org", "pipeline-real");
    expect(mocks.refundCredits).toHaveBeenCalledWith("org-1", "org", 20, 5, "pipeline-real");
  });
});
