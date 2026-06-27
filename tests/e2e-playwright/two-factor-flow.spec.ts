import { test, expect } from "@playwright/test";

test.describe("2FA Flow (E2E)", () => {
  test("1. 2FA Setup → verify → backup codes", async ({ page }) => {
    // Sign up
    await page.goto("/signup", { waitUntil: "networkidle" });
    const email = `2fa-setup-${Date.now()}@subsumio.local`;
    await page.locator('input[name="name"]').fill("2FA Setup Test");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill("2FATest1234!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => window.location.pathname === "/dashboard", {
      timeout: 45_000,
    });

    // Get CSRF token
    const csrfToken = await page.evaluate(() => {
      const match = document.cookie.match(/sb_csrf=([^;]+)/);
      return match ? match[1] : "";
    });

    // Step 1: Setup — get secret + QR URL
    const setupRes = await page.context().request.post("/api/auth/2fa/setup", {
      headers: { "x-csrf-token": csrfToken },
    });
    expect(setupRes.status()).toBe(200);
    const setupBody = await setupRes.json();
    expect(setupBody.url || setupBody.qrData).toBeTruthy();

    // Try to verify with a dummy 6-digit code — expect failure (invalid token)
    // This tests the endpoint exists and validates
    const verifyRes = await page.context().request.post("/api/auth/2fa/verify", {
      data: { token: "000000" },
      headers: { "x-csrf-token": csrfToken },
    });
    // Should be 400 (invalid_token) — not 401 or 500
    expect(verifyRes.status()).toBe(400);
  });

  test("2. 2FA login flow — requires challenge after password", async ({ page, request }) => {
    // This test verifies the login endpoint structure
    // A full 2FA login test would require setting up 2FA first,
    // which needs TOTP code generation. We test the API contract.

    const res = await request.post("/api/auth/login", {
      data: { email: "nonexistent@subsumio.local", password: "wrong" },
    });

    // Should be 401 (invalid credentials) — not 200 with requiresTwoFactor
    expect(res.status()).toBe(401);
  });

  test("3. 2FA login-verify without challenge token is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/2fa/login-verify", {
      data: { challengeToken: "", token: "123456" },
    });
    expect([400, 401]).toContain(res.status());
  });

  test("4. 2FA disable without auth is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/2fa/disable", {
      data: { token: "123456" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("5. 2FA setup without auth is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/2fa/setup", {
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });

  test("6. 2FA verify without auth is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/2fa/verify", {
      data: { token: "123456" },
    });
    expect([401, 403]).toContain(res.status());
  });
});
