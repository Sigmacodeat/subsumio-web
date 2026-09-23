// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordCreditConsumption = vi.hoisted(() => vi.fn(async () => undefined));
const canAfford = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/api-handler", () => ({
  createHandler:
    (
      opts: { body?: { parse: (d: unknown) => unknown } },
      handler: (ctx: unknown, body: unknown) => Promise<Response>
    ) =>
    async (req: Request) => {
      const ctx = { brainId: "b1", user: { id: "u1" }, headers: { "x-test": "1" } };
      return handler(ctx, opts.body ? opts.body.parse(await req.json()) : undefined);
    },
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: code, message }, { status }),
  recordCreditConsumption,
}));

vi.mock("@/lib/billing/optional-llm-credits", () => ({ canAffordOptionalLlm: canAfford }));

vi.mock("@/lib/planning-session", () => ({
  createPlan: vi.fn(async () => ({ id: "p1" })),
  proposeStepAction: vi.fn(async () => ({ tool: "search" })),
  markStepExecuted: vi.fn(async () => undefined),
  abandonPlan: vi.fn(async () => undefined),
  refinePlan: vi.fn(async () => ({ id: "p1" })),
  loadPlan: vi.fn(),
  listPlans: vi.fn(),
  updatePlanStep: vi.fn(),
}));

import { POST } from "./route";
import { createPlan } from "@/lib/planning-session";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://x/api/copilot/plan", {
      method: "POST",
      body: JSON.stringify(body),
    }) as never
  );

describe("POST /api/copilot/plan — Credits", () => {
  beforeEach(() => {
    recordCreditConsumption.mockClear();
    canAfford.mockReset().mockResolvedValue(true);
  });

  it("books one think credit after a plan was created", async () => {
    const res = await post({ action: "create", goal: "Klage vorbereiten" });
    expect(res.status).toBe(200);
    expect(recordCreditConsumption).toHaveBeenCalledWith(expect.anything(), "think");
  });

  it("refuses the model call at zero balance and books nothing", async () => {
    canAfford.mockResolvedValue(false);
    vi.mocked(createPlan).mockClear();
    const res = await post({ action: "create", goal: "Klage vorbereiten" });
    expect(res.status).toBe(402);
    expect(createPlan).not.toHaveBeenCalled();
    expect(recordCreditConsumption).not.toHaveBeenCalled();
  });

  it("keeps bookkeeping steps free, even at zero balance", async () => {
    canAfford.mockResolvedValue(false);
    const res = await post({ action: "executed", planId: "p1", stepId: "s1", tool: "search" });
    expect(res.status).toBe(200);
    expect(recordCreditConsumption).not.toHaveBeenCalled();
  });
});
