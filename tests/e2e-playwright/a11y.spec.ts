import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const CRITICAL_PAGES = [
  "/at",
  "/at/features",
  "/at/pricing",
  "/at/login",
  "/at/signup",
  "/at/security",
  "/at/about",
  "/at/contact",
  "/at/download",
  "/at/docs",
  "/at/partners",
  "/at/solutions/law-firms",
  "/at/solutions/solo",
  "/at/solutions/in-house",
];

for (const path of CRITICAL_PAGES) {
  test(`a11y scan: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude('[aria-hidden="true"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const critical = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(critical).toHaveLength(0);
  });
}
