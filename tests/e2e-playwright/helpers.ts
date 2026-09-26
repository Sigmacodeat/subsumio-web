/**
 * Shared helpers for Playwright specs.
 *
 * Dates: specs never hard-code a due date. A fixed "2026-12-31" silently
 * turns into "overdue" once the day has passed and changes what the UI shows
 * (docs/TESTING.md). Use `daysFromNow(n)` — the firm's calendar day (Vienna)
 * n days from the moment the test runs.
 */
import { expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

const FIRM_TZ = "Europe/Vienna";

/** YYYY-MM-DD in the firm's time zone, `days` days from now. */
export function daysFromNow(days: number, from: Date = new Date()): string {
  const shifted = new Date(from.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FIRM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/** Today in the firm's time zone. */
export function firmTodayE2E(): string {
  return daysFromNow(0);
}

/**
 * Registers through the real signup flow and confirms it. Signup never signs
 * in by itself (it answers the same for new and taken addresses and mails a
 * confirmation link — src/lib/auth/pending-signup.ts); under the E2E harness
 * (SUBSUMIO_E2E=1) the response carries that link, and opening it creates the
 * account and sets the session cookie on this request context. Returns the
 * signup response (201 for every valid registration).
 */
export async function signupAndConfirm(
  request: APIRequestContext,
  options: { data: Record<string, unknown> }
): Promise<APIResponse> {
  const res = await request.post("/api/auth/signup", options);
  if (res.status() !== 201) return res;
  const body = (await res.json().catch(() => ({}))) as { e2eVerifyUrl?: string };
  if (body.e2eVerifyUrl) {
    const link = new URL(body.e2eVerifyUrl);
    const confirm = await request.get(`${link.pathname}${link.search}`, { maxRedirects: 0 });
    expect(confirm.status(), "confirmation link redirects into the app").toBeGreaterThanOrEqual(
      300
    );
    expect(confirm.status()).toBeLessThan(400);
  }
  return res;
}

/**
 * Submits the filled signup form on `page` (ticking the terms/AVV boxes) and
 * opens the confirmation link. Signup no longer signs in by itself: the
 * account is created when the link is opened, which the E2E harness
 * (SUBSUMIO_E2E=1) returns in the response. Afterwards the page is in the app.
 */
export async function submitSignupFormAndConfirm(page: Page): Promise<void> {
  for (const box of await page
    .locator('[data-testid="signup-legal"] input[type="checkbox"]')
    .all()) {
    await box.check();
  }
  const [res] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/auth/signup") && r.request().method() === "POST"
    ),
    page.locator('form button[type="submit"]').click(),
  ]);
  expect(res.status(), "signup accepted").toBe(201);
  const body = (await res.json().catch(() => ({}))) as { e2eVerifyUrl?: string };
  expect(body.e2eVerifyUrl, "E2E harness returns the confirmation link").toBeTruthy();
  const link = new URL(body.e2eVerifyUrl!);
  await page.goto(`${link.pathname}${link.search}`, { waitUntil: "domcontentloaded" });
}

/** Signs up a fresh user (legal industry), finishes onboarding, returns the CSRF token. */
export async function signUpLegalUser(
  page: Page,
  prefix: string,
  password = "E2eTestPass123!"
): Promise<{ email: string; csrf: string }> {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@subsumio.local`;
  const res = await signupAndConfirm(page.context().request, {
    data: {
      acceptTerms: true,
      acceptDpa: true,
      email,
      name: "E2E Anwalt",
      password,
      locale: "de",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrf =
    (await page.context().cookies()).find((cookie) => cookie.name === "sb_csrf")?.value ?? "";
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrf ? { "x-csrf-token": csrf } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  return { email, csrf };
}

/** Cent-exact amount of a time position (minutes × hourly rate). */
export function timeAmount(minutes: number, rate: number): number {
  return Math.round((minutes * rate * 100) / 60) / 100;
}

export interface BillableSetup {
  caseSlug: string;
  entryId: string;
  minutes: number;
  rate: number;
}

/** A matter with one billable time entry, created through the product routes. */
export async function createCaseWithTimeEntry(
  api: APIRequestContext,
  csrf: string,
  opts: { minutes?: number; rate?: number; clientName?: string } = {}
): Promise<BillableSetup> {
  const minutes = opts.minutes ?? 45;
  const rate = opts.rate ?? 220;
  const caseSlug = `legal/cases/e2e-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const caseRes = await api.post("/api/pages", {
    headers: { "x-csrf-token": csrf },
    data: {
      slug: caseSlug,
      title: "E2E Abrechnungsakte",
      type: "legal_case",
      content: "Akte für den Rechnungsablauf.",
      frontmatter: {
        type: "legal_case",
        case_number: `E2E-INV-${Date.now()}`,
        status: "open",
        legal_area: "Zivilrecht",
        client_name: opts.clientName ?? `E2E Mandantin ${Date.now()}`,
      },
    },
  });
  expect(caseRes.status()).toBe(200);
  const timeRes = await api.post("/api/time", {
    headers: { "x-csrf-token": csrf },
    data: {
      case_slug: caseSlug,
      description: "Beratung zum Vertragsentwurf",
      minutes,
      date: firmTodayE2E(),
      rate,
      billable: true,
      activity_type: "meeting",
    },
  });
  expect(timeRes.status()).toBe(201);
  const entryId = String((await timeRes.json()).data.entry.id);
  return { caseSlug, entryId, minutes, rate };
}

/** A draft invoice payload for POST /api/invoices, with sums the server accepts (20 % USt). */
export function draftInvoicePayload(setup: BillableSetup, invoiceNumber: string, client: string) {
  const amount = timeAmount(setup.minutes, setup.rate);
  const tax = Math.round(amount * 0.2 * 100) / 100;
  return {
    slug: `invoice/e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: `Rechnung ${invoiceNumber}`,
    frontmatter: {
      type: "invoice",
      invoice_number: invoiceNumber,
      client,
      case_slugs: [setup.caseSlug],
      date: firmTodayE2E(),
      due_date: daysFromNow(14),
      items: [
        {
          description: "Beratung zum Vertragsentwurf",
          date: firmTodayE2E(),
          hours: Math.round((setup.minutes / 60) * 10_000) / 10_000,
          rate: setup.rate,
          amount,
          time_entry_id: setup.entryId,
        },
      ],
      expenses: [],
      time_entry_ids: [setup.entryId],
      expense_entry_ids: [],
      status: "draft",
      subtotal: amount,
      expense_total: 0,
      advance_payment: 0,
      vat_rate: 0.2,
      tax,
      total: Math.round((amount + tax) * 100) / 100,
    },
  };
}

/** Next invoice number from the server's counter. */
export async function reserveInvoiceNumber(api: APIRequestContext, csrf: string): Promise<string> {
  const res = await api.post("/api/invoices/number", { headers: { "x-csrf-token": csrf } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  const number = body.data?.number ?? body.number;
  expect(typeof number).toBe("string");
  return String(number);
}
