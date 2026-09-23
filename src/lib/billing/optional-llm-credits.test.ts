// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  balance: 5,
  env: undefined as string | undefined,
  fail: false,
}));
vi.mock("@/lib/billing/credits", () => ({
  CREDIT_COSTS: { think: 1, deadline_detect: 1, frist_engine: 0 },
  ensureTrialCredits: vi.fn(async () => {
    if (m.fail) throw new Error("db down");
  }),
  checkCredits: vi.fn(async (_o: string, _t: string, required: number) => ({
    ok: m.balance >= required,
    balance: m.balance,
    required,
  })),
}));
vi.mock("@/lib/env", () => ({ env: () => m.env }));

import { canAffordOptionalLlm } from "@/lib/billing/optional-llm-credits";

const ctx = { billing: { ownerId: "o", ownerType: "org" } } as never;

beforeEach(() => {
  m.balance = 5;
  m.env = undefined;
  m.fail = false;
});

describe("canAffordOptionalLlm", () => {
  it("follows the balance", async () => {
    expect(await canAffordOptionalLlm(ctx, "think")).toBe(true);
    m.balance = 0;
    expect(await canAffordOptionalLlm(ctx, "think")).toBe(false);
  });

  it("never blocks free operations, demo sessions or the e2e harness", async () => {
    m.balance = 0;
    expect(await canAffordOptionalLlm(ctx, "frist_engine")).toBe(true);
    expect(await canAffordOptionalLlm({ ...(ctx as object), demo: {} } as never, "think")).toBe(
      true
    );
    m.env = "1";
    expect(await canAffordOptionalLlm(ctx, "think")).toBe(true);
  });

  it("skips the paid call when the balance cannot be read", async () => {
    m.fail = true;
    expect(await canAffordOptionalLlm(ctx, "think")).toBe(false);
  });
});
