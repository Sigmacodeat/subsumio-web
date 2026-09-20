/**
 * Marketing Visual Regression
 * ============================
 * Per-page screenshot baselines for the public surface. Baselines are
 * generated on first run (`--update-snapshots`) and then compared.
 *
 * Stability measures:
 * - reducedMotion: "reduce" (global config) — animations land in final state
 * - `animations: "disabled"` on the screenshot — freezes CSS transitions
 * - wait for h1 + fonts before capture
 * - fullPage captures the complete document including lazy sections
 */

import { test, expect } from "@playwright/test";

const PUBLIC_PAGES = [
  "/at",
  "/at/features",
  "/at/pricing",
  "/at/security",
  "/at/about",
  "/at/contact",
  "/at/download",
  "/at/docs",
  "/at/partners",
  "/at/superbrain",
  "/at/whatsapp",
  "/at/solutions/law-firms",
  "/at/solutions/solo",
  "/at/solutions/in-house",
  "/at/benchmark-methodology",
  "/at/blog",
  "/at/blog/ki-kanzleisoftware-berufsgeheimnis-rao",
  "/at/cities",
  "/at/cities/wien",
  "/at/cities/graz",
  "/at/cities/linz",
  "/at/cities/salzburg",
  "/at/cities/innsbruck",
  "/at/imprint",
  "/at/privacy",
] as const;

// The baselines are local artifacts (.gitignore: the -snapshots folder), and
// they are platform-specific — a macOS baseline never matches a Linux run.
// On CI there is therefore no baseline at all, and Playwright fails a missing
// one by design, so this suite could only ever be red there. It stays a local
// guard; CI keeps the accessibility and keyboard specs, which do not depend on
// stored pixels.
test.describe("Marketing Visual Regression", () => {
  test.skip(!!process.env.CI, "Referenzbilder sind lokal und plattformabhängig");

  for (const path of PUBLIC_PAGES) {
    test(`${path} matches baseline`, async ({ page }) => {
      // Autoplaying product demos and counters would make every run differ.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });
      // Let lazy font swaps + icon hydration settle.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot(`${path.replaceAll("/", "-")}.png`, {
        fullPage: true,
        animations: "disabled",
        // Framer whileInView elements and font anti-aliasing produce minor
        // per-run pixel noise; 1.5% tolerance keeps real regressions visible.
        maxDiffPixelRatio: 0.015,
      });
    });
  }
});
