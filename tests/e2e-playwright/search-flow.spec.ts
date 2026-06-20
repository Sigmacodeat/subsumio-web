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
    await page.goto("/signup", { waitUntil: "networkidle" });
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 45_000 });
    await page.waitForLoadState("domcontentloaded");
  });

  test("dashboard search input exists", async ({ page }) => {
    await page.goto("/dashboard");
    // Global search is usually in the header/sidebar
    await expect(page.locator('input[placeholder*="Suchen"], input[placeholder*="Search"]')).toBeVisible();
  });

  test("brain query page renders", async ({ page }) => {
    await page.goto("/dashboard/query");
    await expect(page.locator('text=Brain Query')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button[aria-label="Senden"]')).toBeVisible();
  });

  test("brain explore page renders", async ({ page }) => {
    await page.goto("/dashboard/brain", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[placeholder*="Brain durchsuchen"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test("graph page renders", async ({ page }) => {
    await page.goto("/dashboard/graph", { waitUntil: "domcontentloaded" });
    await expect(page.locator('text=Graph wird geladen').or(page.locator('text=Graph ist leer')).or(page.locator('canvas'))).toBeVisible({ timeout: 15_000 });
  });
});
