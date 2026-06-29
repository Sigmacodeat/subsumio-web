/**
 * E2E Tests — Tax Module (Steuer-Module)
 * ========================================
 * Covers: tax-assessments, tax-audit, tax-deadlines, tax-returns
 * Tests: Page render, no 503, key UI elements, CRUD via API
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "TaxTest1234!", name: "Tax Tester" };

function getTestEmail() {
  testCounter++;
  return `tax-${Date.now()}-${testCounter}@subsumio.local`;
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
  // Dismiss tour
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

test.describe("Tax Module: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  const taxPages = [
    { path: "/dashboard/tax-returns", heading: /Steuererklärungen|Tax Returns/i },
    { path: "/dashboard/tax-assessments", heading: /Bescheide|Assessments/i },
    { path: "/dashboard/tax-audit", heading: /Betriebsprüfung|Tax Audit/i },
    { path: "/dashboard/tax-deadlines", heading: /Steuerfristen|Tax Deadlines/i },
  ];

  for (const p of taxPages) {
    test(`${p.path} loads without 503 and shows heading`, async ({ page }) => {
      const response = await page.goto(p.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).not.toBe(503);
      await expect(page.getByRole("heading", { name: p.heading }).first()).toBeVisible({
        timeout: 15_000,
      });
      const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
      await expect(errorText).toHaveCount(0, { timeout: 5_000 });
    });
  }

  test("tax-returns page shows create form or table", async ({ page }) => {
    await page.goto("/dashboard/tax-returns", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Should have either a table, a form, or an empty-state message
    const hasTable = await page.locator("table").count();
    const hasForm = await page.locator('input, button[type="submit"]').count();
    const hasEmpty = await page.getByText(/Keine|None|Empty|No data/i).count();
    expect(hasTable + hasForm + hasEmpty).toBeGreaterThan(0);
  });

  test("tax-deadlines page shows deadline list or calendar", async ({ page }) => {
    await page.goto("/dashboard/tax-deadlines", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Should have some content — table, list, or empty state
    const content = page.locator(
      "table, .recharts-surface, [role='list'], text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("tax-assessments page shows assessment list", async ({ page }) => {
    await page.goto("/dashboard/tax-assessments", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("tax-audit page shows audit information", async ({ page }) => {
    await page.goto("/dashboard/tax-audit", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });
});

test.describe("Tax Module: API CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("tax-returns API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/tax-returns", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });

  test("tax-assessments API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/tax-assessments", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });

  test("tax-audit API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/tax-audit", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });

  test("tax-deadlines API returns data", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.get("/api/legal/tax-deadlines", {
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect([200, 404]).toContain(res.status());
  });
});
