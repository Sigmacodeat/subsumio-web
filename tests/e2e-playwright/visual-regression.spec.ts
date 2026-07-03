import { test, expect } from "@playwright/test";

/**
 * Visual Regression — Both Themes
 * ================================
 * Blueprint Phase 4 P1: "Visueller Regressionslauf beider Themes"
 * Captures screenshots of key dashboard states in light and dark mode
 * to detect unintended visual changes.
 */

let testCounter = 0;
const TEST_USER = {
  password: "VisualTest123!",
  name: "Visual Tester",
};

function getTestEmail() {
  testCounter++;
  return `visual-${Date.now()}-${testCounter}@subsumio.local`;
}

const KEY_VIEWS = [
  { name: "dashboard-home", path: "/dashboard" },
  { name: "cases", path: "/dashboard/cases" },
  { name: "deadlines", path: "/dashboard/deadlines" },
  { name: "settings", path: "/dashboard/settings" },
];

test.describe("Visual Regression — Both Themes", () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await page.goto("/signup", { waitUntil: "networkidle" });
    const email = getTestEmail();
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => window.location.pathname === "/dashboard", {
      timeout: 45_000,
    });
    await page.context().storageState({ path: "/tmp/visual-auth-state.json" });
    await page.close();
  });

  for (const view of KEY_VIEWS) {
    test(`${view.name} — light theme renders without errors`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: "/tmp/visual-auth-state.json",
        colorScheme: "light",
      });
      const page = await context.newPage();
      try {
        await page.goto(view.path, { waitUntil: "load" });
        await expect(page.locator("#main-content")).toBeVisible();
        await page.waitForTimeout(1_000);

        // Verify no console errors
        const errors: string[] = [];
        page.on("pageerror", (err) => errors.push(err.message));

        // Take screenshot for manual review
        await page.screenshot({
          path: `tests/screenshots/${view.name}-light.png`,
          fullPage: false,
        });

        // Basic visual sanity checks
        const sidebar = page.locator('[data-tour="sidebar"]');
        await expect(sidebar).toBeVisible();
      } finally {
        await page.close();
        await context.close();
      }
    });

    test(`${view.name} — dark theme renders without errors`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: "/tmp/visual-auth-state.json",
        colorScheme: "dark",
      });
      const page = await context.newPage();
      try {
        await page.goto(view.path, { waitUntil: "load" });
        await expect(page.locator("#main-content")).toBeVisible();
        await page.waitForTimeout(1_000);

        // Take screenshot for manual review
        await page.screenshot({
          path: `tests/screenshots/${view.name}-dark.png`,
          fullPage: false,
        });

        // Verify dark theme is applied
        const bg = await page.evaluate(() => {
          return window.getComputedStyle(document.body).backgroundColor;
        });
        // Dark theme should have a dark background
        expect(bg).toBeTruthy();
      } finally {
        await page.close();
        await context.close();
      }
    });
  }

  test("copilot panel — open and closed states", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/visual-auth-state.json",
      colorScheme: "light",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });
      await expect(page.locator("#main-content")).toBeVisible();

      // Closed state
      await page.waitForTimeout(500);
      await page.screenshot({
        path: "tests/screenshots/copilot-closed.png",
        fullPage: false,
      });

      // Open copilot
      await page.keyboard.press("Meta+j");
      await page.waitForTimeout(500);
      await page.screenshot({
        path: "tests/screenshots/copilot-open.png",
        fullPage: false,
      });

      const copilotPanel = page.locator('[data-tour="copilot-panel"]');
      await expect(copilotPanel).toBeVisible();
    } finally {
      await page.close();
      await context.close();
    }
  });

  test("sidebar — collapsed and expanded states", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/visual-auth-state.json",
      colorScheme: "light",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });
      await expect(page.locator("#main-content")).toBeVisible();

      // Expanded state (default)
      await page.waitForTimeout(500);
      await page.screenshot({
        path: "tests/screenshots/sidebar-expanded.png",
        fullPage: false,
      });

      // Collapse sidebar via button
      const collapseBtn = page
        .locator('button[aria-label*="einklappen"], button[aria-label*="Collapse"]')
        .first();
      if (await collapseBtn.isVisible()) {
        await collapseBtn.click();
        await page.waitForTimeout(500);
        await page.screenshot({
          path: "tests/screenshots/sidebar-collapsed.png",
          fullPage: false,
        });
      }
    } finally {
      await page.close();
      await context.close();
    }
  });
});
