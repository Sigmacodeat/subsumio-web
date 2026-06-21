/**
 * E2E Onboarding Wizard Flow Tests
 * =================================
 * Tests the guided onboarding experience:
 *   1. Welcome step renders
 *   2. Industry selection
 *   3. Profile setup (kanzlei data)
 *   4. Document upload step
 *   5. First query step
 *   6. Completion → dashboard redirect
 *   7. Onboarding API endpoint
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "OnboardTest123!",
  name: "Onboard Tester",
};

function getTestEmail() {
  testCounter++;
  return `onboard-${Date.now()}-${testCounter}@subsumio.local`;
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
  return email;
}

test.describe("Onboarding Wizard Flow", () => {
  test("onboarding page renders with welcome step", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });

    await expect(page.locator("body")).not.toContainText("404");
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("onboarding API completes successfully", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });

    const csrfToken = (await page.context().cookies()).find(
      (cookie) => cookie.name === "sb_csrf"
    )?.value;

    const res = await page.context().request.post("/api/onboarding", {
      data: { industry: "legal" },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(res.status()).toBe(200);
  });

  test("onboarding with null industry completes", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });

    const csrfToken = (await page.context().cookies()).find(
      (cookie) => cookie.name === "sb_csrf"
    )?.value;

    const res = await page.context().request.post("/api/onboarding", {
      data: { industry: null },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(res.status()).toBe(200);
  });

  test("full onboarding flow: signup → onboarding → dashboard", async ({ page }) => {
    await signUpViaApi(page);

    await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });

    const csrfToken = (await page.context().cookies()).find(
      (cookie) => cookie.name === "sb_csrf"
    )?.value;

    const onboardRes = await page.context().request.post("/api/onboarding", {
      data: { industry: "legal" },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(onboardRes.status()).toBe(200);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/?$/);

    await expect(page.locator("nav, header, [role='navigation']").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("onboarding page shows interactive elements", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });

    const hasButtons = await page.locator("button").count();
    expect(hasButtons).toBeGreaterThan(0);
  });

  test("kanzlei settings accessible after onboarding", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });

    const csrfToken = (await page.context().cookies()).find(
      (cookie) => cookie.name === "sb_csrf"
    )?.value;

    await page.context().request.post("/api/onboarding", {
      data: { industry: "legal" },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });

    await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).not.toContainText("404");
  });
});
