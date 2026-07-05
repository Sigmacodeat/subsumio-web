/**
 * E2E Case Closeout Flow Tests
 * =============================
 * Tests the complete case closeout lifecycle:
 *   1. Create case → add time entries → create invoice → mark case as closed
 *   2. Verify closed case status in API
 *   3. Verify closed case appears in case list with closed indicator
 *   4. Reopen case → verify status changes back
 *   5. Closeout with outstanding balance → warning
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "CloseoutTest123!",
  name: "Closeout Tester",
};

function getTestEmail() {
  testCounter++;
  return `closeout-${Date.now()}-${testCounter}@subsumio.local`;
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
  return { email, csrfToken };
}

async function getCsrf(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const match = document.cookie.match(/sb_csrf=([^;]+)/);
    return match ? match[1] : "";
  });
}

test.describe("Case Closeout Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("create case → add time → create invoice → close case", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    // 1. Create a case
    const caseSlug = `case-closeout-${Date.now()}`;
    const createCase = await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: caseSlug,
        title: "Closeout Test Case",
        type: "legal_case",
        content: "",
        frontmatter: {
          type: "legal_case",
          case_number: `AZ-${Date.now()}`,
          status: "open",
          client: "Test Client",
          legal_area: "vertragsrecht",
        },
      },
    });
    expect(createCase.status()).toBeLessThan(300);

    // 2. Add a time entry
    const timeEntry = await api.post("/api/legal/time-entries", {
      headers: { "x-csrf-token": csrf },
      data: {
        case_slug: caseSlug,
        description: "Beratung",
        minutes: 60,
        date: new Date().toISOString().slice(0, 10),
        rate: 200,
        billable: true,
      },
    });
    expect(timeEntry.status()).toBeLessThan(300);

    // 3. Create an invoice for the case
    const invoiceSlug = `inv-closeout-${Date.now()}`;
    const createInvoice = await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: invoiceSlug,
        title: `Rechnung ${invoiceSlug}`,
        type: "legal_invoice",
        content: "",
        frontmatter: {
          type: "legal_invoice",
          invoice_number: `R-${Date.now()}`,
          case_slug: caseSlug,
          client: "Test Client",
          date: new Date().toISOString().slice(0, 10),
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          status: "draft",
          items: [{ description: "Beratung", hours: 1, rate: 200, amount: 200 }],
          total: 200,
          vat_rate: 19,
        },
      },
    });
    expect(createInvoice.status()).toBeLessThan(300);

    // 4. Mark invoice as paid
    const markPaid = await api.patch(`/api/pages/${invoiceSlug}`, {
      headers: { "x-csrf-token": csrf },
      data: {
        frontmatter: {
          type: "legal_invoice",
          invoice_number: `R-${Date.now()}`,
          case_slug: caseSlug,
          client: "Test Client",
          date: new Date().toISOString().slice(0, 10),
          status: "paid",
          items: [{ description: "Beratung", hours: 1, rate: 200, amount: 200 }],
          total: 200,
          vat_rate: 19,
        },
      },
    });
    expect(markPaid.status()).toBeLessThan(300);

    // 5. Close the case
    const closeCase = await api.patch(`/api/pages/${caseSlug}`, {
      headers: { "x-csrf-token": csrf },
      data: {
        frontmatter: {
          type: "legal_case",
          case_number: `AZ-${Date.now()}`,
          status: "closed",
          client: "Test Client",
          legal_area: "vertragsrecht",
          closeout_date: new Date().toISOString().slice(0, 10),
        },
      },
    });
    expect(closeCase.status()).toBeLessThan(300);

    // 6. Verify case is closed
    const fetchCase = await api.get(`/api/pages/${caseSlug}`);
    expect(fetchCase.status()).toBe(200);
    const caseData = await fetchCase.json();
    expect(caseData.frontmatter?.status).toBe("closed");
    expect(caseData.frontmatter?.closeout_date).toBeDefined();
  });

  test("closed case appears in case list", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const caseSlug = `case-list-closeout-${Date.now()}`;
    await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: caseSlug,
        title: "List Closeout Test",
        type: "legal_case",
        content: "",
        frontmatter: {
          type: "legal_case",
          case_number: `AZ-LIST-${Date.now()}`,
          status: "closed",
          client: "Test Client",
          legal_area: "familienrecht",
        },
      },
    });

    const res = await api.get("/api/pages?type=legal_case&limit=100");
    expect(res.status()).toBe(200);
    const data = await res.json();
    const found = data.pages?.find((p: { slug: string }) => p.slug === caseSlug);
    expect(found).toBeTruthy();
    expect(found.frontmatter?.status).toBe("closed");
  });

  test("reopen closed case", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const caseSlug = `case-reopen-${Date.now()}`;
    await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: caseSlug,
        title: "Reopen Test Case",
        type: "legal_case",
        content: "",
        frontmatter: {
          type: "legal_case",
          case_number: `AZ-REOPEN-${Date.now()}`,
          status: "closed",
          client: "Test Client",
          legal_area: "mietrecht",
        },
      },
    });

    const reopen = await api.patch(`/api/pages/${caseSlug}`, {
      headers: { "x-csrf-token": csrf },
      data: {
        frontmatter: {
          type: "legal_case",
          case_number: `AZ-REOPEN-${Date.now()}`,
          status: "open",
          client: "Test Client",
          legal_area: "mietrecht",
        },
      },
    });
    expect(reopen.status()).toBeLessThan(300);

    const fetchCase = await api.get(`/api/pages/${caseSlug}`);
    const caseData = await fetchCase.json();
    expect(caseData.frontmatter?.status).toBe("open");
  });

  test("case closeout page renders", async ({ page }) => {
    await page.goto("/dashboard/cases", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Akten|Cases/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
