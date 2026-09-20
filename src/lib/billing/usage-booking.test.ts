/**
 * A credit booking must carry what the action consumed — otherwise the real
 * cost behind a credit can only be estimated (the gap this closes is section 6
 * of docs/KOSTEN_CREDITS_ANALYSE_2026-09-19.md).
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

vi.mock("@/lib/auth/store", () => ({
  getSharedPgPool: () => ({ query }),
  getStore: () => ({ getById: async () => null }),
  getOrgStore: () => ({ getById: async () => null }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("usage on a booking", () => {
  test("completes an earlier booking with model and tokens", async () => {
    const { attachUsageToBooking } = await import("./credits");
    await attachUsageToBooking("think-abc", {
      modelId: "anthropic:claude-sonnet-5",
      inputTokens: 18_000,
      outputTokens: 1_500,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("UPDATE subsumio_credit_transactions");
    expect(sql).toContain("WHERE idempotency_key = $1");
    expect(params).toEqual(["think-abc", "anthropic:claude-sonnet-5", 18_000, null, 1_500]);
  });

  test("keeps what is already there when a field is missing", async () => {
    const { attachUsageToBooking } = await import("./credits");
    await attachUsageToBooking("think-abc", { inputTokens: 10 });
    const [sql] = query.mock.calls[0] as unknown as [string];
    // COALESCE: a later report with fewer fields must not erase the earlier one.
    expect(sql).toContain("COALESCE($2, model_id)");
    expect(sql).toContain("COALESCE($5, output_tokens)");
  });

  test("does nothing without a database instead of throwing", async () => {
    vi.doMock("@/lib/auth/store", () => ({
      getSharedPgPool: () => null,
      getStore: () => ({ getById: async () => null }),
      getOrgStore: () => ({ getById: async () => null }),
    }));
    const { attachUsageToBooking } = await import("./credits");
    await expect(attachUsageToBooking("x", { inputTokens: 1 })).resolves.toBeUndefined();
  });
});
