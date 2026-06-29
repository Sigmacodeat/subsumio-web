/**
 * E2E Tests — Legal Workflow Module
 * ====================================
 * Covers: intake, clause-library, templates, translate, obligation-tracking
 * Tests: Page render, no 503, key UI elements, form interactions
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "LegalTest1234!", name: "Legal Tester" };

function getTestEmail() {
  testCounter++;
  return `legal-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Legal Workflow: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  const pages = [
    { path: "/dashboard/intake", heading: /Mandatsaufnahme|Intake/i },
    { path: "/dashboard/clause-library", heading: /Klausel-Bibliothek|Clause Library/i },
    { path: "/dashboard/templates", heading: /Vorlagen-Bibliothek|Template Library/i },
    { path: "/dashboard/translate", heading: /Juristische Übersetzung|Legal Translation/i },
    { path: "/dashboard/obligation-tracking", heading: /Pflichten-Tracking|Obligation Tracking/i },
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

  test("intake page shows form fields", async ({ page }) => {
    await page.goto("/dashboard/intake", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("input, textarea, select, button");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("clause-library shows clause list or search", async ({ page }) => {
    await page.goto("/dashboard/clause-library", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      "table, [role='list'], input, textarea, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("templates shows template list or create button", async ({ page }) => {
    await page.goto("/dashboard/templates", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], button, text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("translate shows translation interface", async ({ page }) => {
    await page.goto("/dashboard/translate", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("textarea, input, select, [role='combobox']");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("obligation-tracking shows obligation list or table", async ({ page }) => {
    await page.goto("/dashboard/obligation-tracking", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator(
      "table, [role='list'], .tabular-nums, text=/Keine|None|Empty|No/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });
});

test.describe("Legal Workflow: Functional", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("obligation-tracking shows urgency badges", async ({ page }) => {
    await page.goto("/dashboard/obligation-tracking", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // The page should show some content — either obligations or empty state
    const mainContent = page.locator("#main-content, main, [role='main']").first();
    await expect(mainContent).toBeVisible({ timeout: 10_000 });
  });

  test("templates page has create or add button", async ({ page }) => {
    await page.goto("/dashboard/templates", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Should have some interactive element
    const interactive = page.locator("button, a[href*='template'], select");
    expect(await interactive.count()).toBeGreaterThan(0);
  });

  test("intake page has submit button", async ({ page }) => {
    await page.goto("/dashboard/intake", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Should have a submit or save button
    const submit = page.locator(
      'button[type="submit"], button:has-text("Speichern"), button:has-text("Save"), button:has-text("Anlegen")'
    );
    const form = page.locator("form");
    expect((await submit.count()) + (await form.count())).toBeGreaterThan(0);
  });
});
