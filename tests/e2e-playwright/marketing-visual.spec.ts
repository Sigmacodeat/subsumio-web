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

test.describe("Marketing Visual Regression", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} matches baseline`, async ({ page }) => {
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
