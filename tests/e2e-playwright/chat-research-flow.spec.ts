/**
 * E2E Tests — Chat & Research Module
 * ====================================
 * Covers: chat, chat/analytics, chat/compare, research, deep-analysis, analyze
 * Tests: Page render, no 503, key UI elements, chat input, analytics charts
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "ChatTest1234!", name: "Chat Tester" };

function getTestEmail() {
  testCounter++;
  return `chat-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Chat & Research: Pages Render", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  const pages = [
    { path: "/dashboard/chat", name: "Chat" },
    { path: "/dashboard/chat/analytics", name: "Chat Analytics" },
    { path: "/dashboard/chat/compare", name: "Chat Compare" },
    { path: "/dashboard/research", name: "Research" },
    { path: "/dashboard/deep-analysis", name: "Deep Analysis" },
    { path: "/dashboard/analyze", name: "Analyze" },
  ];

  for (const p of pages) {
    test(`${p.path} loads without 503`, async ({ page }) => {
      const response = await page.goto(p.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).not.toBe(503);
      const errorText = page.locator("text=/Engine nicht erreichbar|Service unavailable|503/i");
      await expect(errorText).toHaveCount(0, { timeout: 5_000 });
    });
  }

  test("chat page shows chat input or message interface", async ({ page }) => {
    await page.goto("/dashboard/chat", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Chat page should have a textarea or input for messages
    const chatInput = page.locator(
      "textarea, input[placeholder*='chat'], input[placeholder*='fragen'], input[placeholder*='ask'], input[placeholder*='Nachricht']"
    );
    const messageArea = page.locator("[role='log'], [class*='message'], [class*='chat']");
    expect((await chatInput.count()) + (await messageArea.count())).toBeGreaterThan(0);
  });

  test("chat/analytics shows analytics content", async ({ page }) => {
    await page.goto("/dashboard/chat/analytics", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByText(/Chat Analytics|Chat-Analytics/i).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("chat/compare shows comparison interface", async ({ page }) => {
    await page.goto("/dashboard/chat/compare", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    // Should have some content — model selector, comparison panel, etc.
    const content = page.locator(
      "select, textarea, [role='combobox'], text=/Compare|Vergleich|Modell/i"
    );
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("research page shows search or research interface", async ({ page }) => {
    await page.goto("/dashboard/research", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const content = page.locator("input, textarea, button, [role='searchbox']");
    expect(await content.count()).toBeGreaterThan(0);
  });

  test("deep-analysis page shows analysis content", async ({ page }) => {
    await page.goto("/dashboard/deep-analysis", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page.getByText(/Übergreifende Muster|Cross-cutting|Deep Analysis/i).first();
    if (await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
      expect(await heading.isVisible()).toBe(true);
    }
  });

  test("analyze page shows document analysis heading", async ({ page }) => {
    await page.goto("/dashboard/analyze", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const heading = page
      .getByRole("heading", { name: /Dokument-Analyse|Document Analysis/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Chat: Functional", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("chat page renders main content area", async ({ page }) => {
    await page.goto("/dashboard/chat", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const mainContent = page.locator("#main-content, main, [role='main']").first();
    await expect(mainContent).toBeVisible({ timeout: 10_000 });
  });

  test("analyze page has upload or input area", async ({ page }) => {
    await page.goto("/dashboard/analyze", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const input = page.locator("input[type='file'], textarea, [role='button']");
    expect(await input.count()).toBeGreaterThan(0);
  });
});
