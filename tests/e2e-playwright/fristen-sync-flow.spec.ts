/**
 * E2E Test — Fristen-Sync zwischen 3 UIs
 * ========================================
 * Verifies that deadlines created via the Engine appear consistently across:
 *   1. /dashboard/deadlines  (Deadlines list page)
 *   2. /dashboard/fristenbuch (Fristenbuch page)
 *   3. /api/legal/deadlines.ics (ICS calendar export)
 *
 * Flow:
 *   a) Sign up + onboarding
 *   b) Create a legal_case with deadlines in frontmatter via API
 *   c) Visit /dashboard/deadlines → verify deadline appears
 *   d) Visit /dashboard/fristenbuch → verify same deadline appears
 *   e) GET /api/legal/deadlines.ics → verify VEVENT with matching date
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "FristenTest1234!", name: "Fristen Tester" };

function getTestEmail() {
  testCounter++;
  return `fristen-${Date.now()}-${testCounter}@subsumio.local`;
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
  return { email, csrfToken };
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
}

test.describe("Fristen-Sync zwischen 3 UIs", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("deadline appears in Deadlines, Fristenbuch, and ICS export", async ({ page }) => {
    // ── Step 1: Create a legal_case with a deadline via API ──────────
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/fristen-sync-${Date.now()}`;
    const dueDate = "2026-12-31";
    const deadlineTitle = "Klagefrist Sync-Test";

    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Fristen Sync Testfall",
        content: "Testfall für Fristen-Sync E2E",
        type: "legal_case",
        frontmatter: {
          case_number: `AZ-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          priority: "high",
          deadlines: [
            {
              title: deadlineTitle,
              due_date: dueDate,
              law: "§ 253 ZPO",
              status: "pending",
            },
          ],
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).toBe(200);

    // ── Step 2: Verify deadline appears on /dashboard/deadlines ──────
    await page.goto("/dashboard/deadlines", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // The deadlines page should show our deadline
    const deadlinesTable = page.locator("table, [role='list'], [role='table']");
    await expect(deadlinesTable).toBeVisible({ timeout: 15_000 });

    // Look for the deadline title or due date anywhere on the page
    const deadlineText = page.locator(`text=/${deadlineTitle}|Klagefrist/i`);
    await expect(deadlineText.first()).toBeVisible({ timeout: 15_000 });

    // ── Step 3: Verify same deadline appears on /dashboard/fristenbuch ──
    await page.goto("/dashboard/fristenbuch", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const fristenbuchTable = page.locator("table, [role='list'], [role='table']");
    await expect(fristenbuchTable).toBeVisible({ timeout: 15_000 });

    const fristenbuchText = page.locator(`text=/${deadlineTitle}|Klagefrist/i`);
    await expect(fristenbuchText.first()).toBeVisible({ timeout: 15_000 });

    // ── Step 4: Verify ICS export contains the deadline ──────────────
    const icsRes = await page.context().request.get("/api/legal/deadlines.ics");
    expect(icsRes.status()).toBe(200);
    const contentType = icsRes.headers()["content-type"] || "";
    expect(contentType).toContain("text/calendar");

    const icsBody = await icsRes.text();
    expect(icsBody).toContain("BEGIN:VCALENDAR");
    expect(icsBody).toContain("END:VCALENDAR");
    // The VEVENT should contain our due date (YYYYMMDD format)
    const dueDateICS = dueDate.replace(/-/g, "");
    expect(icsBody).toContain(`DTSTART;VALUE=DATE:${dueDateICS}`);
    // Should contain the deadline title in SUMMARY
    expect(icsBody).toContain("Klagefrist");
  });

  test("fristen API returns consistent data across all 3 endpoints", async ({ page }) => {
    // Create a case with multiple deadlines
    const csrf = await getCsrfToken(page);
    const caseSlug = `cases/fristen-multi-${Date.now()}`;

    const createRes = await page.context().request.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Multi-Fristen Testfall",
        content: "Testfall mit mehreren Fristen",
        type: "legal_case",
        frontmatter: {
          case_number: `AZ-MULTI-${Date.now()}`,
          status: "open",
          deadlines: [
            { title: "Klagefrist", due_date: "2026-12-31", law: "§ 253 ZPO" },
            { title: "Berufungsfrist", due_date: "2027-01-31", law: "§ 517 ZPO" },
            { title: "Revisionsfrist", due_date: "2027-02-28", law: "§ 552 ZPO" },
          ],
        },
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });
    expect(createRes.status()).toBe(200);

    // ── API: /api/legal/fristen ──────────────────────────────────────
    const fristenRes = await page.context().request.get("/api/legal/fristen");
    expect(fristenRes.status()).toBe(200);
    const fristenData = await fristenRes.json();
    expect(fristenData.fristen).toBeDefined();
    expect(Array.isArray(fristenData.fristen)).toBe(true);
    expect(fristenData.zusammenfassung).toBeDefined();
    expect(fristenData.zusammenfassung.gesamt).toBeGreaterThanOrEqual(3);

    // Find our deadlines in the fristen list
    const fristTitles = fristenData.fristen.map((f: { title: string }) => f.title);
    expect(fristTitles).toContain("Klagefrist");
    expect(fristTitles).toContain("Berufungsfrist");
    expect(fristTitles).toContain("Revisionsfrist");

    // ── API: /api/legal/fristenbuch ──────────────────────────────────
    const fristenbuchRes = await page.context().request.get("/api/legal/fristenbuch");
    expect(fristenbuchRes.status()).toBe(200);
    const fristenbuchData = await fristenbuchRes.json();
    expect(fristenbuchData.eintraege).toBeDefined();
    expect(Array.isArray(fristenbuchData.eintraege)).toBe(true);
    expect(fristenbuchData.zusammenfassung).toBeDefined();
    expect(fristenbuchData.zusammenfassung.gesamt).toBeGreaterThanOrEqual(3);

    // ── API: /api/legal/deadlines.ics ────────────────────────────────
    const icsRes = await page.context().request.get("/api/legal/deadlines.ics");
    expect(icsRes.status()).toBe(200);
    const icsBody = await icsRes.text();
    expect(icsBody).toContain("BEGIN:VCALENDAR");

    // All 3 deadlines should appear as VEVENTs
    expect(icsBody).toContain("Klagefrist");
    expect(icsBody).toContain("Berufungsfrist");
    expect(icsBody).toContain("Revisionsfrist");

    // Count VEVENTs — should be at least 3
    const veventCount = (icsBody.match(/BEGIN:VEVENT/g) || []).length;
    expect(veventCount).toBeGreaterThanOrEqual(3);
  });

  test("case-filtered fristen returns only matching deadlines", async ({ page }) => {
    const csrf = await getCsrfToken(page);

    // Create two cases with different deadlines
    const case1Slug = `cases/filter-1-${Date.now()}`;
    const case2Slug = `cases/filter-2-${Date.now()}`;

    for (const [slug, title, deadlineTitle] of [
      [case1Slug, "Filter Test 1", "Frist-A"],
      [case2Slug, "Filter Test 2", "Frist-B"],
    ] as const) {
      const res = await page.context().request.post("/api/pages", {
        data: {
          slug,
          title,
          content: "Filter test",
          type: "legal_case",
          frontmatter: {
            status: "open",
            deadlines: [{ title: deadlineTitle, due_date: "2026-12-31", law: "§ 1" }],
          },
        },
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).toBe(200);
    }

    // Filter by case1
    const filteredRes = await page
      .context()
      .request.get(`/api/legal/fristen?case=${encodeURIComponent(case1Slug)}`);
    expect(filteredRes.status()).toBe(200);
    const filteredData = await filteredRes.json();
    expect(filteredData.fristen.length).toBeGreaterThanOrEqual(1);
    const filteredTitles = filteredData.fristen.map((f: { title: string }) => f.title);
    expect(filteredTitles).toContain("Frist-A");
    expect(filteredTitles).not.toContain("Frist-B");
  });
});
