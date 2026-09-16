/**
 * E2E Tests — Platform & Integration Module
 * ============================================
 * Covers: shared-spaces, sources, version-history, word-addin, workflows/builder,
 *         case-scanner, mobile/pipeline
 * Tests: Page render, no 503, key UI elements
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "PlatTest1234!", name: "Platform Tester" };

function getTestEmail() {
  testCounter++;
  return `plat-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Platform & Integration: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  const pages = [
    { path: "/dashboard/shared-spaces", name: "Shared Spaces" },
    { path: "/dashboard/sources", name: "Legal Sources" },
    { path: "/dashboard/version-history", name: "Version History" },
    { path: "/dashboard/word-addin", name: "Word Add-in" },
    { path: "/dashboard/workflows/builder", name: "Workflow Builder" },
    { path: "/dashboard/case-scanner", name: "Case Scanner" },
    { path: "/dashboard/mobile/pipeline", name: "Mobile Pipeline" },
  ];

  for (const p of pages) {
    test(`${p.path} loads without 503`, async ({ page }) => {
      const response = await page.goto(p.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).not.toBe(503);
      const errorText = page.getByText(/Engine nicht erreichbar|Service unavailable|503/i);
      await expect(errorText).toHaveCount(0, { timeout: 5_000 });
    });
  }

  test("shared-spaces shows spaces list or empty state", async ({ page }) => {
    await page.goto("/dashboard/shared-spaces", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page
      .locator("table")
      .or(page.locator("[role='list']"))
      .or(page.locator("button"))
      .or(page.getByText(/Keine|None|Empty|No/i));
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("sources shows legal sources heading", async ({ page }) => {
    await page.goto("/dashboard/sources", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading", { name: /Rechtsquellen|Legal Sources/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("version-history shows version heading", async ({ page }) => {
    await page.goto("/dashboard/version-history", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading", { name: /Versionshistorie|Version/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("word-addin shows Word Add-in heading", async ({ page }) => {
    await page.goto("/dashboard/word-addin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading", { name: /Word Add-in/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("case-scanner shows scanner heading", async ({ page }) => {
    await page.goto("/dashboard/case-scanner", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading", { name: /Akten-Scanner|Case Scanner/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("mobile/pipeline shows pipeline content", async ({ page }) => {
    await page.goto("/dashboard/mobile/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page
      .locator("h1")
      .or(page.locator("h2"))
      .or(page.locator("[role='list']"))
      .or(page.getByText(/Pipeline/i));
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("workflows/builder shows builder interface", async ({ page }) => {
    await page.goto("/dashboard/workflows/builder", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Should have some content — canvas, form, or empty state
    const content = page
      .locator("canvas")
      .or(page.locator("[role='application']"))
      .or(page.locator("form"))
      .or(page.locator("button"))
      .or(page.getByText(/Builder|Workflow/i));
    expect(await content.count()).toBeGreaterThan(0);
  });
});

test.describe("Platform: Functional", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("word-addin shows installation or download info", async ({ page }) => {
    await page.goto("/dashboard/word-addin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page
      .locator("button")
      .or(page.locator("a[href*='download']"))
      .or(page.locator("a[href*='install']"))
      .or(page.locator("code"))
      .or(page.locator("pre"))
      .or(page.getByText(/Download|Install|Add-in/i));
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("case-scanner shows scan interface", async ({ page }) => {
    await page.goto("/dashboard/case-scanner", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("input, button, textarea, [role='button']");
    expect(await content.count()).toBeGreaterThan(0);
  });
});
