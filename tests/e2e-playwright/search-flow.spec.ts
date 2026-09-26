import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "SearchTest123!",
  name: "Search Tester",
};

function getTestEmail() {
  testCounter++;
  return `search-e2e-${Date.now()}-${testCounter}@subsumio.local`;
}

test.describe("Search Flow", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/at/signup", { waitUntil: "networkidle" });
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    for (const box of await page
      .locator('[data-testid="signup-legal"] input[type="checkbox"]')
      .all()) {
      await box.check();
    }
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => window.location.pathname === "/dashboard", {
      timeout: 45_000,
    });
    await page.waitForLoadState("domcontentloaded");
    // Complete onboarding via API so dashboard pages don't redirect
    const csrf = (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
    await page.context().request.post("/api/onboarding", {
      data: { industry: null },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    // Set tour-completed to avoid guided tour overlay interfering
    await page.evaluate(() => {
      try {
        localStorage.setItem("subsumio-tour-completed", "true");
      } catch {}
    });
  });

  test("dashboard search input exists", async ({ page }) => {
    await page.goto("/dashboard");
    // Global search lives in the topbar as a button that opens the command
    // palette (⌘K) — there is no plain text input in the header.
    const searchTrigger = page.locator('button[aria-haspopup="dialog"]').first();
    await expect(searchTrigger).toBeVisible({ timeout: 15_000 });
    // Opening the palette reveals the actual search input
    await searchTrigger.click();
    const paletteInput = page.locator("[role='dialog'] input[role='combobox']:visible").first();
    await expect(paletteInput).toBeVisible({ timeout: 10_000 });
  });

  test("chat page renders (query UI)", async ({ page }) => {
    // /dashboard/query was folded into the copilot chat surface
    await page.goto("/dashboard/chat", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(page.locator("textarea[data-chat-input]:visible").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("brain explore page renders", async ({ page }) => {
    await page.goto("/dashboard/brain", { waitUntil: "domcontentloaded" });
    // The brain page has a search input — use a flexible selector
    await expect(
      page
        .locator(
          'input[placeholder*="Kanzleiwissen"], input[placeholder*="Brain"], input[placeholder*="brain"], input[type="search"]'
        )
        .first()
        // Empty knowledge base shows the empty state instead of the search field.
        .or(page.locator("[data-empty-state]"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("graph page renders", async ({ page }) => {
    await page.goto("/dashboard/graph", { waitUntil: "domcontentloaded" });
    // The graph page shows a loading spinner, empty state, canvas, or error
    // state (if the engine doesn't support graph data). All are valid renders.
    await expect(
      page
        .locator("canvas")
        .or(page.locator("[data-empty-state]"))
        .or(page.locator("text=/Beziehungsnetz/i"))
        .or(page.locator(".animate-spin"))
        .first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
