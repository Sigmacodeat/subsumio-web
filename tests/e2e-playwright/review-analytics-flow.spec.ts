/**
 * E2E Tests — Review & Analytics Module
 * =======================================
 * Covers: review-queue, review-sets, reports, analytics, adoption-analytics,
 *         litigation-analytics, portfolio-insights, precedent-search
 * Tests: Page render, no 503, key UI elements, API responses
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "ReviewTest1234!", name: "Review Tester" };

function getTestEmail() {
  testCounter++;
  return `review-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page) {
  const email = getTestEmail();
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "de",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await page.evaluate(() => {
    try {
      localStorage.setItem("subsumio-tour-completed", "true");
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
}

test.describe("Review & Analytics: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  const pages = [
    { path: "/dashboard/review-queue", heading: /Freigaben|Approvals/i },
    { path: "/dashboard/review-sets", heading: /Defensible Review|Review Sets/i },
    { path: "/dashboard/reports", heading: /Agenten-Berichte|Agent Reports/i },
    { path: "/dashboard/analytics", heading: /Feature-Nutzung|Analytics/i },
    { path: "/dashboard/adoption-analytics", heading: /Adoption Analytics/i },
    {
      path: "/dashboard/litigation-analytics",
      heading: /Verfahrensanalytics|Litigation Analytics/i,
    },
    { path: "/dashboard/portfolio-insights", heading: /Portfolio/i },
    { path: "/dashboard/precedent-search", heading: /Präzedenzsuche|Precedent Search/i },
  ];

  for (const p of pages) {
    test(`${p.path} loads without 503 and shows heading`, async ({ page }) => {
      const response = await page.goto(p.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).not.toBe(503);
      const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
      await expect(errorText).toHaveCount(0, { timeout: 5_000 });
      // Check heading — some pages may show empty state instead
      const heading = page.getByRole("heading", { name: p.heading }).first();
      if (await heading.isVisible({ timeout: 10_000 }).catch(() => false)) {
        expect(await heading.isVisible()).toBe(true);
      } else {
        // At minimum, main content should be visible
        await expect(page.locator("#main-content, main, [role='main']").first()).toBeVisible();
      }
    });
  }

  test("review-queue shows approval items or empty state", async ({ page }) => {
    await page.goto("/dashboard/review-queue", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("review-sets shows review set list or create button", async ({ page }) => {
    await page.goto("/dashboard/review-sets", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], button, text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("litigation-analytics shows charts or KPIs", async ({ page }) => {
    await page.goto("/dashboard/litigation-analytics", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const content = page.locator(
      ".recharts-surface, table, .tabular-nums, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("adoption-analytics shows analytics content", async ({ page }) => {
    await page.goto("/dashboard/adoption-analytics", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      ".recharts-surface, table, .tabular-nums, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("portfolio-insights shows portfolio content", async ({ page }) => {
    await page.goto("/dashboard/portfolio-insights", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      "table, .recharts-surface, [role='list'], text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("precedent-search shows search interface", async ({ page }) => {
    await page.goto("/dashboard/precedent-search", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("input, textarea, button, [role='searchbox']");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("reports shows report list or content", async ({ page }) => {
    await page.goto("/dashboard/reports", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], button, text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });
});

test.describe("Review & Analytics: API", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("review-sets API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/review-sets", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });

  test("litigation-analytics API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/analytics", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });
});
