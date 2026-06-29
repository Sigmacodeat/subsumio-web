import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PUBLIC_PAGES = ["/", "/de", "/pricing", "/features", "/login", "/signup"];

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/cases",
  "/dashboard/deadlines",
  "/dashboard/brain",
  "/dashboard/query",
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
  "/dashboard/assistant",
  "/dashboard/audit",
  "/dashboard/bea",
  "/dashboard/billing",
  "/dashboard/calendar-export",
  "/dashboard/client-portal",
  "/dashboard/connectors",
  "/dashboard/contracts",
  "/dashboard/controlling",
  "/dashboard/cost-calculator",
  "/dashboard/data-export",
  "/dashboard/datev-export",
  "/dashboard/drafting",
  "/dashboard/email-import",
  "/dashboard/graph",
  "/dashboard/import-kanzlei",
  "/dashboard/judgements-sync",
  "/dashboard/kollisionspruefung",
  "/dashboard/mobile",
  "/dashboard/monitoring",
  "/dashboard/norms",
  "/dashboard/opponents",
  "/dashboard/playbooks",
  "/dashboard/rag-eval",
  "/dashboard/rechtsprechung",
  "/dashboard/research",
  "/dashboard/signature",
  "/dashboard/tabular-review",
  "/dashboard/upload",
  "/dashboard/verfahrensdoku",
  "/dashboard/whatsapp",
  // ── Previously untested routes ──
  "/dashboard/adoption-analytics",
  "/dashboard/analytics",
  "/dashboard/analyze",
  "/dashboard/case-scanner",
  "/dashboard/chat",
  "/dashboard/chat/analytics",
  "/dashboard/chat/compare",
  "/dashboard/clause-library",
  "/dashboard/compliance/ai-act",
  "/dashboard/compliance/retention",
  "/dashboard/deep-analysis",
  "/dashboard/experience",
  "/dashboard/intake",
  "/dashboard/litigation",
  "/dashboard/litigation-analytics",
  "/dashboard/mobile/pipeline",
  "/dashboard/monitoring/engine",
  "/dashboard/obligation-tracking",
  "/dashboard/portfolio-insights",
  "/dashboard/precedent-search",
  "/dashboard/process-strategy",
  "/dashboard/rechtsprechung/analytics",
  "/dashboard/reports",
  "/dashboard/review-queue",
  "/dashboard/review-sets",
  "/dashboard/settings/ai-model",
  "/dashboard/settings/kanzlei",
  "/dashboard/settings/scim",
  "/dashboard/shared-spaces",
  "/dashboard/sources",
  "/dashboard/tax-assessments",
  "/dashboard/tax-audit",
  "/dashboard/tax-deadlines",
  "/dashboard/tax-returns",
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
      // Create a shared authenticated context
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
      await page.context().storageState({ path: "/tmp/a11y-auth-state.json" });
      await page.close();
    });

    for (const route of DASHBOARD_ROUTES) {
      test(`${route} has no critical a11y violations`, async ({ browser }) => {
        const context = await browser.newContext({
          storageState: "/tmp/a11y-auth-state.json",
        });
        const page = await context.newPage();
        try {
          await page.goto(route, { waitUntil: "load" });
          await expect(page.locator('meta[http-equiv="refresh"]')).toHaveCount(0, {
            timeout: 5_000,
          });
          // Dashboard pages keep realtime/SSE connections open, so networkidle
          // is not a valid readiness signal here.
          await expect(page.locator("#main-content")).toBeVisible();
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
  });
});
