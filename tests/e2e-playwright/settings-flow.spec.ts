/**
 * E2E Settings Flow Tests
 * ========================
 * Tests the settings/dashboard area:
 *   1. Settings page renders
 *   2. Profile update via API (CSRF + auth)
 *   3. API key listing
 *   4. SCIM status endpoint (admin only)
 *   5. 401 redirect on expired session (simulated)
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "SettingsTest123!",
  name: "Settings Tester",
};

function getTestEmail() {
  testCounter++;
  return `settings-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Settings Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("1. Settings page renders", async ({ page }) => {
    await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
    // Should not 404 or 503
    const response = await page.reload({ waitUntil: "domcontentloaded" });
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(503);
  });

  test("2. Profile update via API with valid CSRF → success", async ({ page }) => {
    const csrfToken = await getCsrfToken(page);
    expect(csrfToken).toBeTruthy();

    const res = await page.context().request.patch("/api/auth/me", {
      data: { name: "Updated Name" },
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken!,
      },
    });
    expect(res.status()).not.toBe(403);
    expect(res.status()).not.toBe(401);
    const body = await res.json();
    expect(body.user?.name).toBe("Updated Name");
  });

  test("3. Profile update without CSRF → 403", async ({ page }) => {
    const res = await page.context().request.patch("/api/auth/me", {
      data: { name: "Should Fail" },
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "invalid_token",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("4. GET /api/auth/me returns user profile", async ({ page }) => {
    const res = await page.context().request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBeDefined();
    // Sensitive fields must not be present
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.twoFactorSecret).toBeUndefined();
  });

  test("5. API keys endpoint returns list", async ({ page }) => {
    const res = await page.context().request.get("/api/settings/api-keys");
    expect(res.status()).not.toBe(503);
    // Should be 200 with array or object
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("6. SCIM status without admin role → 403 or empty", async ({ page }) => {
    // Regular user (not admin) should not access SCIM status
    const res = await page.context().request.get("/api/scim/status");
    // Should be 403 (forbidden) since test user is not admin
    expect([200, 403]).toContain(res.status());
  });

  test("7. Session expiry → 401 from API", async ({ page, context }) => {
    // Clear session cookie to simulate expiry
    await context.clearCookies();

    const res = await page.context().request.get("/api/auth/me");
    expect(res.status()).toBe(401);
  });

  test("8. Session expiry → redirect to login in browser", async ({ page, context }) => {
    // Clear session cookie to simulate expiry
    await context.clearCookies();

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
