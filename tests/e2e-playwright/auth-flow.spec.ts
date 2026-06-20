import { test, expect } from "@playwright/test";

test.describe("Auth Flow", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/de/login", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    // The CTA button contains "Anmelden" plus an arrow icon
    await expect(page.locator('button:has-text("Anmelden")')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("register page renders", async ({ page }) => {
    await page.goto("/de/signup", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await expect(page.locator('button:has-text("Konto erstellen")')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("redirects unauthenticated user from dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/.*login.*/);
  });
});
