import { describe, expect, it } from "vitest";
import {
  eInvoicePayload,
  invoiceCaseFromPage,
  invoiceErrorText,
  invoiceFromPage,
  invoiceOverview,
  sumOfTotals,
  type Invoice,
} from "./invoicing-view";
import * as mod from "./invoicing-view";

const page = (frontmatter: Record<string, unknown>) => ({
  slug: "invoice/r-1",
  title: "R-1",
  created_at: "2026-03-01T10:00:00Z",
  frontmatter,
});

describe("invoiceFromPage (QA-13)", () => {
  it("reads the stored invoice fields", () => {
    const inv = invoiceFromPage(
      page({
        invoice_number: "R-2026-0001",
        client: "Mandant",
        status: "sent",
        total: 120,
        tax: 20,
        vat_rate: 0.1,
        reverse_charge: true,
        items: [{ description: "Beratung", date: "2026-03-01", hours: 1, rate: 100, amount: 100 }],
      })
    );
    expect(inv).toMatchObject({
      id: "invoice/r-1",
      number: "R-2026-0001",
      client: "Mandant",
      status: "sent",
      total: 120,
      tax: 20,
      vatRate: 0.1,
      reverseCharge: true,
      date: "2026-03-01T10:00:00Z",
    });
    expect(inv.items).toHaveLength(1);
  });

  it("falls back for missing fields", () => {
    const inv = invoiceFromPage(page({}));
    expect(inv).toMatchObject({
      number: "invoice/r-1",
      client: "",
      status: "draft",
      subtotal: 0,
      total: 0,
      vatRate: 0.2,
      reverseCharge: false,
      items: [],
      expenses: [],
    });
  });

  it("maps a matter", () => {
    expect(
      invoiceCaseFromPage({
        slug: "cases/a",
        title: "A gg B",
        created_at: "",
        frontmatter: { client_name: "A" },
      })
    ).toMatchObject({ slug: "cases/a", caseNumber: "cases/a", clientName: "A", timeEntries: [] });
  });
});

describe("invoice overview (QA-13)", () => {
  const inv = (status: Invoice["status"], total: number) =>
    ({ ...invoiceFromPage(page({})), status, total }) as Invoice;

  it("groups by status and sums in cents", () => {
    const list = [inv("draft", 0.1), inv("draft", 0.2), inv("sent", 10), inv("overdue", 5.55)];
    const o = invoiceOverview(list);
    expect(o.drafts).toHaveLength(2);
    expect(o.outstanding).toHaveLength(2);
    expect(o.overdueCount).toBe(1);
    expect(o.paid).toHaveLength(0);
    expect(sumOfTotals(o.drafts)).toBe(0.3);
    expect(sumOfTotals(o.outstanding)).toBe(15.55);
  });
});

describe("eInvoicePayload / invoiceErrorText (QA-13)", () => {
  it("sends the snake_case invoice fields", () => {
    const p = eInvoicePayload({
      ...invoiceFromPage(page({ invoice_number: "R-1", leitweg_id: "L" })),
    });
    expect(p).toMatchObject({ invoice_number: "R-1", leitweg_id: "L", vat_rate: 0.2 });
  });

  it("never shows a raw code", () => {
    expect(invoiceErrorText("smtp_not_configured", "x")).toMatch(/E-Mail-Versand/);
    expect(invoiceErrorText("some_code", "Standardtext")).toBe("Standardtext");
  });
});

describe("invoicingDeepLink / invoiceCaseSlug (W4-01, W4-12)", () => {
  it("reads the matter to preset and the invoice to show from the link", () => {
    const { invoicingDeepLink } = mod;
    expect(invoicingDeepLink(new URLSearchParams("case=legal%2Fcases%2Fa"))).toEqual({
      presetCaseSlug: "legal/cases/a",
    });
    expect(invoicingDeepLink(new URLSearchParams("invoice=R-2026-0001"))).toEqual({
      invoiceQuery: "R-2026-0001",
    });
    expect(invoicingDeepLink(new URLSearchParams("case=%20"))).toEqual({});
  });

  it("links an invoice to the matter it was issued for", () => {
    const { invoiceCaseSlug } = mod;
    expect(invoiceCaseSlug({ caseSlugs: ["legal/cases/a"] })).toBe("legal/cases/a");
    expect(invoiceCaseSlug({ caseSlugs: [] })).toBeUndefined();
    expect(invoiceCaseSlug({})).toBeUndefined();
  });
});
