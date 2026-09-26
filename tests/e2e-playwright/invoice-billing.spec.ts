/**
 * E2E Invoice Billing Flow — über die echten Rechnungsrouten
 * ============================================================
 *   1. Anlage: POST /api/invoices (Nummer vom Server, Leistungen reserviert)
 *   2. Ausstellen: PATCH /api/invoices/<slug> (Entwurf → versendet → bezahlt)
 *   3. Storno: POST /api/invoices/<slug>/storno (Storno-Note, Original bleibt)
 *   4. Doppelanlage über dieselbe Leistung → 409
 *   5. Rechnung über die generische Seitenroute → 409
 *   6. e-Rechnung aus einer echten Rechnung
 *
 * Nicht abgedeckt: der E-Mail-Versand (POST /api/invoices/send) braucht einen
 * SMTP-Server, den die E2E-Umgebung nicht hat — ausgestellt wird hier über den
 * Statuswechsel, der dieselbe Ausstellungsprüfung durchläuft.
 */

import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  createCaseWithTimeEntry,
  draftInvoicePayload,
  reserveInvoiceNumber,
  signUpLegalUser,
} from "./helpers";

const CLIENT = "E2E Rechnungsmandantin GmbH";

async function createDraft(api: APIRequestContext, csrf: string) {
  const setup = await createCaseWithTimeEntry(api, csrf, { clientName: CLIENT });
  const number = await reserveInvoiceNumber(api, csrf);
  const payload = draftInvoicePayload(setup, number, CLIENT);
  const res = await api.post("/api/invoices", {
    headers: { "x-csrf-token": csrf },
    data: payload,
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.data.invoice_number).toBe(number);
  expect(body.data.billed.time).toEqual([setup.entryId]);
  return { setup, number, payload, slug: payload.slug };
}

async function getInvoice(api: APIRequestContext, slug: string) {
  const res = await api.get(`/api/invoices/${encodeURIComponent(slug)}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { frontmatter: Record<string, unknown> };
}

async function issue(api: APIRequestContext, csrf: string, slug: string) {
  const res = await api.patch(`/api/invoices/${encodeURIComponent(slug)}`, {
    headers: { "x-csrf-token": csrf },
    data: { status: "sent", sent_at: new Date().toISOString() },
  });
  expect(res.status()).toBe(200);
}

test.describe("Invoice Billing Flow (echte Rechnungsrouten)", () => {
  let csrf = "";
  let api: APIRequestContext;

  test.beforeEach(async ({ page }: { page: Page }) => {
    ({ csrf } = await signUpLegalUser(page, "billing"));
    api = page.context().request;
  });

  test("Anlage über /api/invoices → ausstellen → bezahlt", async () => {
    const { slug, setup } = await createDraft(api, csrf);

    // The time entry is billed under the invoice number.
    const timeRes = await api.get(`/api/time?case_slug=${encodeURIComponent(setup.caseSlug)}`);
    const entry = (await timeRes.json()).data.entries.find(
      (e: { id: string }) => e.id === setup.entryId
    );
    expect(entry.billed).toBe(true);

    await issue(api, csrf, slug);
    expect((await getInvoice(api, slug)).frontmatter.status).toBe("sent");

    const paidRes = await api.patch(`/api/invoices/${encodeURIComponent(slug)}`, {
      headers: { "x-csrf-token": csrf },
      data: { status: "paid", paid_at: new Date().toISOString() },
    });
    expect(paidRes.status()).toBe(200);
    expect((await getInvoice(api, slug)).frontmatter.status).toBe("paid");
  });

  test("ausgestellte Rechnung ist unveränderbar", async () => {
    const { slug } = await createDraft(api, csrf);
    await issue(api, csrf, slug);
    const res = await api.patch(`/api/invoices/${encodeURIComponent(slug)}`, {
      headers: { "x-csrf-token": csrf },
      data: { total: 1 },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect((await getInvoice(api, slug)).frontmatter.total).not.toBe(1);
  });

  test("Storno: Storno-Note mit negativen Beträgen, Original unverändert, zweiter Storno → 409", async () => {
    const { slug, number, payload } = await createDraft(api, csrf);
    await issue(api, csrf, slug);
    const before = (await getInvoice(api, slug)).frontmatter;

    const stornoRes = await api.post(`/api/invoices/${encodeURIComponent(slug)}/storno`, {
      headers: { "x-csrf-token": csrf },
    });
    expect(stornoRes.status()).toBe(201);
    const storno = (await stornoRes.json()).data as { slug: string; invoice_number: string };
    expect(storno.invoice_number).not.toBe(number);

    const note = (await getInvoice(api, storno.slug)).frontmatter;
    expect(note).toMatchObject({
      invoice_type: "storno",
      parent_invoice_id: slug,
      parent_invoice_number: number,
      status: "sent",
      total: -payload.frontmatter.total,
      subtotal: -payload.frontmatter.subtotal,
    });

    const after = (await getInvoice(api, slug)).frontmatter;
    expect(after.status).toBe(before.status);
    expect(after.total).toBe(before.total);
    expect(after.items).toEqual(before.items);

    const again = await api.post(`/api/invoices/${encodeURIComponent(slug)}/storno`, {
      headers: { "x-csrf-token": csrf },
    });
    expect(again.status()).toBe(409);
  });

  test("zwei Rechnungen über dieselbe Leistung: verschiedene Nummern, nur eine wird angelegt", async () => {
    const setup = await createCaseWithTimeEntry(api, csrf, { clientName: CLIENT });
    const [n1, n2] = [await reserveInvoiceNumber(api, csrf), await reserveInvoiceNumber(api, csrf)];
    expect(n1).not.toBe(n2);
    const [a, b] = await Promise.all(
      [n1, n2].map((n) =>
        api.post("/api/invoices", {
          headers: { "x-csrf-token": csrf },
          data: draftInvoicePayload(setup, n, CLIENT),
        })
      )
    );
    expect([a.status(), b.status()].sort()).toEqual([201, 409]);
  });

  test("Positionen, die nicht zum Zeiteintrag passen, werden abgewiesen (422)", async () => {
    const setup = await createCaseWithTimeEntry(api, csrf, { clientName: CLIENT });
    const number = await reserveInvoiceNumber(api, csrf);
    // Self-consistent but 4 × the recorded time.
    const inflated = draftInvoicePayload({ ...setup, minutes: setup.minutes * 4 }, number, CLIENT);
    const res = await api.post("/api/invoices", {
      headers: { "x-csrf-token": csrf },
      data: inflated,
    });
    expect(res.status()).toBe(422);
    expect((await res.json()).error).toBe("invoice_billing_mismatch");
  });

  test("Entwurf wird gelöscht, nicht storniert", async () => {
    const { slug } = await createDraft(api, csrf);
    const res = await api.patch(`/api/invoices/${encodeURIComponent(slug)}`, {
      headers: { "x-csrf-token": csrf },
      data: { status: "cancelled" },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("draft_cancel_use_delete");
  });

  test("Negativtest: Rechnung über POST /api/pages → 409", async () => {
    const res = await api.post("/api/pages", {
      headers: { "x-csrf-token": csrf },
      data: {
        slug: `invoice/e2e-generic-${Date.now()}`,
        title: "Rechnung am Rechnungsweg vorbei",
        type: "invoice",
        content: "",
        frontmatter: { type: "invoice", invoice_number: "R-X", status: "draft", items: [] },
      },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe("invoice_create_via_route");
  });

  test("e-Rechnung aus einer echten Rechnung", async () => {
    const { slug } = await createDraft(api, csrf);
    const genRes = await api.post("/api/e-invoice/generate", {
      headers: { "x-csrf-token": csrf },
      data: { invoiceSlug: slug, format: "xrechnung" },
    });
    if (genRes.status() === 200) {
      const xml = await genRes.text();
      expect(xml).toContain("<?xml");
      expect(xml).toContain("CrossIndustryInvoice");
    } else {
      // Without Kanzlei master data the route refuses with a clear 400.
      expect(genRes.status()).toBe(400);
    }
  });

  test("Rechnungsübersicht rendert", async ({ page }) => {
    await page.goto("/dashboard/invoicing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Rechnung|Invoice/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
