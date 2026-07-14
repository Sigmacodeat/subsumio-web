/**
 * E2E Tests — Tax Triage API Route
 * ==================================
 * Tests: /api/tax/triage endpoint
 * - Auth required
 * - Deterministic triage (use_ai: false)
 * - AI triage (use_ai: true) — engine may be unavailable in CI, so best-effort
 * - Jurisdiction support (DE, AT, CH)
 * - Input validation
 * - Summary structure
 */

import { test, expect } from "@playwright/test";

let testCounter = 0;
const TEST_USER = { password: "TaxTriage1234!", name: "Tax Triage Tester" };

function getTestEmail() {
  testCounter++;
  return `tax-triage-${Date.now()}-${testCounter}@subsumio.local`;
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
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
}

test.describe("Tax Triage API: /api/tax/triage", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  test("rejects unauthenticated requests", async ({ request }) => {
    const res = await request.post("/api/tax/triage", {
      data: {
        messages: [{ source: "email", subject: "Steuerbescheid 2024" }],
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("returns deterministic triage for tax-related message (use_ai: false)", async ({
    page,
  }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "email",
            subject: "Einspruch gegen Einkommensteuerbescheid 2023",
            body: "Sehr geehrte Damen und Herren, hiermit lege ich Einspruch ein gegen den Einkommensteuerbescheid 2023 vom 15.03.2024. Die Frist beträgt einen Monat.",
            sender: "Rechtsanwalt Müller",
            date: "2024-03-20",
          },
        ],
        jurisdiction: "de",
        use_ai: false,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.results).toBeDefined();
    expect(data.results).toHaveLength(1);

    const result = data.results[0];
    expect(result.card).toBeDefined();
    expect(result.card.urgency).toBeDefined();
    expect(result.card.title).toBeDefined();
    expect(result.ai_classified).toBe(false);
    expect(result.enrichment).toBeNull();

    // Tax-related message should be classified as some urgency
    expect(["critical", "high", "medium", "low"]).toContain(result.card.urgency);
  });

  test("returns summary with correct counts", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "email",
            subject: "Steuerbescheid Umsatzsteuer 2024",
            body: "Festsetzung der Umsatzsteuer für das Jahr 2024.",
          },
          {
            source: "bea",
            subject: "Betriebsprüfungsankündigung",
            body: "Die Außenprüfung wird für den Zeitraum 2021-2023 durchgeführt.",
          },
          {
            source: "email",
            subject: "Allgemeine Anfrage",
            body: "Vielen Dank für Ihre Nachricht bezüglich der Rechnung.",
          },
        ],
        jurisdiction: "de",
        use_ai: false,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.summary).toBeDefined();
    expect(data.summary.total).toBe(3);
    expect(data.summary.critical + data.summary.high + data.summary.medium + data.summary.low).toBe(
      3
    );
  });

  test("sorts results by urgency (critical first)", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "email",
            subject: "Allgemeine Steueranfrage",
            body: "Haben Sie meine Steuererklärung erhalten?",
          },
          {
            source: "bea",
            subject: "Betriebsprüfungsankündigung Außenprüfung",
            body: "Die Außenprüfung wird angekündigt.",
          },
        ],
        jurisdiction: "de",
        use_ai: false,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(2);

    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const firstUrgency = data.results[0].card.urgency;
    const secondUrgency = data.results[1].card.urgency;
    expect(urgencyOrder[firstUrgency as keyof typeof urgencyOrder]).toBeLessThanOrEqual(
      urgencyOrder[secondUrgency as keyof typeof urgencyOrder]
    );
  });

  test("validates message input — empty messages array rejected", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [],
        jurisdiction: "de",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect([400, 422]).toContain(res.status());
  });

  test("validates message input — missing subject rejected", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [{ source: "email", body: "No subject" }],
        jurisdiction: "de",
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect([400, 422]).toContain(res.status());
  });

  test("supports AT jurisdiction", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "email",
            subject: "Bescheidbeschwerde gegen Einkommensteuerbescheid",
            body: "Es wird Beschwerde eingebracht gegen den Bescheid des Finanzamtes.",
          },
        ],
        jurisdiction: "at",
        use_ai: false,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].card).toBeDefined();
  });

  test("supports CH jurisdiction", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "email",
            subject: "Einsprache gegen Steuerbescheid 2023",
            body: "Hiermit wird Einsprache erhoben gegen den Steuerbescheid 2023.",
          },
        ],
        jurisdiction: "ch",
        use_ai: false,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].card).toBeDefined();
  });

  test("non-tax message returns no enrichment even with AI enabled", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "email",
            subject: "Rechnung für Dienstleistungen",
            body: "Vielen Dank für die Rechnung. Wir überweisen den Betrag in den nächsten Tagen.",
          },
        ],
        jurisdiction: "de",
        use_ai: true,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    expect(data.results[0].ai_classified).toBe(false);
    expect(data.results[0].enrichment).toBeNull();
  });

  test("AI triage returns enrichment for tax message (best-effort, engine may be down)", async ({
    page,
  }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "email",
            subject: "Einspruch gegen Einkommensteuerbescheid 2023",
            body: "Hiermit lege ich Einspruch ein gegen den Einkommensteuerbescheid 2023 vom 15.03.2024. Die Einspruchsfrist beträgt einen Monat ab Zustellung.",
            sender: "RA Schmidt",
            date: "2024-03-20",
          },
        ],
        jurisdiction: "de",
        use_ai: true,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(1);
    const result = data.results[0];

    // If engine is available, enrichment should be present
    // If engine is down, we still get the deterministic card
    if (result.ai_classified && result.enrichment) {
      expect(result.enrichment.document_type).toBeDefined();
      expect(result.enrichment.tax_area).toBeDefined();
      expect(result.enrichment.risk_level).toBeDefined();
      expect(["critical", "high", "medium", "low"]).toContain(result.enrichment.risk_level);
    } else {
      // Engine unavailable — deterministic triage still works
      expect(result.card).toBeDefined();
      expect(result.card.urgency).toBeDefined();
    }
  });

  test("accepts multiple messages with mixed sources", async ({ page }) => {
    const csrf = await getCsrfToken(page);
    const res = await page.context().request.post("/api/tax/triage", {
      data: {
        messages: [
          {
            source: "bea",
            subject: "Finanzamt München: Steuerbescheid",
            body: "Festsetzung Einkommensteuer 2023.",
          },
          {
            source: "email",
            subject: "DATEV Export",
            body: "Bitte finden Sie den DATEV-Export im Anhang.",
          },
          {
            source: "whatsapp",
            subject: "USt-Voranmeldung",
            body: "Die Umsatzsteuervoranmeldung muss bis zum 10. eingereicht werden.",
          },
          {
            source: "portal",
            subject: "Mandantenfrage zur Steuererklärung",
            body: "Wann muss ich die Steuererklärung abgeben?",
          },
        ],
        jurisdiction: "de",
        use_ai: false,
      },
      headers: csrf ? { "x-csrf-token": csrf } : {},
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.results).toHaveLength(4);
    expect(data.summary.total).toBe(4);
    expect(data.summary.tax_related).toBeGreaterThanOrEqual(0);
  });
});
