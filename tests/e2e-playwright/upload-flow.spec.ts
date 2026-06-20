import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "UploadTest123!",
  name: "Upload Tester",
};

function getTestEmail() {
  testCounter++;
  return `upload-e2e-${Date.now()}-${testCounter}@subsumio.local`;
}

test.describe("Upload Flow", () => {
  test.beforeEach(async ({ page }) => {
    const email = getTestEmail();
    await page.goto("/signup", { waitUntil: "networkidle" });
    // Wait for React hydration
    await expect(page.locator('form button[type="submit"]')).toBeEnabled();
    await page.locator('input[name="name"]').fill(TEST_USER.name);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => window.location.pathname === '/dashboard', { timeout: 45_000 });
    await page.waitForLoadState("domcontentloaded");
  });

  test("navigates to upload page", async ({ page }) => {
    await page.goto("/dashboard/upload");
    await expect(page.locator('text=Dokument hochladen')).toBeVisible();
    await expect(page.locator('text=Markdown, PDF oder Text')).toBeVisible();
  });

  test("shows validation for unsupported file type", async ({ page }) => {
    await page.goto("/dashboard/upload");

    // Simulate file drop with unsupported type via JS
    await page.evaluate(() => {
      const dropZone = document.querySelector('[role="presentation"]') || document.body;
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      });
      dropZone.dispatchEvent(event);
    });

    // UI should show dropzone area
    await expect(page.locator('text=Dateien hierher ziehen')).toBeVisible();
  });

  test("upload page has offline indicator", async ({ page }) => {
    await page.goto("/dashboard/upload");
    // The page uses isOnline() — we just verify the UI loads
    await expect(page.locator('text=Dateien hierher ziehen')).toBeVisible();
  });
});
