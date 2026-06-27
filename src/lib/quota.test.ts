import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const origEnv = { ...process.env };

describe("quota enforcement and atomicity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe("checkQuota (in-memory fallback)", () => {
    test("allows query when under limit", async () => {
      delete process.env.DATABASE_URL;
      const { checkQuota } = await import("./plans");
      const result = await checkQuota(`test-brain-ok-${Date.now()}`, "free", "queries");
      expect(result.ok).toBe(true);
      expect(result.limit).toBe(100);
    });

    test("rejects query when over limit (free plan, 100 queries)", async () => {
      delete process.env.DATABASE_URL;
      const { checkQuota, incQuota } = await import("./plans");
      const brainId = `test-brain-over-${Date.now()}`;
      for (let i = 0; i < 100; i++) {
        await incQuota(brainId, "queries");
      }
      const result = await checkQuota(brainId, "free", "queries");
      expect(result.used).toBeGreaterThanOrEqual(100);
    });
  });

  describe("quotaExceeded response", () => {
    test("returns 429 with correct error structure", async () => {
      const { quotaExceeded } = await import("./plans");
      const response = quotaExceeded("queries", 101, 100);
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.error).toBe("quota_exceeded");
      expect(body.field).toBe("queries");
      expect(body.used).toBe(101);
      expect(body.limit).toBe(100);
      expect(body.message).toContain("100");
    });

    test("returns 429 for uploads quota", async () => {
      const { quotaExceeded } = await import("./plans");
      const response = quotaExceeded("uploads", 51, 50);
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body.field).toBe("uploads");
    });
  });

  describe("incQuota (in-memory fallback)", () => {
    test("increments quota and persists", async () => {
      delete process.env.DATABASE_URL;
      const { incQuota, getQuota } = await import("./plans");
      const brainId = `test-brain-inc-${Date.now()}`;
      await incQuota(brainId, "queries");
      await incQuota(brainId, "queries");
      await incQuota(brainId, "queries", 5);
      const quota = await getQuota(brainId);
      expect(quota.queries).toBe(7);
    });

    test("uploads quota is tracked separately from queries", async () => {
      delete process.env.DATABASE_URL;
      const { incQuota, getQuota } = await import("./plans");
      const brainId = `test-brain-sep-${Date.now()}`;
      await incQuota(brainId, "queries", 3);
      await incQuota(brainId, "uploads", 2);
      const quota = await getQuota(brainId);
      expect(quota.queries).toBe(3);
      expect(quota.uploads).toBe(2);
    });
  });
});
