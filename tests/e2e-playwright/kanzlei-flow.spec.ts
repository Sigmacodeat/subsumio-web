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
  // Dismiss guided tour before any navigation — the SVG spotlight overlay
  // intercepts pointer events on every button click otherwise.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("subsumio-tour-completed", "true");
    } catch {}
  });
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      acceptTerms: true,
      acceptDpa: true,
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "de",
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
    // Step 0: title + caseNumber + Weiter button (scoped to form to avoid
    // matching the guided-tour overlay's "Weiter" button)
    const form = page.locator("form").first();
    await expect(form.locator('input[name="title"]')).toBeVisible({ timeout: 15_000 });
    await expect(form.locator('input[name="caseNumber"]')).toBeVisible({ timeout: 15_000 });
    // Verify the "Weiter" (Next) button exists for step navigation
    const nextBtn = form.getByRole("button", { name: /Weiter|Next/i }).first();
    await expect(nextBtn).toBeVisible({ timeout: 5_000 });
    // Fill title and verify button becomes enabled
    await form.locator('input[name="title"]').fill("E2E Test Case");
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
    // Advance to step 1
    await nextBtn.click();
    await page.waitForTimeout(2000);
    // Step 1 should render — verify a "Zurück" (Back) button appears
    const backBtn = form.getByRole("button", { name: /Zurück|Back/i }).first();
    await expect(backBtn).toBeVisible({ timeout: 15_000 });
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
    await page.getByRole("tab", { name: "Geldwäscheprävention" }).click();
    await expect(page.getByRole("tab", { name: "Buchführung" })).toBeVisible();

    // 3. Calendar export
    await page.goto("/dashboard/calendar-export");
    await expect(page.locator('button:has-text("iCal herunterladen")')).toBeVisible();
  });

  test("AI deadline detection", async ({ page }) => {
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page
      .getByRole("button", { name: /Fristen erkennen|Detect deadlines/i })
      .first()
      .click();
    await expect(page.getByRole("main").locator("textarea").first()).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByRole("main")
      .locator("textarea")
      .first()
      .fill("Die Klagefrist endet am 31.12.2026.");
    await page
      .getByRole("button", { name: /Fristen erkennen|Detect deadlines/i })
      .nth(2)
      .click();
    await page.waitForTimeout(2000);
  });

  test("contacts page renders with create form", async ({ page }) => {
    await page.goto("/dashboard/contacts", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Kontakte", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Click "New Contact" button to open the create dialog
    await page
      .getByRole("button", { name: /Anlegen|New Contact|Neuer Kontakt/i })
      .first()
      .click();
    const dialog = page.locator("[role='dialog']").filter({ visible: true }).first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Verify create form is present inside the dialog
    await expect(dialog.locator('input[placeholder="Name"]').first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog.locator('input[placeholder="E-Mail"]').first()).toBeVisible();
    await expect(dialog.locator('input[placeholder="Telefon"]').first()).toBeVisible();
    await expect(dialog.locator('button:has-text("Anlegen")')).toBeVisible();
  });

  test("data export GDPR", async ({ page }) => {
    await page.goto("/dashboard/data-export");
    await expect(page.getByRole("heading", { name: /Daten-?Export/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('button:has-text("JSON-Export herunterladen")')).toBeVisible();
  });
});
