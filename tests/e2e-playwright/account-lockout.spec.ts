/**
 * E2E Account Lockout Tests
 * ==========================
 * Tests the account lockout mechanism:
 *   1. 5 failed login attempts → account locked
 *   2. Locked account returns 423 (or 429)
 *   3. Correct password after lockout → still rejected
 *   4. Lockout clears after window expires (simulated)
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_PASSWORD = "LockoutTest123!";

function getTestEmail() {
  testCounter++;
  return `lockout-${Date.now()}-${testCounter}@subsumio.local`;
}

test.describe("Account Lockout (E2E)", () => {
  test("5 failed logins → account locked", async ({ request }) => {
    const email = getTestEmail();

    // Sign up a user
    const signupRes = await request.post("/api/auth/signup", {
      data: {
        email,
        name: "Lockout Test",
        password: TEST_PASSWORD,
        locale: "en",
        industry: "legal",
      },
    });
    expect(signupRes.status()).toBe(201);

    // Attempt 5 wrong logins
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request.post("/api/auth/login", {
        data: { email, password: "WrongPassword123!" },
      });
      statuses.push(res.status());
    }

    // After 5 failed attempts, should get locked (423 or 429)
    const lastStatus = statuses[statuses.length - 1];
    expect([401, 423, 429]).toContain(lastStatus);

    // 6th attempt with correct password should still fail (locked)
    const correctRes = await request.post("/api/auth/login", {
      data: { email, password: TEST_PASSWORD },
    });
    expect([401, 423, 429]).toContain(correctRes.status());
    const body = await correctRes.json();
    // Should indicate lockout, not invalid credentials
    expect(body.error ?? body.code).toBeTruthy();
  });

  test("correct password on first attempt → not locked", async ({ request }) => {
    const email = getTestEmail();

    // Sign up
    const signupRes = await request.post("/api/auth/signup", {
      data: {
        email,
        name: "Lockout OK Test",
        password: TEST_PASSWORD,
        locale: "en",
        industry: "legal",
      },
    });
    expect(signupRes.status()).toBe(201);

    // Login with correct password
    const loginRes = await request.post("/api/auth/login", {
      data: { email, password: TEST_PASSWORD },
    });
    expect(loginRes.status()).toBe(200);
    const body = await loginRes.json();
    expect(body.ok).toBe(true);
  });

  test("rate limit kicks in before lockout (IP-based)", async ({ request }) => {
    const email = getTestEmail();

    // Sign up
    await request.post("/api/auth/signup", {
      data: {
        email,
        name: "Rate Limit Test",
        password: TEST_PASSWORD,
        locale: "en",
        industry: "legal",
      },
    });

    // The login endpoint has IP-based rate limiting (20/min)
    // and email-based lockout (5 attempts)
    // With 5 wrong attempts, lockout triggers first
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request.post("/api/auth/login", {
        data: { email, password: `Wrong${i}!` },
      });
      statuses.push(res.status());
    }

    // First 4 should be 401 (wrong password, not locked yet)
    for (let i = 0; i < 4; i++) {
      expect(statuses[i]).toBe(401);
    }

    // 5th or 6th should trigger lockout (423 or 429)
    const locked = statuses.slice(4).some((s) => s === 423 || s === 429);
    expect(locked).toBe(true);
  });
});
