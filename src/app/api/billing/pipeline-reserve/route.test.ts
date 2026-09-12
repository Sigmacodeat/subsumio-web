import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  estimatePipelineCredits: vi.fn(),
  reserveCredits: vi.fn(),
}));

vi.mock("@/lib/billing/credit-rate-card", () => ({
  estimatePipelineCredits: mocks.estimatePipelineCredits,
}));

vi.mock("@/lib/billing/credits", () => ({
  reserveCredits: mocks.reserveCredits,
  insufficientCreditsResponse: (balance: number, required: number) =>
    Response.json({ error: "insufficient_credits", balance, required }, { status: 402 }),
}));

import { POST } from "./route";

const validBody = {
  owner_id: "org-1",
  owner_type: "org" as const,
  case_slug: "akte-1",
  pages: 25,
  workflow_id: "aktencheck" as const,
};

function request(key?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (key) headers.set("x-engine-webhook-key", key);
  return new NextRequest("http://localhost/api/billing/pipeline-reserve", {
    method: "POST",
    headers,
    body: JSON.stringify(validBody),
  });
}

describe("POST /api/billing/pipeline-reserve", () => {
  beforeEach(() => {
    vi.stubEnv("ENGINE_WEBHOOK_API_KEY", "engine-secret");
    mocks.estimatePipelineCredits.mockReturnValue({ estimatedCredits: 20 });
    mocks.reserveCredits.mockImplementation(
      async (_ownerId: string, _ownerType: string, amount: number, key: string) => ({
        ok: true,
        reservedCredits: amount,
        balanceAfterReservation: 80,
        idempotencyKey: key,
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects requests without the engine key", async () => {
    const response = await POST(request(), {});

    expect(response.status).toBe(401);
    expect(mocks.reserveCredits).not.toHaveBeenCalled();
  });

  it("rejects an invalid engine key", async () => {
    const response = await POST(request("wrong-secret"), {});

    expect(response.status).toBe(401);
  });

  it("creates the pipeline key on the server and reserves the estimate", async () => {
    const response = await POST(request("engine-secret"), {});
    const result = (await response.json()) as {
      pipeline_key: string;
      reserved_credits: number;
    };

    expect(response.status).toBe(200);
    expect(result.pipeline_key).toMatch(/^pipeline-[0-9a-f-]+$/);
    expect(result.reserved_credits).toBe(20);
    expect(mocks.reserveCredits).toHaveBeenCalledWith("org-1", "org", 20, result.pipeline_key);
  });

  it("fails closed when the ledger rejects the reservation", async () => {
    mocks.reserveCredits.mockResolvedValue({
      ok: false,
      reservedCredits: 0,
      balanceAfterReservation: 3,
      idempotencyKey: "unused",
    });

    const response = await POST(request("engine-secret"), {});

    expect(response.status).toBe(402);
  });
});
