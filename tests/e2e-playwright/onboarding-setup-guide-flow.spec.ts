/**
 * E2E Onboarding Setup Guide Flow Tests
 * ======================================
 * Tests the automatic progress tracking through real lawyer workflows:
 *   1. Signup → onboarding completed → progress 0%
 *   2. Create case → firstCase true
 *   3. Create deadline → firstDeadline true
 *   4. Open Dashboard Guide → progress visible
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "SetupGuide1234!",
  name: "Setup Guide Tester",
};

function getTestEmail() {
  testCounter++;
  return `setupguide-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page) {
  const email = getTestEmail();
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
  return email;
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((cookie) => cookie.name === "sb_csrf")?.value ?? null;
}

async function getOnboardingProgress(page: import("@playwright/test").Page) {
  const res = await page.context().request.get("/api/onboarding");
  expect(res.status()).toBe(200);
  return await res.json();
}

async function waitForProgress(
  page: import("@playwright/test").Page,
  key: "firm" | "firstCase" | "firstDeadline" | "teamInvited" | "firstQuery",
  timeout = 10_000
) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const data = await getOnboardingProgress(page);
    if (data?.progress?.[key] === true) return data;
    await page.waitForTimeout(250);
  }
  throw new Error(`Timeout waiting for onboarding progress ${key}`);
}

test.describe("Onboarding Setup Guide Flow", () => {
  test("full setup guide progress: 0% → case → deadline", async ({ page }) => {
    await signUpViaApi(page);
    await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });

    const csrfToken = await getCsrfToken(page);

    // Complete onboarding wizard
    const onboardRes = await page.context().request.post("/api/onboarding", {
      data: { industry: "legal" },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(onboardRes.status()).toBe(200);

    // Initial progress should be 0%
    const initial = await getOnboardingProgress(page);
    expect(initial.progress).toEqual({
      firm: false,
      firstCase: false,
      firstDeadline: false,
      teamInvited: false,
      firstQuery: false,
    });

    // Create first case
    const caseRes = await page.context().request.post("/api/pages", {
      data: {
        slug: `setup-case-${Date.now()}`,
        title: "Setup Guide Test Case",
        type: "legal_case",
        content: "Sachverhalt: Testfall.",
        frontmatter: {
          case_number: `SG-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          priority: "high",
        },
      },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(caseRes.status()).toBe(200);
    const afterCase = await waitForProgress(page, "firstCase");
    expect(afterCase.progress.firstCase).toBe(true);
    expect(afterCase.progress.firstDeadline).toBe(false);

    // Create first deadline
    const deadlineRes = await page.context().request.post("/api/pages", {
      data: {
        slug: `setup-deadline-${Date.now()}`,
        title: "Setup Guide Test Deadline",
        type: "legal_deadline",
        content: "Frist: Test.",
        frontmatter: {
          due_date: new Date().toISOString().split("T")[0],
          status: "pending",
          source: "manual",
        },
      },
      headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
    });
    expect(deadlineRes.status()).toBe(200);
    const afterDeadline = await waitForProgress(page, "firstDeadline");
    expect(afterDeadline.progress.firstDeadline).toBe(true);

    // Dashboard renders and guide is reachable
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.locator("nav, header, [role='navigation']").first()).toBeVisible({
      timeout: 10_000,
    });

    // Open guide (help button in topbar — aria-label "Hilfe" or similar)
    const helpButton = page.locator('button[aria-label*="Hilfe"], button[aria-label*="Help"]').first();
    if (await helpButton.isVisible().catch(() => false)) {
      await helpButton.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    }
  });
});
