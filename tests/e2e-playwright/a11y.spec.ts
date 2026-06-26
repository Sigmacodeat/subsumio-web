import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const CRITICAL_PAGES = [
  "/",
  "/de",
  "/de/features",
  "/de/pricing",
  "/de/login",
  "/de/signup",
  "/de/security",
  "/de/about",
  "/de/contact",
  "/de/download",
  "/de/docs",
  "/de/partners",
  "/de/solutions/law-firms",
  "/de/solutions/solo",
  "/de/solutions/in-house",
  "/features",
  "/pricing",
  "/security",
  "/about",
  "/contact",
  "/download",
  "/docs",
  "/partners",
  "/solutions/law-firms",
  "/solutions/solo",
  "/solutions/in-house",
];

for (const path of CRITICAL_PAGES) {
  test(`a11y scan: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const critical = accessibilityScanResults.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(critical).toHaveLength(0);
  });
}
