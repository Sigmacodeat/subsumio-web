/**
 * E2E CLM flow tests against the current contract-management UI.
 * The mock engine keeps document generation deterministic and external-service free.
 */

import { test, expect, type Page } from "@playwright/test";

let testCounter = 0;

async function signUpViaApi(page: Page) {
  const email = `clm-${Date.now()}-${++testCounter}@subsumio.local`;
  const signup = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: "CLM Tester",
      password: "CLMTest1234!",
      locale: "en",
      industry: "legal",
    },
  });
  expect(signup.status()).toBe(201);

  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "sb_csrf")?.value;
  const onboarding = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrf ? { "x-csrf-token": csrf } : {},
  });
  expect(onboarding.status()).toBe(200);
}

async function createContract(page: Page, title: string) {
  await page.goto("/dashboard/contracts", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /contract intelligence/i })).toBeVisible({
    timeout: 10_000,
  });
  const createButton = page.getByRole("button", { name: /vertrag anlegen|create contract/i });
  await expect(createButton).toBeEnabled();
  await createButton.click();

  const dialog = page.getByRole("dialog", { name: /quick create contract|vertrag anlegen/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/title|titel|bezeichnung/i).fill(title);
  await dialog.getByLabel(/parties|parteien/i).fill("Party A — Party B");
  await dialog
    .getByLabel(/contract text|content|inhalt|vertragstext/i)
    .fill("Party A provides legal services to Party B. Payment is due within 30 days.");
  await dialog.getByRole("button", { name: /save|speichern/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

test.describe("CLM flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
    // Mark tour as completed to prevent the guided tour overlay from blocking interactions
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      try {
        localStorage.setItem("subsumio-tour-completed", "true");
      } catch {}
    });
    // Reload to apply the localStorage change
    await page.reload({ waitUntil: "domcontentloaded" });
    // Dismiss any tour that might have started before localStorage was set
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    // Click any remaining overlay to dismiss it
    const overlay = page.locator('[aria-hidden="true"].fixed.inset-0.z-\\[100\\]');
    if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
      await overlay.click();
    }
  });

  test("creates a contract through the intake dialog", async ({ page }) => {
    await createContract(page, `CLM Intake ${Date.now()}`);
  });

  test("generates a legal draft with the configured engine", async ({ page }) => {
    await page.goto("/dashboard/drafting", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /legal document generator/i })).toBeVisible();
    await page.locator('input[name="title"]').fill("Service dispute");
    await page.locator('input[name="legalBasis"]').fill("§ 611 BGB");
    await page.locator('input[name="klaeger"]').fill("Party A");
    await page.locator('input[name="beklagter"]').fill("Party B");
    await page
      .locator('textarea[name="facts"]')
      .fill("Party A performed the agreed services, but Party B did not pay.");

    const generate = page.getByRole("button", { name: /lawsuit generate|klage generieren/i });
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(page.getByText("KI-generiert · zu prüfen", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /copy|kopieren/i })).toBeVisible();
  });

  test("moves a contract to approved and opens redline review", async ({ page }) => {
    const title = `CLM Lifecycle ${Date.now()}`;
    await createContract(page, title);

    const titleNode = page.getByText(title, { exact: true });
    const card = titleNode.locator("xpath=ancestor::div[.//button[@title='Redline']][1]");
    await card.getByTitle(/edit|bearbeiten/i).click();
    const editor = page
      .getByText("Vertrag bearbeiten", { exact: true })
      .locator("xpath=ancestor::div[.//select][1]");
    await editor.locator("select").selectOption("approved");
    await editor.getByRole("button", { name: /save|speichern/i }).click();

    const updatedCard = page
      .getByText(title, { exact: true })
      .locator("xpath=ancestor::div[.//button[@title='Redline']][1]");
    await expect(updatedCard.getByText(/approved|freigegeben/i)).toBeVisible();

    await updatedCard.getByTitle("Redline").click();
    await expect(page.getByText("Contract Redline", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /redline starten|start redline/i })
    ).toBeVisible();
  });

  test("exposes obligation and deadline workflow entry points", async ({ page }) => {
    await page.goto("/dashboard/contracts", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: /obligation tracking/i })).toBeVisible();
    await page.getByRole("link", { name: /obligation tracking/i }).click({ force: true });
    await expect(page).toHaveURL(/\/dashboard\/obligation-tracking/);
    await expect(page.getByRole("heading", { name: /obligation|verpflichtung/i })).toBeVisible();

    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /deadline|frist/i })).toBeVisible();
  });
});
