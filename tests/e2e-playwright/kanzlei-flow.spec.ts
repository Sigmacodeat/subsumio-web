import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "TestPass123!",
  name: "E2E Tester",
};

function getTestEmail() {
  testCounter++;
  return `e2e-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page, email: string) {
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "en",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find(
    (cookie) => cookie.name === "sb_csrf"
  )?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
}

test.describe("Kanzlei-OS E2E Flow", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await signUpViaApi(page, email);
  });

  test("case creation form renders", async ({ page }) => {
    await page.goto("/dashboard/cases/new", { waitUntil: "domcontentloaded" });
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('input[name="caseNumber"]')).toBeVisible();
    await expect(page.locator('textarea[name="facts"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("drafting and compliance flow", async ({ page }) => {
    // 1. Drafting
    await page.goto("/dashboard/drafting");
    await expect(page.getByRole("button", { name: "Klage", exact: true })).toBeVisible();
    await page
      .locator('input[aria-label="z.B. Vertragsbruch Muster GmbH"]')
      .fill("E2E Drafting Test");
    await page.locator('input[placeholder="Name"]').first().fill("Kläger E2E");
    await page.fill('textarea[placeholder*="Sachverhalt"]', "Test-Sachverhalt für Drafting.");
    await page.click('button:has-text("generieren")');
    await page.waitForTimeout(3000);

    // 2. Compliance checklist
    await page.goto("/dashboard/compliance", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: "DSGVO" })).toBeVisible();
    const legalBasisCheck = page.getByRole("button", { name: /Rechtsgrundlage/i }).first();
    await expect(legalBasisCheck).toBeVisible({ timeout: 15_000 });
    await legalBasisCheck.click();
    await expect(page.locator("text=OK").first()).toBeVisible();
    // Verify tab switching
    await page.getByRole("tab", { name: "GwG" }).click();
    await expect(page.getByRole("tab", { name: "GoBD" })).toBeVisible();

    // 3. Calendar export
    await page.goto("/dashboard/calendar-export");
    await expect(page.locator('button:has-text("iCal herunterladen")')).toBeVisible();
  });

  test("RVG fee calculator", async ({ page }) => {
    await page.goto("/dashboard/cost-calculator", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await expect(page.getByRole("heading", { name: /Kostenrechner/i })).toBeVisible();
    await page.locator('input[aria-label="z.B. 15000"]').fill("50000");
    await page.getByRole("button", { name: /Berechnen/i }).click();
    await expect(page.getByRole("heading", { name: /Berechnungsergebnis/i })).toBeVisible();
    await expect(page.getByText(/Geschätztes Honorar/i)).toBeVisible();
  });

  test("AI deadline detection", async ({ page }) => {
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page
      .getByRole("button", { name: /Fristen erkennen|Detect deadlines/i })
      .first()
      .click();
    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("Die Klagefrist endet am 31.12.2026.");
    await page
      .getByRole("button", { name: /Fristen erkennen|Detect deadlines/i })
      .nth(2)
      .click();
    await page.waitForTimeout(2000);
  });

  test("contacts page renders with create form", async ({ page }) => {
    await page.goto("/dashboard/contacts", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Kontakte", exact: true })).toBeVisible();

    // Verify create form is present
    await expect(page.locator('input[placeholder="Name"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="E-Mail"]').first()).toBeVisible();
    await expect(page.locator('input[placeholder="Telefon"]').first()).toBeVisible();
    await expect(page.locator('button:has-text("Anlegen")')).toBeVisible();
  });

  test("data export GDPR", async ({ page }) => {
    await page.goto("/dashboard/data-export");
    await expect(page.getByRole("heading", { name: "Datenexport" })).toBeVisible();
    await expect(page.locator('button:has-text("JSON-Export herunterladen")')).toBeVisible();
  });
});
