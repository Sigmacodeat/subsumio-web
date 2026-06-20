import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "TestPass123!",
  name: "E2E Tester",
};

function getTestEmail() {
  testCounter++;
  return `e2e-${Date.now()}-${testCounter}@sigmabrain.local`;
}

test.describe("Kanzlei-OS E2E Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Signup
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

  test("case creation form renders", async ({ page }) => {
    await page.goto("/dashboard/cases/new");
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('input[name="caseNumber"]')).toBeVisible();
    await expect(page.locator('textarea[name="facts"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("drafting and compliance flow", async ({ page }) => {
    // 1. Drafting
    await page.goto("/dashboard/drafting");
    await expect(page.getByRole('button', { name: 'Klage', exact: true })).toBeVisible();
    await page.locator('input[aria-label="z.B. Vertragsbruch Muster GmbH"]').fill("E2E Drafting Test");
    await page.locator('input[placeholder="Name"]').first().fill("Kläger E2E");
    await page.fill('textarea[placeholder*="Sachverhalt"]', "Test-Sachverhalt für Drafting.");
    await page.click('button:has-text("generieren")');
    await page.waitForTimeout(3000);

    // 2. Compliance checklist
    await page.goto("/dashboard/compliance", { waitUntil: "networkidle" });
    await expect(page.getByRole('tab', { name: 'DSGVO' })).toBeVisible();
    await expect(page.locator('button[aria-label*="Rechtsgrundlage"]')).toBeVisible({ timeout: 15_000 });
    await page.locator('button[aria-label*="Rechtsgrundlage"]').click();
    await expect(page.locator('text=OK').first()).toBeVisible();
    // Verify tab switching
    await page.getByRole('tab', { name: 'GwG' }).click();
    await expect(page.getByRole('tab', { name: 'GoBD' })).toBeVisible();

    // 3. Calendar export
    await page.goto("/dashboard/calendar-export");
    await expect(page.locator('button:has-text("iCal herunterladen")')).toBeVisible();
  });

  test("RVG fee calculator", async ({ page }) => {
    await page.goto("/dashboard/invoicing", { waitUntil: "networkidle" });
    await page.click('button:has-text("Create invoice"), button:has-text("Rechnung erstellen")');
    await page.click('button:has-text("Calculate RVG"), button:has-text("RVG berechnen")');
    await expect(page.getByRole('heading', { name: /RVG/i })).toBeVisible();
    await page.fill('input[placeholder="z. B. 10000"]', "50000");
    await expect(page.locator('text=785.00').first()).toBeVisible();
  });

  test("AI deadline detection", async ({ page }) => {
    await page.goto("/dashboard/deadlines", { waitUntil: "networkidle" });
    await page.click('button:has-text("Detect deadlines"), button:has-text("Fristen erkennen")');
    await expect(page.locator('textarea')).toBeVisible();
    await page.locator('textarea').fill("Die Klagefrist endet am 31.12.2026.");
    await page.click('button:has-text("Detect deadlines"), button:has-text("Fristen erkennen")');
    await page.waitForTimeout(2000);
  });

  test("contacts page renders with create form", async ({ page }) => {
    await page.goto("/dashboard/contacts", { waitUntil: "networkidle" });
    await expect(page.getByRole('heading', { name: 'Kontakte', exact: true })).toBeVisible();

    // Verify create form is present
    await expect(page.locator('input[placeholder="Name"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="E-Mail"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="Telefon"]').first()).toBeVisible();
    await expect(page.locator('button:has-text("Anlegen")')).toBeVisible();
  });

  test("data export GDPR", async ({ page }) => {
    await page.goto("/dashboard/data-export");
    await expect(page.getByRole('heading', { name: 'Datenexport' })).toBeVisible();
    await expect(page.locator('button:has-text("JSON-Export herunterladen")')).toBeVisible();
  });
});
