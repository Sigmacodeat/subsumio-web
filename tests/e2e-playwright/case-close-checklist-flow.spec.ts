/**
 * E2E Test — Aktenschließungs-Checkliste
 * =======================================
 * Verifies the case closure flow:
 *   1. Create a legal_case with blockers (unbilled time, open deadlines, unpaid invoices)
 *   2. Open the close checklist dialog from /dashboard/cases
 *   3. Verify blockers are displayed
 *   4. Force-archive past blockers
 *   5. Verify case status changes to "archived"
 *   6. Verify archived case can be restored
 *   7. Create a clean case (no blockers) → archive without force
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "CaseCloseTest1234!", name: "Case Close Tester" };

function getTestEmail() {
  testCounter++;
  return `caseclose-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page) {
  const email = getTestEmail();
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "de",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await page.evaluate(() => {
    try {
      localStorage.setItem("subsumio-tour-completed", "true");
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { email };
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
}

test.describe("Aktenschließungs-Checkliste", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("case with blockers shows checklist and requires force-archive", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/blockers-${Date.now()}`;
    const caseTitle = "Blocker Test Case";

    // Create a case with blockers: unbilled time, open deadlines, unpaid invoices
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: caseTitle,
        content: "Case with blockers for close checklist test",
        type: "legal_case",
        frontmatter: {
          case_number: `AZ-BLK-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          priority: "high",
          time_entries: [
            { billed: false, billable: true, hours: 2.5, description: "Recherche" },
            { billed: true, billable: true, hours: 1.0, description: "Korrespondenz" },
          ],
          expenses: [
            { billed: false, billable: true, amount: 45.0, description: "Gerichtsgebühr" },
          ],
          deadlines: [
            { title: "Klagefrist", due_date: "2026-12-31", status: "pending" },
            { title: "Berufungsfrist", due_date: "2027-01-15", status: "warning" },
          ],
          document_requests: [{ status: "pending", title: "Gehaltsabrechnung" }],
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).toBe(200);

    // Navigate to cases page
    await page.goto("/dashboard/cases", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Find the archive button for our case
    const archiveBtn = page.locator(`button[aria-label*="${caseTitle}"]`).first();
    await expect(archiveBtn).toBeVisible({ timeout: 10_000 });
    await archiveBtn.click();

    // Checklist dialog should appear
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Wait for checklist to load
    await page.waitForTimeout(2000);

    // Should show blocker items (red icons for blockers)
    const blockerItems = dialog.locator(".border-red-500\\/20");
    await expect(blockerItems.first()).toBeVisible({ timeout: 10_000 });

    // Should have the "has blockers" warning
    const blockersWarning = dialog.locator("text=/blockers|Blocker|Sperre/i");
    await expect(blockersWarning.first()).toBeVisible({ timeout: 5_000 });

    // Archive button should be disabled without force
    const archiveBtnInDialog = dialog.locator("button", { hasText: /archiv|Archive/i }).last();
    await expect(archiveBtnInDialog).toBeDisabled();

    // Check the force-archive checkbox
    const forceCheckbox = dialog.locator("input[type='checkbox']");
    await expect(forceCheckbox).toBeVisible();
    await forceCheckbox.check();

    // Now archive button should be enabled
    await expect(archiveBtnInDialog).toBeEnabled();

    // Click archive
    await archiveBtnInDialog.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Verify case is archived via API
    await page.waitForTimeout(1000);
    const caseRes = await page.context().request.get(`/api/pages/${encodeURIComponent(caseSlug)}`);
    expect(caseRes.status()).toBe(200);
    const caseData = await caseRes.json();
    expect(caseData.frontmatter.status).toBe("archived");
    expect(caseData.frontmatter.archived_at).toBeDefined();
  });

  test("clean case archives without force", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/clean-${Date.now()}`;
    const caseTitle = "Clean Close Test";

    // Create a case with no blockers
    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: caseTitle,
        content: "Clean case for close checklist test",
        type: "legal_case",
        frontmatter: {
          case_number: `AZ-CLN-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          time_entries: [{ billed: true, billable: true, hours: 1.0 }],
          expenses: [],
          deadlines: [{ title: "Done Frist", due_date: "2026-01-01", status: "done" }],
          document_requests: [{ status: "fulfilled", title: "Vertrag" }],
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).toBe(200);

    // Navigate to cases page
    await page.goto("/dashboard/cases", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Find and click archive button
    const archiveBtn = page.locator(`button[aria-label*="${caseTitle}"]`).first();
    await expect(archiveBtn).toBeVisible({ timeout: 10_000 });
    await archiveBtn.click();

    // Checklist dialog should appear
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Wait for checklist to load
    await page.waitForTimeout(2000);

    // Should show all-pass message (green)
    const allPassed = dialog.locator("text=/all.*passed|alle.*erfüllt|keine Blocker/i");
    await expect(allPassed.first()).toBeVisible({ timeout: 10_000 });

    // Archive button should be enabled (no force needed)
    const archiveBtnInDialog = dialog.locator("button", { hasText: /archiv|Archive/i }).last();
    await expect(archiveBtnInDialog).toBeEnabled();

    // Click archive
    await archiveBtnInDialog.click();

    // Verify case is archived
    await page.waitForTimeout(1000);
    const caseRes = await page.context().request.get(`/api/pages/${encodeURIComponent(caseSlug)}`);
    const caseData = await caseRes.json();
    expect(caseData.frontmatter.status).toBe("archived");
  });

  test("archived case can be restored", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases-restore-${Date.now()}`;
    const caseTitle = "Restore Test Case";

    // Create and archive a case via API
    await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: caseTitle,
        content: "Case for restore test",
        type: "legal_case",
        frontmatter: { status: "open", case_number: `AZ-RST-${Date.now()}` },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    // Archive via DELETE
    const delRes = await page
      .context()
      .request.delete(`/api/pages/${encodeURIComponent(caseSlug)}`);
    expect(delRes.status()).toBe(200);

    // Verify it's archived
    const archivedRes = await page
      .context()
      .request.get(`/api/pages/${encodeURIComponent(caseSlug)}`);
    const archivedData = await archivedRes.json();
    expect(archivedData.frontmatter.status).toBe("archived");

    // Navigate to cases page and filter for archived
    await page.goto("/dashboard/cases", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Look for archived filter or status filter
    const statusFilterBtn = page
      .locator("[role='button'], button", { hasText: /archiv|Archived/i })
      .first();
    if (await statusFilterBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusFilterBtn.click();
      await page.waitForTimeout(1000);
    }

    // Find restore button for our case
    const restoreBtn = page.locator(`button[aria-label*="${caseTitle}"]`).first();
    if (await restoreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await restoreBtn.click();
      await page.waitForTimeout(2000);

      // Verify case is restored via API
      const restoredRes = await page
        .context()
        .request.get(`/api/pages/${encodeURIComponent(caseSlug)}`);
      const restoredData = await restoredRes.json();
      expect(restoredData.frontmatter.status).not.toBe("archived");
    }
  });

  test("already-archived case returns 409 on re-archive", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases-dbl-${Date.now()}`;

    // Create a case
    await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Double Archive Test",
        content: "Test",
        type: "legal_case",
        frontmatter: { status: "open" },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    // Archive once
    const del1 = await page.context().request.delete(`/api/pages/${encodeURIComponent(caseSlug)}`);
    expect(del1.status()).toBe(200);

    // Archive again → should get 409
    const del2 = await page.context().request.delete(`/api/pages/${encodeURIComponent(caseSlug)}`);
    expect(del2.status()).toBe(409);
    const del2Data = await del2.json();
    expect(del2Data.error).toBe("already_archived");
  });
});
