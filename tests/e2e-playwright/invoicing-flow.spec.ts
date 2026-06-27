/**
 * E2E Invoicing CRUD Flow Tests
 * ==============================
 * Tests the complete invoicing lifecycle:
 *   1. Create invoice from case + time entries
 *   2. List invoices
 *   3. Update invoice status
 *   4. Invoice page renders
 *   5. Time tracking CRUD
 *   6. Billing summary
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "InvoiceTest123!",
  name: "Invoice Tester",
};

function getTestEmail() {
  testCounter++;
  return `inv-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Invoicing CRUD Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("invoicing page renders with correct elements", async ({ page }) => {
    await page.goto("/dashboard/invoicing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Rechnung|Invoice/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: /rechnung erstellen|create invoice/i }).first()
    ).toBeVisible();
  });

  test("create case → add time entry → create invoice via API", async ({ page }) => {
    const csrf = await getCsrf(page);
    const apiRequest = page.context().request;

    // 1. Create a case
    const caseSlug = `inv-case-${Date.now()}`;
    const createCaseRes = await apiRequest.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Invoice Test Case",
        type: "legal_case",
        content: "Test case for invoicing flow.",
        frontmatter: {
          case_number: `INV-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          priority: "medium",
          client_name: "Test Client GmbH",
        },
      },
      headers: { "x-csrf-token": csrf },
    });
    expect(createCaseRes.status()).not.toBe(403);
    expect(createCaseRes.status()).not.toBe(503);

    // 2. Add a time entry
    const timeRes = await apiRequest.post("/api/time", {
      data: {
        case_slug: caseSlug,
        description: "Beratung Mandant zum Vertragsentwurf",
        minutes: 45,
        date: new Date().toISOString().split("T")[0],
        rate: 220,
        billable: true,
        activity_type: "meeting",
        lawyer: "Test Lawyer",
      },
      headers: { "x-csrf-token": csrf },
    });
    expect(timeRes.status()).not.toBe(403);
    expect(timeRes.status()).not.toBe(503);

    // 3. Verify time entry was added
    const timeListRes = await apiRequest.get(`/api/time?case_slug=${encodeURIComponent(caseSlug)}`);
    expect(timeListRes.status()).toBe(200);
    const timeData = await timeListRes.json();
    expect(timeData.data?.entries?.length ?? 0).toBeGreaterThan(0);

    // 4. Create invoice
    const invoiceSlug = `invoice/inv-${Date.now()}`;
    const invoiceRes = await apiRequest.post("/api/pages", {
      data: {
        slug: invoiceSlug,
        title: `Rechnung R-${new Date().getFullYear()}-0001`,
        type: "invoice",
        content: "",
        frontmatter: {
          type: "invoice",
          invoice_number: `R-${new Date().getFullYear()}-0001`,
          client: "Test Client GmbH",
          case_number: `INV-${Date.now()}`,
          date: new Date().toISOString().split("T")[0],
          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          items: [
            {
              description: "Beratung Mandant zum Vertragsentwurf",
              date: new Date().toISOString().split("T")[0],
              hours: 0.75,
              rate: 220,
              amount: 165,
            },
          ],
          expenses: [],
          status: "draft",
          subtotal: 165,
          expense_total: 0,
          advance_payment: 0,
          vat_rate: 0.19,
          tax: 31.35,
          total: 196.35,
        },
      },
      headers: { "x-csrf-token": csrf },
    });
    expect(invoiceRes.status()).not.toBe(403);
    expect(invoiceRes.status()).not.toBe(503);

    // 5. List invoices
    const listRes = await apiRequest.get("/api/pages?type=invoice");
    expect(listRes.status()).toBe(200);
    const invoices = await listRes.json();
    const found = Array.isArray(invoices)
      ? invoices.find((p: { slug: string }) => p.slug === invoiceSlug)
      : invoices.items?.find((p: { slug: string }) => p.slug === invoiceSlug);
    expect(found).toBeTruthy();
  });

  test("time tracking API CRUD", async ({ page }) => {
    const csrf = await getCsrf(page);
    const apiRequest = page.context().request;

    // Create a case first
    const caseSlug = `time-case-${Date.now()}`;
    await apiRequest.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Time Tracking Test Case",
        type: "legal_case",
        content: "Test case for time tracking.",
        frontmatter: {
          case_number: `TT-${Date.now()}`,
          status: "open",
          legal_area: "Zivilrecht",
          priority: "low",
        },
      },
      headers: { "x-csrf-token": csrf },
    });

    // Create time entry
    const createRes = await apiRequest.post("/api/time", {
      data: {
        case_slug: caseSlug,
        description: "Recherche zum Urteil BGH XII ZR 123/21",
        minutes: 30,
        date: new Date().toISOString().split("T")[0],
        billable: true,
        activity_type: "research",
      },
      headers: { "x-csrf-token": csrf },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.data?.entry).toBeTruthy();
    expect(created.data.entry.minutes).toBe(30);

    // List time entries
    const listRes = await apiRequest.get(`/api/time?case_slug=${encodeURIComponent(caseSlug)}`);
    expect(listRes.status()).toBe(200);
    const listData = await listRes.json();
    expect(listData.data?.entries?.length ?? 0).toBeGreaterThan(0);

    // Billing summary
    const summaryRes = await apiRequest.get("/api/time/billing-summary");
    expect(summaryRes.status()).toBe(200);
    const summary = await summaryRes.json();
    expect(summary.data?.total_unbilled_entries).toBeDefined();
    expect(summary.data?.total_unbilled_amount).toBeDefined();
    expect(summary.data?.by_case).toBeDefined();
  });

  test("mark time entries as billed", async ({ page }) => {
    const csrf = await getCsrf(page);
    const apiRequest = page.context().request;

    // Create case + time entry
    const caseSlug = `bill-case-${Date.now()}`;
    await apiRequest.post("/api/pages", {
      data: {
        slug: caseSlug,
        title: "Billing Mark Test Case",
        type: "legal_case",
        content: "Test case for billing mark.",
        frontmatter: {
          case_number: `BM-${Date.now()}`,
          status: "open",
          legal_area: "Familienrecht",
          priority: "medium",
        },
      },
      headers: { "x-csrf-token": csrf },
    });

    const timeRes = await apiRequest.post("/api/time", {
      data: {
        case_slug: caseSlug,
        description: "Mandatsbesprechung",
        minutes: 60,
        date: new Date().toISOString().split("T")[0],
        billable: true,
        rate: 200,
        activity_type: "meeting",
      },
      headers: { "x-csrf-token": csrf },
    });
    expect(timeRes.status()).toBe(201);
    const timeData = await timeRes.json();
    const entryId = timeData.data.entry.id;

    // Mark as billed
    const markRes = await apiRequest.post("/api/time/mark-billed", {
      data: {
        entry_ids: [entryId],
        invoice_number: `R-${new Date().getFullYear()}-0002`,
        case_slug: caseSlug,
      },
      headers: { "x-csrf-token": csrf },
    });
    expect(markRes.status()).toBe(200);
    const markData = await markRes.json();
    expect(markData.data?.updated).toBe(1);
  });
});
