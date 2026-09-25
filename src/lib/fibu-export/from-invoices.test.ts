import { describe, expect, it } from "vitest";
import { bookingInputsForPeriod, invoiceBookingInputs } from "./from-invoices";
import { generateBmdExport } from "./bmd";
import { generateRzlExport } from "./rzl";

const config = { debitorKonto: 20000, erloesKonto: 4000 };
const codes = { 20: "01", 0: "00" };

const invoice = (fm: Record<string, unknown>) => ({
  slug: `inv/${fm.invoice_number}`,
  frontmatter: fm,
});

const withAdvance = invoice({
  invoice_number: "R-2026-0001",
  status: "sent",
  date: "2026-09-10",
  client: "Mandant",
  items: [{ amount: 1000 }],
  vat_rate: 0.2,
  advance_payment: 600,
  subtotal: 1000,
  tax: 200,
  total: 600,
});

function bmdAmounts(csv: string): number[] {
  const [header, ...rows] = csv.trim().split("\r\n");
  const idx = header.split(";").indexOf("Betrag");
  return rows.map((r) => Number(r.split(";")[idx].replace(",", ".")));
}

describe("invoiceBookingInputs (GELD-18 / GELD-3)", () => {
  it("advance payment: booked amount is net + VAT (1200/200), not the payable rest", () => {
    const [e] = invoiceBookingInputs(withAdvance);
    expect(e).toMatchObject({ net: 1000, vat: 200, gross: 1200, vatRatePercent: 20 });
    const csv = generateBmdExport([e], config, codes);
    expect(csv).toContain(";1200,00;");
    expect(csv).toContain(";200,00;");
  });

  it("original + Storno-Note in the period add up to 0", () => {
    const storno = invoice({
      invoice_number: "R-2026-0002",
      status: "sent",
      date: "2026-09-12",
      client: "Mandant",
      invoice_type: "storno",
      items: [{ amount: -1000 }],
      vat_rate: 0.2,
      advance_payment: -600,
      subtotal: -1000,
      tax: -200,
      total: -600,
    });
    const entries = bookingInputsForPeriod([withAdvance, storno], "2026-09-01", "2026-09-30");
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ invoiceType: "storno", gross: 1200, vat: 200 });
    const amounts = bmdAmounts(generateBmdExport(entries, config, codes));
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(0);
    // RZL too: the sign is applied exactly once.
    const rzl = generateRzlExport(entries, config);
    expect(rzl).toContain("-1200,00");
  });

  it("one booking per VAT rate (fee 20 %, court fee 0 %)", () => {
    const entries = invoiceBookingInputs(
      invoice({
        invoice_number: "R-2026-0003",
        status: "paid",
        date: "2026-09-15",
        items: [{ amount: 1000 }],
        expenses: [{ amount: 100, vat_rate: 0 }],
        vat_rate: 0.2,
        subtotal: 1000,
        expense_total: 100,
        tax: 200,
        total: 1300,
      })
    );
    expect(entries.map((e) => [e.vatRatePercent, e.net, e.vat, e.gross])).toEqual([
      [20, 1000, 200, 1200],
      [0, 100, 0, 100],
    ]);
  });

  it("drafts are not booked", () => {
    expect(invoiceBookingInputs(invoice({ ...withAdvance.frontmatter, status: "draft" }))).toEqual(
      []
    );
  });
});
