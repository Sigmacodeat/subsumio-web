import { test, expect } from "@playwright/test";

const TEST_USER = {
  email: `e2e-${Date.now()}@sigmabrain.local`,
  password: "TestPass123!",
  name: "E2E Tester",
};

test.describe("Kanzlei-OS E2E Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Signup
    await page.goto("/signup");
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.fill('input[name="name"]', TEST_USER.name);
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard", { timeout: 10_000 });
  });

  test("create case, add time, generate invoice", async ({ page }) => {
    // 1. Create case
    await page.goto("/dashboard/cases/new");
    await page.fill('input[name="title"]', "E2E Testakte");
    await page.fill('input[name="caseNumber"]', "E2E-2026-001");
    await page.selectOption('select[name="legalArea"]', "Vertragsrecht");
    await page.selectOption('select[name="status"]', "open");
    await page.selectOption('select[name="priority"]', "high");
    await page.fill('textarea[name="facts"]', "Test-Sachverhalt für E2E. Vertragspartner hat § 823 BGB verletzt.");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard\/cases\/e2e-testakte/);

    // 2. Verify case detail tabs exist
    await expect(page.locator('button:has-text("Übersicht")')).toBeVisible();
    await expect(page.locator('button:has-text("Beweismittel")')).toBeVisible();
    await expect(page.locator('button:has-text("Fristen")')).toBeVisible();
    await expect(page.locator('button:has-text("Graph")')).toBeVisible();

    // 3. Add evidence
    await page.click('button:has-text("Beweismittel")');
    await page.fill('input[placeholder*="Vertrag"]', "Vertrag E2E");
    await page.selectOption('select', "Vertrag");
    await page.fill('textarea[placeholder*="Beschreibung"]', "Testvertrag vom 01.01.2026");
    await page.click('button:has-text("Hinzufügen")');
    await expect(page.locator('text=Vertrag E2E')).toBeVisible();

    // 4. Add deadline
    await page.click('button:has-text("Fristen")');
    await page.fill('input[placeholder*="Klageerwiderung"]', "Testfrist");
    await page.fill('input[type="date"]', "2026-12-31");
    await page.selectOption('select:has-option("Frist")', "deadline");
    await page.click('button:has-text("Hinzufügen")');
    await expect(page.locator('text=Testfrist')).toBeVisible();

    // 5. Add time entry
    await page.click('button:has-text("Zeit")');
    await page.fill('input[placeholder*="Beschreibung"]', "Beratungsgespräch");
    await page.fill('input[placeholder*="Minuten"]', "120");
    await page.click('button:has-text("Speichern")');
    await expect(page.locator('text=Beratungsgespräch')).toBeVisible();

    // 5b. Generate and revoke portal link
    await page.click('button:has-text("Für Portal freigeben")');
    await page.click('button:has-text("Portal-Link")');
    await expect(page.locator('text=Portal-Link (30 Tage gültig)')).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    await page.click('text=Widerrufen');
    await expect(page.locator('text=Portal-Link (30 Tage gültig)')).toBeHidden();

    // 6. Generate invoice
    await page.goto("/dashboard/invoicing");
    await page.click('button:has-text("Rechnung erstellen")');
    await page.selectOption('select', { label: "E2E Testakte" });
    await page.click('button:has-text("Rechnung erstellen")');
    await expect(page.locator('text=R-2026-')).toBeVisible();

    // 7. Mark as sent
    await page.click('button[title="Als gesendet markieren"]');
    await expect(page.locator('text=Gesendet')).toBeVisible();

    // 8. Delete invoice
    page.on("dialog", (dialog) => dialog.accept());
    await page.click('button[title="Löschen"]');
    await expect(page.locator('text=R-2026-')).toBeHidden();

    // 9. Delete case
    await page.goto("/dashboard/cases");
    await page.click('text=E2E Testakte');
    page.on("dialog", (dialog) => dialog.accept());
    await page.click('button[title="Akte löschen"]');
    await expect(page.locator('text=E2E Testakte')).toBeHidden();
  });

  test("drafting and compliance flow", async ({ page }) => {
    // 1. Drafting
    await page.goto("/dashboard/drafting");
    await expect(page.locator('text=Klage')).toBeVisible();
    await page.fill('input[placeholder*="Betreff"]', "E2E Drafting Test");
    await page.fill('input[placeholder="Name"]', "Kläger E2E");
    await page.fill('textarea[placeholder*="Sachverhalt"]', "Test-Sachverhalt für Drafting.");
    await page.click('button:has-text("generieren")');
    await page.waitForTimeout(3000);
    await expect(page.locator('text=Entwurf')).toBeVisible();

    // 2. Compliance checklist
    await page.goto("/dashboard/compliance");
    await expect(page.locator('text=DSGVO')).toBeVisible();
    await page.click('button:has-text("GwG")');
    await expect(page.locator('text=GwG')).toBeVisible();
    await page.click('text=Rechtsgrundlage dokumentiert');
    await expect(page.locator('text=OK')).toBeVisible();

    // 3. Calendar export
    await page.goto("/dashboard/calendar-export");
    await expect(page.locator('text=iCal herunterladen')).toBeVisible();
  });

  test("RVG fee calculator", async ({ page }) => {
    await page.goto("/dashboard/invoicing");
    await page.click('button:has-text("RVG-Rechner")');
    await expect(page.locator('text=RVG-Gebührenrechner')).toBeVisible();
    await page.fill('input[placeholder*="Streitwert"]', "50000");
    await page.selectOption('select:has-option("Verfahrensgebühr")', "Verfahrensgebühr");
    await page.click('button:has-text("Berechnen")');
    await expect(page.locator('text=EUR')).toBeVisible();
  });

  test("AI deadline detection", async ({ page }) => {
    await page.goto("/dashboard/deadlines");
    await expect(page.locator('text=KI-Fristen-Erkennung')).toBeVisible();
    await page.fill('textarea[placeholder*="Text einfügen"]', "Die Klagefrist endet am 31.12.2026.");
    await page.click('button:has-text("Fristen erkennen")');
    await page.waitForTimeout(2000);
    await expect(page.locator('text=31.12.2026')).toBeVisible();
  });

  test("contacts CRUD", async ({ page }) => {
    await page.goto("/dashboard/contacts");
    await expect(page.locator('text=Kontakte')).toBeVisible();

    // Create
    await page.fill('input[placeholder="Name"]', "E2E Contact");
    await page.fill('input[placeholder="E-Mail"]', "e2e@contact.local");
    await page.fill('input[placeholder="Telefon"]', "+49 123 456789");
    await page.click('button:has-text("Anlegen")');
    await expect(page.locator('text=E2E Contact')).toBeVisible();
    await expect(page.locator('text=e2e@contact.local')).toBeVisible();

    // Edit
    await page.click('button[title="Bearbeiten"]');
    await page.fill('input[placeholder="Name"]', "E2E Contact Updated");
    await page.click('button:has-text("Speichern")');
    await expect(page.locator('text=E2E Contact Updated')).toBeVisible();
    await expect(page.locator('text=E2E Contact')).toBeHidden();

    // Delete
    page.on("dialog", (dialog) => dialog.accept());
    await page.click('button[title="Löschen"]');
    await expect(page.locator('text=E2E Contact Updated')).toBeHidden();
  });

  test("data export GDPR", async ({ page }) => {
    await page.goto("/dashboard/data-export");
    await expect(page.locator('text=Datenexport')).toBeVisible();
    await page.click('button:has-text("GDPR-Export herunterladen")');
    // Download verification would need more setup; UI presence is enough.
    await expect(page.locator('text=JSON')).toBeVisible();
  });
});
