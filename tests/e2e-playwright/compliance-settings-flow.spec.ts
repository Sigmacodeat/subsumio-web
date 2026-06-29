/**
 * E2E Tests — Compliance Sub-pages & Settings Sub-pages
 * ======================================================
 * Covers: compliance/ai-act, compliance/retention,
 *         settings/ai-model, settings/kanzlei, settings/scim
 * Tests: Page render, no 503, key UI elements, tab switching
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "CompTest1234!", name: "Comp Tester" };

function getTestEmail() {
  testCounter++;
  return `comp-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Compliance Sub-pages: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("/dashboard/compliance/ai-act loads without 503", async ({ page }) => {
    const response = await page.goto("/dashboard/compliance/ai-act", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).not.toBe(503);
    const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });
    // Should show AI Act related content
    const content = page.locator(
      "h1, h2, h3, [role='tab'], text=/AI Act|KI-Verordnung|Overview|Übersicht/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("/dashboard/compliance/ai-act shows overview section", async ({ page }) => {
    await page.goto("/dashboard/compliance/ai-act", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByText(/Overview|Übersicht|AI Act|KI-Verordnung/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("/dashboard/compliance/retention loads without 503", async ({ page }) => {
    const response = await page.goto("/dashboard/compliance/retention", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).not.toBe(503);
    const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });
  });

  test("/dashboard/compliance/retention shows retention heading", async ({ page }) => {
    await page.goto("/dashboard/compliance/retention", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading", { name: /Löschfristen|Retention/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("/dashboard/compliance/retention shows retention table or list", async ({ page }) => {
    await page.goto("/dashboard/compliance/retention", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("table, [role='list'], text=/Keine|None|Empty|No/i");
    expect(await content.count()).toBeGreaterThan(0);
  });
});

test.describe("Settings Sub-pages: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("/dashboard/settings/ai-model loads without 503", async ({ page }) => {
    const response = await page.goto("/dashboard/settings/ai-model", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).not.toBe(503);
    const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });
  });

  test("/dashboard/settings/ai-model shows AI model heading", async ({ page }) => {
    await page.goto("/dashboard/settings/ai-model", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading", { name: /KI-Modell|AI Model/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("/dashboard/settings/ai-model shows model selector or config", async ({ page }) => {
    await page.goto("/dashboard/settings/ai-model", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("select, [role='combobox'], input, button, text=/Modell|Model/i");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("/dashboard/settings/kanzlei loads without 503", async ({ page }) => {
    const response = await page.goto("/dashboard/settings/kanzlei", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).not.toBe(503);
    const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });
  });

  test("/dashboard/settings/kanzlei shows firm settings heading", async ({ page }) => {
    await page.goto("/dashboard/settings/kanzlei", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page
      .getByRole("heading", { name: /Kanzlei-Einstellungen|Firm settings/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("/dashboard/settings/kanzlei shows form fields", async ({ page }) => {
    await page.goto("/dashboard/settings/kanzlei", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("input, select, textarea, button");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("/dashboard/settings/scim loads without 503", async ({ page }) => {
    const response = await page.goto("/dashboard/settings/scim", { waitUntil: "domcontentloaded" });
    expect(response?.status()).not.toBe(503);
    const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
    await expect(errorText).toHaveCount(0, { timeout: 5_000 });
  });

  test("/dashboard/settings/scim shows SCIM heading", async ({ page }) => {
    await page.goto("/dashboard/settings/scim", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByRole("heading", { name: /SCIM/i }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("/dashboard/settings/scim shows SCIM config or info", async ({ page }) => {
    await page.goto("/dashboard/settings/scim", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("input, button, code, pre, text=/SCIM|Endpoint|Token/i");
    expect(await content.count()).toBeGreaterThan(0);
  });
});
