// @vitest-environment node

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { recordFailedLogin, isAccountLocked, clearLockout } from "./lockout";

describe("Account Lockout", () => {
  const testEmail = `test-lockout-${Date.now()}@example.com`;

  beforeEach(async () => {
    vi.useRealTimers();
    await clearLockout(testEmail);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("recordFailedLogin", () => {
    test("tracks failed attempts without locking before threshold", async () => {
      const r1 = await recordFailedLogin(testEmail);
      expect(r1.locked).toBe(false);
      expect(r1.retryAfterSeconds).toBe(0);

      const r2 = await recordFailedLogin(testEmail);
      expect(r2.locked).toBe(false);
    });

    test("locks after exactly 5 failed attempts (boundary)", async () => {
      for (let i = 0; i < 4; i++) {
        const r = await recordFailedLogin(testEmail);
        expect(r.locked).toBe(false);
        expect(r.retryAfterSeconds).toBe(0);
      }
      const r5 = await recordFailedLogin(testEmail);
      expect(r5.locked).toBe(true);
      expect(r5.retryAfterSeconds).toBeGreaterThan(0);
    });

    test("retryAfterSeconds is approximately 30 minutes (1800s)", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }
      const status = await isAccountLocked(testEmail);
      expect(status.locked).toBe(true);
      expect(status.retryAfterSeconds).toBeGreaterThan(1700);
      expect(status.retryAfterSeconds).toBeLessThanOrEqual(1800);
    });

    test("4th attempt does not lock (just below threshold)", async () => {
      for (let i = 0; i < 4; i++) {
        await recordFailedLogin(testEmail);
      }
      const status = await isAccountLocked(testEmail);
      expect(status.locked).toBe(false);
    });

    test("6th attempt while locked still reports locked", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }
      expect((await isAccountLocked(testEmail)).locked).toBe(true);

      const r6 = await recordFailedLogin(testEmail);
      expect(r6.locked).toBe(true);
    });

    test("retryAfterSeconds is 0 when not locked", async () => {
      const r = await recordFailedLogin(testEmail);
      expect(r.retryAfterSeconds).toBe(0);
    });
  });

  describe("isAccountLocked", () => {
    test("returns unlocked for unknown email", async () => {
      const status = await isAccountLocked(`unknown-${Date.now()}@example.com`);
      expect(status.locked).toBe(false);
      expect(status.retryAfterSeconds).toBe(0);
    });

    test("returns unlocked after clearLockout", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }
      expect((await isAccountLocked(testEmail)).locked).toBe(true);

      await clearLockout(testEmail);
      const status = await isAccountLocked(testEmail);
      expect(status.locked).toBe(false);
    });

    test("lockout is case-insensitive (email normalized to lowercase)", async () => {
      const upperEmail = `Test-Case-${Date.now()}@Example.COM`;
      const lowerEmail = upperEmail.toLowerCase();

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(upperEmail);
      }
      const status = await isAccountLocked(lowerEmail);
      expect(status.locked).toBe(true);

      await clearLockout(lowerEmail);
    });

    test("lock persists across multiple isAccountLocked calls", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }

      const s1 = await isAccountLocked(testEmail);
      const s2 = await isAccountLocked(testEmail);
      const s3 = await isAccountLocked(testEmail);

      expect(s1.locked).toBe(true);
      expect(s2.locked).toBe(true);
      expect(s3.locked).toBe(true);
    });

    test("auto-unlocks after lockout duration expires", async () => {
      vi.useFakeTimers();
      const t0 = Date.now();

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }
      expect((await isAccountLocked(testEmail)).locked).toBe(true);

      // Advance 31 minutes — past the 30-minute lockout
      vi.setSystemTime(t0 + 31 * 60 * 1000);

      const status = await isAccountLocked(testEmail);
      expect(status.locked).toBe(false);
      expect(status.retryAfterSeconds).toBe(0);
    });

    test("retryAfterSeconds decreases as time passes", async () => {
      vi.useFakeTimers();
      const t0 = Date.now();

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }

      const s1 = await isAccountLocked(testEmail);
      expect(s1.locked).toBe(true);
      expect(s1.retryAfterSeconds).toBeLessThanOrEqual(1800);

      // Advance 10 minutes
      vi.setSystemTime(t0 + 10 * 60 * 1000);
      const s2 = await isAccountLocked(testEmail);
      expect(s2.locked).toBe(true);
      expect(s2.retryAfterSeconds).toBeLessThan(s1.retryAfterSeconds);
      expect(s2.retryAfterSeconds).toBeGreaterThan(1100); // ~20 min remaining
    });

    test("still locked at 29 minutes (just before expiry)", async () => {
      vi.useFakeTimers();
      const t0 = Date.now();

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }

      vi.setSystemTime(t0 + 29 * 60 * 1000);
      const status = await isAccountLocked(testEmail);
      expect(status.locked).toBe(true);
      expect(status.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe("clearLockout", () => {
    test("clears lockout and allows new attempts", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }
      expect((await isAccountLocked(testEmail)).locked).toBe(true);

      await clearLockout(testEmail);

      const r = await recordFailedLogin(testEmail);
      expect(r.locked).toBe(false);
    });

    test("does not throw for unknown email", async () => {
      await expect(clearLockout(`nonexistent-${Date.now()}@example.com`)).resolves.not.toThrow();
    });

    test("is idempotent — calling twice does not throw", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }

      await clearLockout(testEmail);
      await expect(clearLockout(testEmail)).resolves.not.toThrow();
    });

    test("clears lockout for different email without affecting others", async () => {
      const emailA = `a-${Date.now()}@example.com`;
      const emailB = `b-${Date.now()}@example.com`;

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(emailA);
        await recordFailedLogin(emailB);
      }
      expect((await isAccountLocked(emailA)).locked).toBe(true);
      expect((await isAccountLocked(emailB)).locked).toBe(true);

      await clearLockout(emailA);

      expect((await isAccountLocked(emailA)).locked).toBe(false);
      expect((await isAccountLocked(emailB)).locked).toBe(true);

      await clearLockout(emailB);
    });
  });

  describe("lockout window reset", () => {
    test("failed attempts counter resets after 15-minute window", async () => {
      vi.useFakeTimers();
      const t0 = Date.now();
      const windowEmail = `window-${Date.now()}@example.com`;

      // Record 3 failures (below threshold)
      for (let i = 0; i < 3; i++) {
        await recordFailedLogin(windowEmail);
      }

      // Advance 16 minutes — past the 15-minute window
      vi.setSystemTime(t0 + 16 * 60 * 1000);

      // Next failure should start fresh (attempt 1, not 4)
      const r = await recordFailedLogin(windowEmail);
      expect(r.locked).toBe(false);
      expect(r.retryAfterSeconds).toBe(0);

      // Only 1 attempt after reset, so 4 more needed to lock
      for (let i = 0; i < 3; i++) {
        const r2 = await recordFailedLogin(windowEmail);
        expect(r2.locked).toBe(false);
      }
      const r5 = await recordFailedLogin(windowEmail);
      expect(r5.locked).toBe(true);

      await clearLockout(windowEmail);
    });

    test("failed attempts do NOT reset within the 15-minute window", async () => {
      vi.useFakeTimers();
      const t0 = Date.now();
      const windowEmail = `window2-${Date.now()}@example.com`;

      for (let i = 0; i < 3; i++) {
        await recordFailedLogin(windowEmail);
      }

      // Advance only 10 minutes (within window)
      vi.setSystemTime(t0 + 10 * 60 * 1000);

      // 4th attempt should continue counting from 3
      const r4 = await recordFailedLogin(windowEmail);
      expect(r4.locked).toBe(false);

      // 5th attempt should lock (total 5 within window)
      const r5 = await recordFailedLogin(windowEmail);
      expect(r5.locked).toBe(true);

      await clearLockout(windowEmail);
    });
  });

  describe("concurrent attempts", () => {
    test("multiple simultaneous failed attempts are counted correctly", async () => {
      const concurrentEmail = `concurrent-${Date.now()}@example.com`;

      const results = await Promise.all(
        Array.from({ length: 5 }, () => recordFailedLogin(concurrentEmail))
      );

      const lockedResults = results.filter((r) => r.locked);
      expect(lockedResults.length).toBeGreaterThanOrEqual(1);

      const status = await isAccountLocked(concurrentEmail);
      expect(status.locked).toBe(true);

      await clearLockout(concurrentEmail);
    });

    test("10 concurrent attempts all result in locked state", async () => {
      const email = `burst-${Date.now()}@example.com`;

      await Promise.all(Array.from({ length: 10 }, () => recordFailedLogin(email)));

      const status = await isAccountLocked(email);
      expect(status.locked).toBe(true);

      await clearLockout(email);
    });
  });

  describe("successful login clears lockout", () => {
    test("clearLockout simulates what happens on successful login", async () => {
      for (let i = 0; i < 4; i++) {
        await recordFailedLogin(testEmail);
      }

      await clearLockout(testEmail);

      const r = await recordFailedLogin(testEmail);
      expect(r.locked).toBe(false);
    });

    test("clearing after full lockout allows immediate re-login attempts", async () => {
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }
      expect((await isAccountLocked(testEmail)).locked).toBe(true);

      await clearLockout(testEmail);

      // Should be able to start fresh immediately
      const r = await recordFailedLogin(testEmail);
      expect(r.locked).toBe(false);
      expect(r.retryAfterSeconds).toBe(0);
    });
  });

  describe("email normalization", () => {
    test("mixed-case emails map to same lockout entry", async () => {
      const email = `Mixed-Case-${Date.now()}@Example.COM`;
      const lower = email.toLowerCase();

      // Record 4 failures with mixed case
      for (let i = 0; i < 4; i++) {
        await recordFailedLogin(email);
      }
      // 5th with lowercase should lock
      const r = await recordFailedLogin(lower);
      expect(r.locked).toBe(true);

      await clearLockout(lower);
    });

    test("different emails have independent lockout state", async () => {
      const email1 = `indep1-${Date.now()}@example.com`;
      const email2 = `indep2-${Date.now()}@example.com`;

      // Lock email1
      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(email1);
      }
      expect((await isAccountLocked(email1)).locked).toBe(true);

      // email2 should be unaffected
      expect((await isAccountLocked(email2)).locked).toBe(false);

      // email2 can still accumulate attempts
      const r = await recordFailedLogin(email2);
      expect(r.locked).toBe(false);

      await clearLockout(email1);
      await clearLockout(email2);
    });
  });

  describe("lockout state after expiry and re-lock", () => {
    test("account can be re-locked after auto-expiry", async () => {
      vi.useFakeTimers();
      const t0 = Date.now();

      for (let i = 0; i < 5; i++) {
        await recordFailedLogin(testEmail);
      }
      expect((await isAccountLocked(testEmail)).locked).toBe(true);

      // Wait for expiry
      vi.setSystemTime(t0 + 31 * 60 * 1000);
      expect((await isAccountLocked(testEmail)).locked).toBe(false);

      // Re-lock with 5 new attempts
      for (let i = 0; i < 4; i++) {
        const r = await recordFailedLogin(testEmail);
        expect(r.locked).toBe(false);
      }
      const r5 = await recordFailedLogin(testEmail);
      expect(r5.locked).toBe(true);
    });
  });
});
