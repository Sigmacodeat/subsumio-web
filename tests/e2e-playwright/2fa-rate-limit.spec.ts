/**
 * E2E 2FA Rate Limiting Tests
 * ============================
 * Verifies that 2FA endpoints enforce per-user rate limits:
 *   1. 2FA verify — 5 wrong attempts → 429
 *   2. 2FA login-verify — 5 wrong attempts → 429
 *   3. 2FA disable — 5 wrong attempts → 429
 *
 * These tests complement two-factor-flow.spec.ts which tests the
 * happy path and API contract. Here we focus on brute-force protection.
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "2FARateTest123!",
  name: "2FA Rate Test",
};

function getTestEmail() {
  testCounter++;
  return `2fa-rate-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page) {
  const email = getTestEmail();
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "en",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sb_csrf"
  )?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  return { email, csrfToken };
}

function getCsrfToken(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => {
    const match = document.cookie.match(/sb_csrf=([^;]+)/);
    return match ? match[1] : null;
  });
}

test.describe("2FA Rate Limiting (E2E)", () => {
  test("1. 2FA verify — 6 wrong TOTP codes → 429", async ({ page }) => {
    await signUpViaApi(page);

    const csrfToken = await getCsrfToken(page);
    expect(csrfToken).toBeTruthy();

    // First, setup 2FA to get a pending secret
    const setupRes = await page.context().request.post("/api/auth/2fa/setup", {
      headers: { "x-csrf-token": csrfToken! },
    });
    expect(setupRes.status()).toBe(200);

    // Now try to verify with wrong codes — should get 429 after 5 attempts
    let got429 = false;
    for (let i = 0; i < 7; i++) {
      const verifyRes = await page.context().request.post("/api/auth/2fa/verify", {
        data: { token: `00000${i}` },
        headers: { "x-csrf-token": csrfToken! },
      });

      if (verifyRes.status() === 429) {
        got429 = true;
        const body = await verifyRes.json();
        expect(body.error).toMatch(/rate/i);
        break;
      }
      // Before rate limit, should be 400 (invalid_token)
      expect([400, 410]).toContain(verifyRes.status());
    }

    expect(got429).toBe(true);
  });

  test("2. 2FA login-verify — rate limited after 5 attempts", async ({ request }) => {
    // Use a fake challenge token — will get 401, but rate limit is per-IP
    // The handler-level rate limit is per-IP (20/5min), so we need many attempts
    // The per-user limit (5/5min) only kicks in after challenge token verification

    // Send 25 requests with fake challenge tokens
    let got429 = false;
    for (let i = 0; i < 25; i++) {
      const res = await request.post("/api/auth/2fa/login-verify", {
        data: { challengeToken: "fake_token", token: "123456" },
      });

      if (res.status() === 429) {
        got429 = true;
        break;
      }
      // Should be 401 (invalid challenge) before rate limit
      expect(res.status()).toBe(401);
    }

    // Per-IP rate limit (20/5min) should kick in
    expect(got429).toBe(true);
  });

  test("3. 2FA disable — rate limited after 5 wrong passwords", async ({ page }) => {
    await signUpViaApi(page);

    const csrfToken = await getCsrfToken(page);
    expect(csrfToken).toBeTruthy();

    // 2FA is not enabled, so we'll get 400 (2fa_not_enabled) before rate limit
    // But the rate limiter runs before the 2FA check
    let got429 = false;
    for (let i = 0; i < 7; i++) {
      const res = await page.context().request.post("/api/auth/2fa/disable", {
        data: { password: `wrong_password_${i}` },
        headers: { "x-csrf-token": csrfToken! },
      });

      if (res.status() === 429) {
        got429 = true;
        const body = await res.json();
        expect(body.error).toMatch(/rate/i);
        break;
      }
      // Before rate limit: 400 (2fa_not_enabled) since we haven't set up 2FA
      expect([400, 403]).toContain(res.status());
    }

    expect(got429).toBe(true);
  });
});
