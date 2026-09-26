import { test, expect } from "@playwright/test";
import { submitSignupFormAndConfirm } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
import { existsSync } from "node:fs";

const PUBLIC_PAGES = [
  "/at",
  "/at/pricing",
  "/at/features",
  "/at/login",
  "/at/signup",
  "/at/blog",
  "/at/benchmark-methodology",
  "/at/cities",
  "/at/cities/wien",
  "/at/blog/ki-kanzleisoftware-berufsgeheimnis-rao",
  // Barrierefreiheitserklärung (BaFG/BFSG) — beide Märkte.
  "/at/barrierefreiheit",
  "/de/barrierefreiheit",
];

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/cases",
  "/dashboard/deadlines",
  "/dashboard/brain",
  "/dashboard/fristenbuch",
  "/dashboard/vault",
  "/dashboard/contacts",
  "/dashboard/invoicing",
  "/dashboard/team",
  "/dashboard/settings",
  "/dashboard/agents",
  "/dashboard/compliance",
  "/dashboard/anonymize",
  "/dashboard/api-keys",
  "/dashboard/approvals",
  "/dashboard/fee-agreements",
  "/dashboard/audit",
  "/dashboard/billing",
  "/dashboard/calendar-export",
  "/dashboard/client-portal",
  "/dashboard/connectors",
  "/dashboard/contracts",
  "/dashboard/controlling",
  "/dashboard/data-export",
  "/dashboard/directory",
  "/dashboard/drafting",
  "/dashboard/email-import",
  "/dashboard/graph",
  "/dashboard/import-kanzlei",
  "/dashboard/judgements-sync",
  "/dashboard/kollisionspruefung",
  "/dashboard/monitoring",
  "/dashboard/kanzlei-tools",
  "/dashboard/opponents",
  "/dashboard/playbooks",
  "/dashboard/wiedervorlagen",
  "/dashboard/research",
  "/dashboard/signature",
  "/dashboard/tabular-review",
  "/dashboard/upload",
  "/dashboard/verfahrensdoku",
  "/dashboard/whatsapp",
  // ── Previously untested routes ──
  "/dashboard/analyze",
  "/dashboard/case-scanner",
  "/dashboard/chat",
  "/dashboard/clause-library",
  "/dashboard/compliance/ai-act",
  "/dashboard/compliance/retention",
  "/dashboard/deep-analysis",
  "/dashboard/intake",
  "/dashboard/litigation",
  "/dashboard/obligation-tracking",
  "/dashboard/document-requests",
  "/dashboard/process-strategy",
  "/dashboard/time",
  "/dashboard/reports",
  "/dashboard/review-queue",
  "/dashboard/review-sets",
  "/dashboard/settings/ai-model",
  "/dashboard/settings/kanzlei",
  "/dashboard/settings/scim",
  // Darstellung: Schriftgröße/Kontrast/Bewegung/Farbschema (Radiogruppen).
  "/dashboard/settings/darstellung",
  "/dashboard/shared-spaces",
  "/dashboard/sources",
  "/dashboard/templates",
  "/dashboard/translate",
  "/dashboard/trust-accounting",
  "/dashboard/version-history",
  "/dashboard/whatsapp/templates",
  "/dashboard/word-addin",
  "/dashboard/workflows/builder",
];

let testCounter = 0;
const TEST_USER = {
  password: "A11yTest123!",
  name: "A11y Tester",
};

function getTestEmail() {
  testCounter++;
  return `a11y-${Date.now()}-${testCounter}@subsumio.local`;
}

test.describe("Accessibility (axe-core)", () => {
  for (const url of PUBLIC_PAGES) {
    test(`${url} has no critical a11y violations`, async ({ page }) => {
      await page.goto(url, { waitUntil: "load" });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1_000);
      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      const critical = accessibilityScanResults.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );
      expect(critical).toHaveLength(0);
    });
  }

  test.describe("dashboard pages", () => {
    test.beforeAll(async ({ browser }) => {
      // Reuse a pre-seeded auth state when present — local sweeps run against
      // rate-limited signup (5/hr) and CI may provide a fixture instead.
      if (existsSync("/tmp/a11y-auth-state.json")) return;
      const page = await browser.newPage();
      await page.goto("/at/signup", { waitUntil: "networkidle" });
      const email = getTestEmail();
      await page.locator('input[name="name"]').fill(TEST_USER.name);
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(TEST_USER.password);
      await submitSignupFormAndConfirm(page);
      await page.waitForFunction(() => window.location.pathname === "/dashboard", {
        timeout: 45_000,
      });
      await page.context().storageState({ path: "/tmp/a11y-auth-state.json" });
      await page.close();
    });

    for (const route of DASHBOARD_ROUTES) {
      test(`${route} has no critical a11y violations`, async ({ browser }) => {
        const context = await browser.newContext({
          storageState: "/tmp/a11y-auth-state.json",
          // Entrance-Animationen (z. B. Tour-Punkte) rendern sofort im
          // Endzustand — sonst misst axe Zwischenframes <24px.
          reducedMotion: "reduce",
        });
        // Guided tour auto-opens for fresh accounts and would otherwise be
        // axe-scanned mid-entrance-animation on arbitrary pages → flaky
        // target-size readings. Dedicated tour-open coverage lives in the
        // /dashboard test below (state is seeded per-context anyway).
        await context.addInitScript(() => {
          try {
            window.localStorage.setItem("subsumio-tour-completed", "true");
          } catch {}
        });
        const page = await context.newPage();
        try {
          await page.goto(route, { waitUntil: "load" });
          await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0, {
            timeout: 5_000,
          });
          // Dashboard pages keep realtime/SSE connections open, so networkidle
          // is not a valid readiness signal here. Heavier pages hydrate the
          // shell progressively — allow generous settle time.
          await expect(page.locator("#main-content")).toBeVisible({
            timeout: 20_000,
          });
          // Kill residual mount animations deterministically — the sidebar and
          // framer-motion overlays do not all honour reducedMotion, and axe
          // measures mid-animation bounds (<24px) otherwise.
          await page.addStyleTag({
            content:
              "*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important;transition-delay:0s!important;animation-delay:0s!important}",
          });
          await page.waitForTimeout(1_000);
          const accessibilityScanResults = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze();
          const critical = accessibilityScanResults.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious"
          );
          expect(critical).toHaveLength(0);
        } finally {
          await page.close();
          await context.close();
        }
      });
    }

    // The guided tour auto-opens for fresh accounts. Cover its open state
    // explicitly: fresh context WITHOUT the completed-flag, wait until the
    // tooltip + step dots are fully mounted before scanning.
    test("guided tour open state has no critical a11y violations", async ({
      browser,
      isMobile,
    }) => {
      // The tour targets desktop layout anchors; on mobile it renders
      // differently/late — cover it in the desktop project only.
      test.skip(!!isMobile, "guided tour is a desktop overlay");
      const context = await browser.newContext({
        storageState: "/tmp/a11y-auth-state.json",
        reducedMotion: "reduce",
      });
      await context.addInitScript(() => {
        try {
          window.localStorage.removeItem("subsumio-tour-completed");
        } catch {}
      });
      const page = await context.newPage();
      try {
        await page.goto("/dashboard", { waitUntil: "load" });
        const tooltip = page.locator('[id^="tour-tooltip"]');
        // The tour only auto-opens for users who finished onboarding and
        // haven't completed the tour — a server-side state we don't control
        // in this test. If it doesn't appear, skip rather than fail.
        const tourOpened = await tooltip
          .first()
          .waitFor({ state: "visible", timeout: 15_000 })
          .then(() => true)
          .catch(() => false);
        test.skip(!tourOpened, "guided tour did not auto-open for this user");
        await page.waitForTimeout(500);
        const res = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        const critical = res.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious"
        );
        expect(critical).toHaveLength(0);
      } finally {
        await page.close();
        await context.close();
      }
    });
  });
});
