// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/datetime", () => ({
  currentMonth: vi.fn(() => "2024-06"),
}));

vi.mock("@/lib/plans", () => ({
  incQuota: vi.fn(async () => {}),
  getQuota: vi.fn(async () => ({ queries: 42, documents: 0, storage_mb: 0 })),
}));

import { recordQuery, usageFor } from "./usage";
import { incQuota, getQuota } from "@/lib/plans";

describe("recordQuery", () => {
  beforeEach(() => vi.clearAllMocks());

  test("calls incQuota with brainId and queries field", async () => {
    await recordQuery("brain-1");
    expect(incQuota).toHaveBeenCalledWith("brain-1", "queries", 1);
  });

  test("propagates error from incQuota", async () => {
    vi.mocked(incQuota).mockRejectedValueOnce(new Error("fail"));
    await expect(recordQuery("brain-1")).rejects.toThrow("fail");
  });
});

describe("usageFor", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns month and queries from quota", async () => {
    const result = await usageFor("brain-1");
    expect(result.month).toBe("2024-06");
    expect(result.queries).toBe(42);
  });

  test("returns 0 queries on error", async () => {
    vi.mocked(getQuota).mockRejectedValueOnce(new Error("fail"));
    const result = await usageFor("brain-1");
    expect(result.month).toBe("2024-06");
    expect(result.queries).toBe(0);
  });

  test("calls getQuota with brainId", async () => {
    await usageFor("brain-99");
    expect(getQuota).toHaveBeenCalledWith("brain-99");
  });
});
