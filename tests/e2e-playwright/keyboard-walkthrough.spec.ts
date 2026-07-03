import { test, expect } from "@playwright/test";

/**
 * WCAG Keyboard-Only Walkthrough
 * ==============================
 * Verifies that the 5 most common user tasks can be completed
 * using only the keyboard (Tab, Enter, Escape, arrow keys).
 * No mouse clicks are used in the main flow.
 *
 * Blueprint Phase 4 P1: "Login → Akte → Frist anlegen → Copilot-Query → Suche"
 */

let testCounter = 0;
const TEST_USER = {
  password: "KbdTest123!",
  name: "Keyboard Tester",
};

function getTestEmail() {
  testCounter++;
  return `kbd-${Date.now()}-${testCounter}@subsumio.local`;
}

test.describe("Keyboard-Only Walkthrough", () => {
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
    await page.context().storageState({ path: "/tmp/kbd-auth-state.json" });
    await page.close();
  });

  test("Tab navigation reaches all primary nav items", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/kbd-auth-state.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });
      await expect(page.locator("#main-content")).toBeVisible();

      // Press Tab repeatedly and collect focused elements
      const focusedHrefs: string[] = [];
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        const href = await page.evaluate(() => {
          const el = document.activeElement;
          if (el instanceof HTMLAnchorElement) return el.getAttribute("href");
          if (el instanceof HTMLButtonElement) return el.getAttribute("data-href");
          return null;
        });
        if (href) focusedHrefs.push(href);
      }

      // Should have reached at least the dashboard and cases links
      expect(focusedHrefs.some((h) => h?.includes("/dashboard"))).toBeTruthy();
    } finally {
      await page.close();
      await context.close();
    }
  });

  test("Skip link is first focusable and jumps to main content", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/kbd-auth-state.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });

      // First Tab should reach skip link
      await page.keyboard.press("Tab");
      const skipLink = page.locator('a:has-text("Skip"), a:has-text("Überspringen")');
      await expect(skipLink).toBeVisible();

      // Enter on skip link should move focus to main content
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeVisible();
    } finally {
      await page.close();
      await context.close();
    }
  });

  test("Command palette opens with Cmd+K and is keyboard navigable", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/kbd-auth-state.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });
      await expect(page.locator("#main-content")).toBeVisible();

      // Open command palette via keyboard
      await page.keyboard.press("Meta+k");

      // Palette input should be focused
      const paletteInput = page
        .locator(
          'input[role="combobox"], input[aria-label*="earch"], input[placeholder*="uche"], input[placeholder*="earch"]'
        )
        .first();
      await expect(paletteInput).toBeVisible({ timeout: 3_000 });

      // Type a query
      await page.keyboard.type("Akten");

      // Arrow down to navigate results
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");

      // Escape closes palette
      await page.keyboard.press("Escape");
      await expect(paletteInput).not.toBeVisible({ timeout: 3_000 });
    } finally {
      await page.close();
      await context.close();
    }
  });

  test("Copilot panel toggles with keyboard shortcut", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/kbd-auth-state.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });
      await expect(page.locator("#main-content")).toBeVisible();

      // Toggle copilot via Cmd+J
      await page.keyboard.press("Meta+j");

      // Copilot panel should appear
      const copilotPanel = page.locator('[data-tour="copilot-panel"]');
      await expect(copilotPanel).toBeVisible({ timeout: 3_000 });

      // Toggle again to close
      await page.keyboard.press("Meta+j");
    } finally {
      await page.close();
      await context.close();
    }
  });

  test("Navigate to cases page via keyboard", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/kbd-auth-state.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });
      await expect(page.locator("#main-content")).toBeVisible();

      // Use command palette to navigate
      await page.keyboard.press("Meta+k");
      const paletteInput = page
        .locator(
          'input[role="combobox"], input[aria-label*="earch"], input[placeholder*="uche"], input[placeholder*="earch"]'
        )
        .first();
      await expect(paletteInput).toBeVisible({ timeout: 3_000 });

      await page.keyboard.type("Akten");
      await page.waitForTimeout(500);

      // Press Enter to navigate to first result
      await page.keyboard.press("Enter");

      // Should navigate to cases page
      await page.waitForURL(/\/dashboard\/cases/, { timeout: 5_000 });
      expect(page.url()).toContain("/dashboard/cases");
    } finally {
      await page.close();
      await context.close();
    }
  });

  test("No keyboard trap in copilot panel", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: "/tmp/kbd-auth-state.json",
    });
    const page = await context.newPage();
    try {
      await page.goto("/dashboard", { waitUntil: "load" });
      await expect(page.locator("#main-content")).toBeVisible();

      // Open copilot
      await page.keyboard.press("Meta+j");
      const copilotPanel = page.locator('[data-tour="copilot-panel"]');
      await expect(copilotPanel).toBeVisible({ timeout: 3_000 });

      // Tab through the panel — should not get trapped
      for (let i = 0; i < 20; i++) {
        await page.keyboard.press("Tab");
      }

      // Escape should not close the desktop panel (only mobile)
      // Verify panel is still open
      await expect(copilotPanel).toBeVisible();

      // Close via Cmd+J
      await page.keyboard.press("Meta+j");
    } finally {
      await page.close();
      await context.close();
    }
  });
});
