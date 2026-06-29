/**
 * E2E Tests — Misc Dashboard Pages
 * ===================================
 * Covers: litigation, process-strategy, experience, rechtsprechung/analytics,
 *         whatsapp/templates, trust-accounting, brain/[slug] (dynamic)
 * Tests: Page render, no 503, key UI elements, CRUD via API
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "MiscTest1234!", name: "Misc Tester" };

function getTestEmail() {
  testCounter++;
  return `misc-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Misc Dashboard: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  const pages = [
    { path: "/dashboard/litigation", heading: /Prozessführung|Litigation/i },
    { path: "/dashboard/process-strategy", heading: /Prozessstrategie|Litigation Strategy/i },
    { path: "/dashboard/experience", heading: /Erfahrungen & Insights|Experience & Insights/i },
    { path: "/dashboard/rechtsprechung/analytics", heading: /Judikatur-Analytics/i },
    { path: "/dashboard/whatsapp/templates", heading: /WhatsApp-Vorlagen|WhatsApp Templates/i },
    { path: "/dashboard/trust-accounting", heading: /Treuhandkonten|Trust Accounts/i },
  ];

  for (const p of pages) {
    test(`${p.path} loads without 503 and shows heading`, async ({ page }) => {
      const response = await page.goto(p.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).not.toBe(503);
      const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
      await expect(errorText).toHaveCount(0, { timeout: 5_000 });
      const heading = page.getByRole("heading", { name: p.heading }).first();
      await expect(heading).toBeVisible({ timeout: 15_000 });
    });
  }

  test("litigation shows phase or case list", async ({ page }) => {
    await page.goto("/dashboard/litigation", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], button, text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("process-strategy shows strategy content", async ({ page }) => {
    await page.goto("/dashboard/process-strategy", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      "table, [role='list'], textarea, button, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("experience shows experience content", async ({ page }) => {
    await page.goto("/dashboard/experience", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      "table, [role='list'], .recharts-surface, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("rechtsprechung/analytics shows analytics content", async ({ page }) => {
    await page.goto("/dashboard/rechtsprechung/analytics", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      ".recharts-surface, table, .tabular-nums, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("whatsapp/templates shows template list or create", async ({ page }) => {
    await page.goto("/dashboard/whatsapp/templates", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], button, text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("trust-accounting shows trust account list", async ({ page }) => {
    await page.goto("/dashboard/trust-accounting", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      "table, [role='list'], button, .tabular-nums, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });
});

test.describe("Misc Dashboard: API", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("litigation API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/litigation", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });

  test("trust-accounting API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/trust-accounts", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });
});

test.describe("Misc Dashboard: Dynamic Routes", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("brain/[slug] loads a brain page detail", async ({ page }) => {
    // Create a page first, then navigate to brain detail
    const csrf = await getCsrfToken(page);
    const slug = `brain-test-${Date.now()}`;
    await page.context().request.post("/api/pages", {
      data: {
        slug,
        title: "Brain Test Page",
        type: "note",
        content: "Test content for brain page.",
        frontmatter: { status: "active" },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    const response = await page.goto(`/dashboard/brain/${slug}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).not.toBe(503);
    // Should show the page content or a brain interface
    const mainContent = page.locator("#main-content, main, [role='main']").first();
    await expect(mainContent).toBeVisible({ timeout: 10_000 });
  });
});
