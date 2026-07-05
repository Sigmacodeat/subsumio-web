/**
 * E2E E-Invoice Flow Tests
 * =========================
 * Tests the complete e-invoice lifecycle:
 *   1. Generate XRechnung XML with leitwegId
 *   2. Generate ZUGFeRD PDF (scratch)
 *   3. Validate e-invoice XML
 *   4. Parse incoming XRechnung XML
 *   5. Incoming invoice stored as brain page
 *   6. E-invoice parse with invalid XML → error
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = {
  password: "EInvoiceTest123!",
  name: "E-Invoice Tester",
};

function getTestEmail() {
  testCounter++;
  return `einv-${Date.now()}-${testCounter}@subsumio.local`;
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

const SAMPLE_KANZLEI_SETTINGS = {
  kanzlei_name: "Test Kanzlei",
  kanzlei_street: "Teststraße 1",
  kanzlei_zip: "10115",
  kanzlei_city: "Berlin",
  kanzlei_country: "DE",
  kanzlei_tax_id: "DE123456789",
  kanzlei_iban: "DE89370400440532013000",
  kanzlei_bic: "COBADEFFXXX",
  kanzlei_bank: "Commerzbank",
  kleinunternehmer: false,
  eInvoiceProfile: "BASIC",
};

const SAMPLE_INVOICE = {
  invoice_number: `R-EINV-${Date.now()}`,
  client: "Test Mandant GmbH",
  client_address: "Musterstraße 2, 80331 München",
  case_number: "TEST-2026-001",
  date: new Date().toISOString().slice(0, 10),
  due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  items: [
    {
      description: "Rechtsberatung Vertragsrecht",
      date: new Date().toISOString().slice(0, 10),
      hours: 2.5,
      rate: 250,
      amount: 625,
    },
  ],
  expenses: [],
  subtotal: 625,
  expense_total: 0,
  advance_payment: 0,
  vat_rate: 19,
  tax: 118.75,
  total: 743.75,
  payment_terms: "14 Tage netto",
  bank: {
    name: "Commerzbank",
    iban: "DE89370400440532013000",
    bic: "COBADEFFXXX",
  },
  status: "draft",
  invoice_type: "standard",
};

test.describe("E-Invoice Flow", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("1. Generate XRechnung XML with leitwegId", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const res = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: {
        format: "xrechnung",
        invoice: SAMPLE_INVOICE,
        settings: SAMPLE_KANZLEI_SETTINGS,
        options: {
          leitwegId: "991-51097-29",
          buyerAddress: {
            name: "Test Mandant GmbH",
            street: "Musterstraße 2",
            zip: "80331",
            city: "München",
            country: "DE",
          },
        },
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.xml).toBeTruthy();
    expect(data.xml).toContain("<?xml");
    expect(data.xml).toContain("CrossIndustryInvoice");
    // Leitweg-ID should appear in the XML as buyer reference
    expect(data.xml).toContain("991-51097-29");
    expect(data.filename).toContain(".xml");
  });

  test("2. Generate ZUGFeRD PDF (scratch)", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const res = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: {
        format: "zugferd_scratch",
        invoice: SAMPLE_INVOICE,
        settings: SAMPLE_KANZLEI_SETTINGS,
      },
    });

    // ZUGFeRD scratch returns a PDF blob
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType).toContain("application/pdf");
    const buffer = await res.body();
    expect(buffer.length).toBeGreaterThan(1000);
    // PDF magic bytes
    expect(buffer[0]).toBe(0x25); // %
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x44); // D
    expect(buffer[3]).toBe(0x46); // F
  });

  test("3. Validate e-invoice XML", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    // First generate XML
    const genRes = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: {
        format: "xrechnung",
        invoice: SAMPLE_INVOICE,
        settings: SAMPLE_KANZLEI_SETTINGS,
      },
    });
    expect(genRes.status()).toBe(200);
    const genData = await genRes.json();
    const xml = genData.xml;

    // Now validate it
    const valRes = await api.post("/api/e-invoice/validate", {
      headers: { "x-csrf-token": csrf },
      data: { xml },
    });

    expect(valRes.status()).toBe(200);
    const valData = await valRes.json();
    expect(valData.ok).toBe(true);
    expect(valData.valid).toBe(true);
  });

  test("4. Parse incoming XRechnung XML", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    // Generate an XML first to use as "incoming"
    const genRes = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: {
        format: "xrechnung",
        invoice: {
          ...SAMPLE_INVOICE,
          invoice_number: `R-INCOMING-${Date.now()}`,
          client: "Incoming Supplier GmbH",
        },
        settings: SAMPLE_KANZLEI_SETTINGS,
      },
    });
    expect(genRes.status()).toBe(200);
    const genData = await genRes.json();
    const xml = genData.xml;

    // Parse it as an incoming invoice
    const parseRes = await api.post("/api/e-invoice/parse", {
      headers: { "x-csrf-token": csrf },
      data: { xml },
    });

    expect(parseRes.status()).toBe(200);
    const parseData = await parseRes.json();
    expect(parseData.ok).toBe(true);
    expect(parseData.parsed).toBeTruthy();
    expect(parseData.parsed.invoiceNumber).toBeTruthy();
    expect(parseData.parsed.totalGross).toBeGreaterThan(0);
    expect(parseData.parsed.lineItems?.length ?? 0).toBeGreaterThan(0);
  });

  test("5. Parse invalid XML → error", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const parseRes = await api.post("/api/e-invoice/parse", {
      headers: { "x-csrf-token": csrf },
      data: { xml: "<not valid xml<<<" },
    });

    expect(parseRes.status()).toBe(400);
    const parseData = await parseRes.json();
    expect(parseData.ok).toBe(false);
    expect(parseData.error).toBeTruthy();
  });

  test("6. E-invoice generate with Kleinunternehmer setting (no VAT)", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    const res = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: {
        format: "xrechnung",
        invoice: {
          ...SAMPLE_INVOICE,
          vat_rate: 0,
          tax: 0,
          total: 625,
        },
        settings: {
          ...SAMPLE_KANZLEI_SETTINGS,
          kleinunternehmer: true,
        },
      },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.xml).toContain("Kleinunternehmer");
  });

  test("7. E-invoice validate with data object", async ({ page }) => {
    const csrf = await getCsrf(page);
    const api = page.context().request;

    // Generate to get EInvoiceData
    const genRes = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: {
        format: "xrechnung",
        invoice: SAMPLE_INVOICE,
        settings: SAMPLE_KANZLEI_SETTINGS,
      },
    });
    expect(genRes.status()).toBe(200);

    // Validate with a data object (not XML)
    const valRes = await api.post("/api/e-invoice/validate", {
      headers: { "x-csrf-token": csrf },
      data: {
        data: {
          invoiceNumber: "R-TEST-001",
          invoiceDate: new Date().toISOString().slice(0, 10),
          dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          typeCode: "380",
          currency: "EUR",
          profile: "BASIC",
          seller: {
            name: "Test Kanzlei",
            street: "Teststraße 1",
            zip: "10115",
            city: "Berlin",
            country: "DE",
            taxId: "DE123456789",
          },
          buyer: {
            name: "Test Client",
            zip: "80331",
            city: "München",
            country: "DE",
          },
          lineItems: [
            {
              id: "1",
              description: "Rechtsberatung",
              quantity: 2.5,
              unit: "HUR",
              unitPrice: 250,
              taxRate: 19,
              taxCategory: "S",
              netAmount: 625,
              taxAmount: 118.75,
              totalAmount: 743.75,
            },
          ],
          totalNet: 625,
          totalTax: 118.75,
          totalGross: 743.75,
        },
      },
    });

    expect(valRes.status()).toBe(200);
    const valData = await valRes.json();
    expect(valData.ok).toBe(true);
  });
});
