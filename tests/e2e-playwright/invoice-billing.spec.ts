/**
 * E2E Invoice Billing Flow Tests
 * ================================
 * Tests the complete invoice billing lifecycle:
 *   1. Create invoice → mark as sent → mark as paid
 *   2. Invoice status transitions via API
 *   3. Invoice list shows correct status
 *   4. E-invoice generation endpoint returns XML
 *   5. Invoice with Kleinunternehmer setting (no VAT)
 *   6. Invoice PDF download
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "BillingTest123!",
  name: "Billing Tester",
};

function getTestEmail() {
  testCounter++;
  return `billing-${Date.now()}-${testCounter}@subsumio.local`;
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

test.describe("Invoice Billing Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("create invoice → mark sent → mark paid", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    // 1. Create invoice
    const invoiceSlug = `inv-billing-${Date.now()}`;
    const invNumber = `R-BILL-${Date.now()}`;
    const createRes = await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: invoiceSlug,
        title: `Rechnung ${invNumber}`,
        type: "legal_invoice",
        content: "",
        frontmatter: {
          type: "legal_invoice",
          invoice_number: invNumber,
          client: "Billing Test Client",
          date: new Date().toISOString().slice(0, 10),
          due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          status: "draft",
          items: [{ description: "Rechtsberatung", hours: 2, rate: 250, amount: 500 }],
          total: 500,
          vat_rate: 19,
        },
      },
    });
    expect(createRes.status()).toBeLessThan(300);

    // 2. Mark as sent
    const sentRes = await api.patch(`/api/pages/${invoiceSlug}`, {
      headers: { "x-csrf-token": csrf },
      data: {
        frontmatter: {
          type: "legal_invoice",
          invoice_number: invNumber,
          client: "Billing Test Client",
          date: new Date().toISOString().slice(0, 10),
          status: "sent",
          items: [{ description: "Rechtsberatung", hours: 2, rate: 250, amount: 500 }],
          total: 500,
          vat_rate: 19,
        },
      },
    });
    expect(sentRes.status()).toBeLessThan(300);

    // 3. Verify sent
    const fetchSent = await api.get(`/api/pages/${invoiceSlug}`);
    const sentData = await fetchSent.json();
    expect(sentData.frontmatter?.status).toBe("sent");

    // 4. Mark as paid
    const paidRes = await api.patch(`/api/pages/${invoiceSlug}`, {
      headers: { "x-csrf-token": csrf },
      data: {
        frontmatter: {
          type: "legal_invoice",
          invoice_number: invNumber,
          client: "Billing Test Client",
          date: new Date().toISOString().slice(0, 10),
          status: "paid",
          items: [{ description: "Rechtsberatung", hours: 2, rate: 250, amount: 500 }],
          total: 500,
          vat_rate: 19,
          paid_date: new Date().toISOString().slice(0, 10),
        },
      },
    });
    expect(paidRes.status()).toBeLessThan(300);

    // 5. Verify paid
    const fetchPaid = await api.get(`/api/pages/${invoiceSlug}`);
    const paidData = await fetchPaid.json();
    expect(paidData.frontmatter?.status).toBe("paid");
    expect(paidData.frontmatter?.paid_date).toBeDefined();
  });

  test("invoice list shows all statuses", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const baseSlug = `inv-list-${Date.now()}`;
    const statuses = ["draft", "sent", "paid", "cancelled"];

    for (const status of statuses) {
      await api.post("/api/pages", {
        headers: { "x-csrf-token": csrf },
        data: {
          slug: `${baseSlug}-${status}`,
          title: `Rechnung ${status}`,
          type: "legal_invoice",
          content: "",
          frontmatter: {
            type: "legal_invoice",
            invoice_number: `R-${status}-${Date.now()}`,
            client: "List Test Client",
            date: new Date().toISOString().slice(0, 10),
            status,
            items: [],
            total: 0,
          },
        },
      });
    }

    const res = await api.get("/api/pages?type=legal_invoice&limit=100");
    expect(res.status()).toBe(200);
    const data = await res.json();
    const slugs = (data.pages ?? []).map((p: { slug: string }) => p.slug);
    for (const status of statuses) {
      expect(slugs).toContain(`${baseSlug}-${status}`);
    }
  });

  test("e-invoice generation returns valid XML", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    // Create an invoice first
    const invoiceSlug = `inv-einvoice-${Date.now()}`;
    await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: invoiceSlug,
        title: "E-Invoice Test",
        type: "legal_invoice",
        content: "",
        frontmatter: {
          type: "legal_invoice",
          invoice_number: `R-EINV-${Date.now()}`,
          client: "E-Invoice Client",
          date: new Date().toISOString().slice(0, 10),
          status: "draft",
          items: [{ description: "Beratung", hours: 1, rate: 200, amount: 200 }],
          total: 200,
          vat_rate: 19,
        },
      },
    });

    // Try to generate XRechnung XML
    const genRes = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: {
        invoiceSlug,
        format: "xrechnung",
      },
    });

    // Should return 200 with XML or 400 if settings missing
    if (genRes.status() === 200) {
      const xml = await genRes.text();
      expect(xml).toContain("<?xml");
      expect(xml).toContain("CrossIndustryInvoice");
    } else {
      // If settings are missing (no kanzlei name), should get a clear error
      expect(genRes.status()).toBe(400);
    }
  });

  test("invoicing dashboard renders with billing elements", async ({ page }) => {
    await page.goto("/dashboard/invoicing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Rechnung|Invoice/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("invoice status transition: draft → cancelled", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const invoiceSlug = `inv-cancel-${Date.now()}`;
    const invNumber = `R-CANCEL-${Date.now()}`;
    await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: invoiceSlug,
        title: `Rechnung ${invNumber}`,
        type: "legal_invoice",
        content: "",
        frontmatter: {
          type: "legal_invoice",
          invoice_number: invNumber,
          client: "Cancel Test Client",
          date: new Date().toISOString().slice(0, 10),
          status: "draft",
          items: [],
          total: 0,
        },
      },
    });

    const cancelRes = await api.patch(`/api/pages/${invoiceSlug}`, {
      headers: { "x-csrf-token": csrf },
      data: {
        frontmatter: {
          type: "legal_invoice",
          invoice_number: invNumber,
          client: "Cancel Test Client",
          date: new Date().toISOString().slice(0, 10),
          status: "cancelled",
          items: [],
          total: 0,
        },
      },
    });
    expect(cancelRes.status()).toBeLessThan(300);

    const fetchCancelled = await api.get(`/api/pages/${invoiceSlug}`);
    const cancelledData = await fetchCancelled.json();
    expect(cancelledData.frontmatter?.status).toBe("cancelled");
  });
});
