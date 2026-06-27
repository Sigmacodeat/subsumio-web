import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const origEnv = { ...process.env };

describe("stripe webhook idempotency", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...origEnv };
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe("isDuplicateEvent (in-memory fallback)", () => {
    test("first occurrence is not a duplicate", async () => {
      vi.resetModules();
      const { isDuplicateEvent } = await import("./helpers");
      const result = await isDuplicateEvent("evt_test_001", "invoice.payment_failed");
      expect(result).toBe(false);
    });

    test("second occurrence of same event ID is a duplicate", async () => {
      vi.resetModules();
      const { isDuplicateEvent } = await import("./helpers");
      await isDuplicateEvent("evt_test_002", "invoice.payment_failed");
      const result = await isDuplicateEvent("evt_test_002", "invoice.payment_failed");
      expect(result).toBe(true);
    });

    test("different event IDs are not duplicates", async () => {
      vi.resetModules();
      const { isDuplicateEvent } = await import("./helpers");
      await isDuplicateEvent("evt_test_003", "invoice.payment_failed");
      const result = await isDuplicateEvent("evt_test_004", "invoice.payment_failed");
      expect(result).toBe(false);
    });

    test("same event ID with different type is still a duplicate (ID is primary key)", async () => {
      vi.resetModules();
      const { isDuplicateEvent } = await import("./helpers");
      await isDuplicateEvent("evt_test_005", "invoice.payment_failed");
      const result = await isDuplicateEvent("evt_test_005", "invoice.payment_succeeded");
      expect(result).toBe(true);
    });
  });

  describe("MAX_INMEMORY_EVENTS eviction", () => {
    test("evicts oldest events when capacity exceeded", async () => {
      vi.resetModules();
      const { isDuplicateEvent } = await import("./helpers");
      // Insert MAX_INMEMORY_EVENTS + 1 events
      for (let i = 0; i <= 1000; i++) {
        await isDuplicateEvent(`evt_eviction_${i}`, "test.event");
      }
      // The very first event should have been evicted — re-adding should NOT be a duplicate
      const result = await isDuplicateEvent("evt_eviction_0", "test.event");
      expect(result).toBe(false);
    });

    test("recent events are still tracked after eviction", async () => {
      vi.resetModules();
      const { isDuplicateEvent } = await import("./helpers");
      for (let i = 0; i <= 1000; i++) {
        await isDuplicateEvent(`evt_recent_${i}`, "test.event");
      }
      // The last event should still be tracked as duplicate
      const result = await isDuplicateEvent(`evt_recent_1000`, "test.event");
      expect(result).toBe(true);
    });
  });
});

describe("stripe webhook signature verification", () => {
  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.DATABASE_URL;
  });

  test("rejects missing signature header", async () => {
    const { verifyStripeSignature } = await import("@/lib/stripe-webhook");
    expect(verifyStripeSignature("payload", null, "secret")).toBe(false);
  });

  test("rejects malformed signature header", async () => {
    const { verifyStripeSignature } = await import("@/lib/stripe-webhook");
    expect(verifyStripeSignature("payload", "malformed", "secret")).toBe(false);
  });

  test("rejects signature with wrong secret", async () => {
    const { verifyStripeSignature } = await import("@/lib/stripe-webhook");
    const payload = '{"id":"evt_test","type":"test"}';
    // Build a valid signature format with wrong secret
    const crypto = await import("node:crypto");
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const sig = crypto.createHmac("sha256", "wrong-secret").update(signedPayload).digest("hex");
    const header = `t=${timestamp},v1=${sig}`;
    expect(verifyStripeSignature(payload, header, "correct-secret")).toBe(false);
  });

  test("accepts valid signature", async () => {
    const { verifyStripeSignature } = await import("@/lib/stripe-webhook");
    const payload = '{"id":"evt_test","type":"test"}';
    const secret = "whsec_test123";
    const crypto = await import("node:crypto");
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const sig = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
    const header = `t=${timestamp},v1=${sig}`;
    expect(verifyStripeSignature(payload, header, secret)).toBe(true);
  });
});
