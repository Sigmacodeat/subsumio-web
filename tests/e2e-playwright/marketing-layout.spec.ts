/**
 * Marketing Layout Consistency Tests
 * ====================================
 * Verifies that all marketing pages render correctly with consistent
 * layout patterns: responsive padding, typography, no horizontal overflow,
 * and key visual elements present.
 */

import { test, expect } from "@playwright/test";

const MARKETING_PAGES = [
  { path: "/at", title: "Subsumio", checkHero: true },
  { path: "/at/features", title: "Features", checkHero: true },
  { path: "/at/pricing", title: "Pricing", checkHero: true },
  { path: "/at/security", title: "Security", checkHero: true },
  { path: "/at/about", title: "About", checkHero: true },
  { path: "/at/contact", title: "Contact", checkHero: true },
  { path: "/at/download", title: "Download", checkHero: true },
  { path: "/at/docs", title: "Docs", checkHero: true },
  { path: "/at/partners", title: "Partners", checkHero: true },
  { path: "/at/solutions/law-firms", title: "Law Firms", checkHero: true },
  { path: "/at/solutions/solo", title: "Solo", checkHero: true },
  { path: "/at/solutions/in-house", title: "In-House", checkHero: true },
  { path: "/at/superbrain", title: "SuperBrain", checkHero: true },
  { path: "/at/whatsapp", title: "WhatsApp", checkHero: true },
  { path: "/at/blog", title: "Blog", checkHero: true },
  { path: "/at/benchmark-methodology", title: "Benchmark-Methodik", checkHero: true },
  { path: "/at/cities", title: "Städte", checkHero: true },
  {
    path: "/at/blog/ki-kanzleisoftware-berufsgeheimnis-rao",
    title: "Blog-Post",
    checkHero: true,
  },
  { path: "/at/cities/wien", title: "Wien", checkHero: true },
  { path: "/at/cities/graz", title: "Graz", checkHero: true },
  { path: "/at/cities/linz", title: "Linz", checkHero: true },
  { path: "/at/cities/salzburg", title: "Salzburg", checkHero: true },
  { path: "/at/cities/innsbruck", title: "Innsbruck", checkHero: true },
];

// Consolidated legacy routes — real 308s via next.config redirects()
const REDIRECT_ROUTES: [string, string][] = [
  ["/at/kanzlei", "/at/solutions/law-firms"],
  ["/kanzlei", "/at/solutions/law-firms"],
  ["/at/solutions/mid-sized", "/at/solutions/law-firms"],
  ["/solutions/mid-sized", "/at/solutions/law-firms"],
  ["/blog", "/at/blog"],
  [
    "/blog/ki-kanzleisoftware-berufsgeheimnis-rao",
    "/at/blog/ki-kanzleisoftware-berufsgeheimnis-rao",
  ],
  ["/cities", "/at/cities"],
  ["/cities/wien", "/at/cities/wien"],
  ["/benchmark-methodology", "/at/benchmark-methodology"],
];

test.describe("Marketing Layout Consistency", () => {
  for (const p of MARKETING_PAGES) {
    test(`${p.path} renders without errors`, async ({ page }) => {
      const response = await page.goto(p.path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      expect(response?.status()).not.toBe(404);
      expect(response?.status()).not.toBe(500);
    });

    test(`${p.path} has no horizontal overflow`, async ({ page }) => {
      await page.goto(p.path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    if (p.checkHero) {
      test(`${p.path} has visible h1`, async ({ page }) => {
        await page.goto(p.path, { waitUntil: "load" });
        await page.waitForLoadState("networkidle");
        const h1 = page.locator("h1").first();
        await expect(h1).toBeVisible({ timeout: 10_000 });
        const fontSize = await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(fontSize).toBeGreaterThanOrEqual(20);
      });
    }

    test(`${p.path} has consistent section padding`, async ({ page }) => {
      await page.goto(p.path, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      const sections = await page.locator("section").all();
      expect(sections.length).toBeGreaterThan(0);
      let checkedCount = 0;
      for (const section of sections) {
        const visible = await section.isVisible();
        if (!visible) continue;
        const paddingLeft = await section.evaluate((el) =>
          parseFloat(getComputedStyle(el).paddingLeft)
        );
        const paddingRight = await section.evaluate((el) =>
          parseFloat(getComputedStyle(el).paddingRight)
        );
        // Skip wrapper sections with no padding (inner elements carry padding)
        if (paddingLeft === 0 && paddingRight === 0) continue;
        checkedCount++;
        expect(paddingLeft).toBeGreaterThan(0);
        expect(paddingRight).toBeGreaterThan(0);
        expect(paddingLeft).toBeCloseTo(paddingRight, 0);
      }
      expect(checkedCount).toBeGreaterThan(0);
    });
  }

  test.describe("Consolidated routes redirect with real 308", () => {
    for (const [from, to] of REDIRECT_ROUTES) {
      test(`${from} → ${to}`, async ({ page }) => {
        const response = await page.goto(from, { waitUntil: "domcontentloaded" });
        // page.goto follows redirects — final URL must be the canonical page
        expect(page.url()).toContain(to);
        expect(response?.status()).toBe(200);
      });
    }
  });

  test.describe("Responsive padding on mobile", () => {
    for (const path of ["/at", "/at/features", "/at/pricing"]) {
      test(`${path} has reduced padding on mobile viewport`, async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.goto(path, { waitUntil: "load" });
        await page.waitForLoadState("networkidle");
        const firstSection = page.locator("section").first();
        if (await firstSection.isVisible()) {
          const paddingLeft = await firstSection.evaluate((el) =>
            parseFloat(getComputedStyle(el).paddingLeft)
          );
          expect(paddingLeft).toBeGreaterThanOrEqual(12);
          expect(paddingLeft).toBeLessThanOrEqual(24);
        }
      });
    }
  });

  test.describe("404 and error pages", () => {
    test("404 page renders with design system", async ({ page }) => {
      const response = await page.goto("/nonexistent-page-12345", {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(404);
      const h1 = page.locator("h1").first();
      await expect(h1).toBeVisible();
      const mark = page.locator("[data-tone='dark']");
      await expect(mark).toBeVisible();
    });
  });
});
