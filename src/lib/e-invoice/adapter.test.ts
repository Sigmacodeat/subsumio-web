import { describe, expect, it } from "vitest";
import { invoiceToEInvoiceData } from "./adapter";
import { generateXRechnungXml } from "./xrechnung";
import { generateEbInterfaceXml } from "./ebinterface";
import type { InvoiceFrontmatter } from "../legal-types";
import type { KanzleiSettings } from "../kanzlei-settings";

const settings = {
  kanzleiName: "Kanzlei Test",
  country: "AT",
  zip: "1010",
  city: "Wien",
  ustId: "ATU12345678",
} as unknown as KanzleiSettings;

const base: InvoiceFrontmatter = {
  invoice_number: "R-2026-0010",
  client: "Mandant GmbH",
  client_address: "Mandant GmbH\nRing 1\n1010 Wien",
  date: "2026-09-20",
  vat_rate: 0.2,
};

function tag(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<ram:${name}[^>]*>([^<]*)</ram:${name}>`, "g"))].map(
    (m) => m[1]
  );
}

describe("invoiceToEInvoiceData — e-invoice equals the stored invoice (GELD-13)", () => {
  it("20 min à 300 €: line total 100,00 and grand total = stored total", () => {
    const inv: InvoiceFrontmatter = {
      ...base,
      items: [
        { description: "Telefonat", date: "2026-09-19", hours: 0.33, rate: 300, amount: 100 },
      ],
      subtotal: 100,
      tax: 20,
      total: 120,
    };
    const xml = generateXRechnungXml(invoiceToEInvoiceData(inv, settings)).xml;
    expect(tag(xml, "LineTotalAmount")[0]).toBe("100.00");
    expect(tag(xml, "GrandTotalAmount")[0]).toBe("120.00");
    expect(tag(xml, "DuePayableAmount")[0]).toBe("120.00");
    const eb = generateEbInterfaceXml(invoiceToEInvoiceData(inv, settings)).xml;
    expect(eb).toContain("<LineItemAmount>100.00</LineItemAmount>");
    expect(eb).toContain("<TotalGrossAmount>120.00</TotalGrossAmount>");
  });

  it("exact hours stay hours × rate", () => {
    const data = invoiceToEInvoiceData(
      {
        ...base,
        items: [{ description: "B", date: "2026-09-19", hours: 1.5, rate: 200, amount: 300 }],
      },
      settings
    );
    expect(data.lineItems[0]).toMatchObject({ quantity: 1.5, unit: "HUR", unitPrice: 200 });
  });

  it("Storno-Note → credit note 381 with positive amounts and a reference to the original", () => {
    const storno: InvoiceFrontmatter = {
      ...base,
      invoice_number: "R-2026-0011",
      invoice_type: "storno",
      parent_invoice_id: "invoice/1",
      parent_invoice_number: "R-2026-0010",
      parent_invoice_date: "2026-09-01",
      items: [{ description: "Beratung", date: "2026-09-01", hours: 2, rate: 250, amount: -500 }],
      subtotal: -500,
      tax: -100,
      total: -600,
    };
    const data = invoiceToEInvoiceData(storno, settings);
    expect(data.invoiceTypeCode).toBe("381");
    const xml = generateXRechnungXml(data).xml;
    expect(tag(xml, "GrandTotalAmount")[0]).toBe("600.00");
    expect(xml).toContain("<ram:InvoiceReferencedDocument>");
    expect(tag(xml, "IssuerAssignedID")).toContain("R-2026-0010");
    const eb = generateEbInterfaceXml(data).xml;
    expect(eb).toContain('DocumentType="CreditMemo"');
    expect(eb).toContain("<RelatedDocument>");
    expect(eb).toContain("<TotalGrossAmount>600.00</TotalGrossAmount>");
  });
});

describe("invoiceToEInvoiceData — VAT per line (GELD-3 / GELD-15)", () => {
  it("court fee at 0 % is exempt with reason; VAT only on the fee", () => {
    const data = invoiceToEInvoiceData(
      {
        ...base,
        items: [{ description: "Honorar", date: "2026-09-19", hours: 0, rate: 0, amount: 1000 }],
        expenses: [{ description: "Gerichtsgebühr", date: "2026-09-19", amount: 100, vat_rate: 0 }],
      },
      settings
    );
    const xml = generateXRechnungXml(data).xml;
    expect(tag(xml, "TaxTotalAmount")[0]).toBe("200.00");
    expect(tag(xml, "GrandTotalAmount")[0]).toBe("1300.00");
    expect(tag(xml, "ExemptionReason")[0]).toContain("Durchlaufender Posten");
    const eb = generateEbInterfaceXml(data).xml;
    expect(eb).toContain("<TotalGrossAmount>1300.00</TotalGrossAmount>");
  });

  it("reverse charge: category AE, no VAT, mandatory note", () => {
    const data = invoiceToEInvoiceData(
      {
        ...base,
        reverse_charge: true,
        client_vat_id: "DE123456789",
        items: [{ description: "Honorar", date: "2026-09-19", hours: 0, rate: 0, amount: 1000 }],
      },
      settings
    );
    expect(data.lineItems[0]).toMatchObject({ taxCategory: "AE", taxRate: 0 });
    const xml = generateXRechnungXml(data).xml;
    expect(tag(xml, "TaxTotalAmount")[0]).toBe("0.00");
    expect(tag(xml, "ExemptionReason")[0]).toContain("Übergang der Steuerschuld");
  });

  it("Kleinunternehmer reason follows the firm's country", () => {
    const inv = {
      ...base,
      items: [{ description: "H", date: "2026-09-19", hours: 0, rate: 0, amount: 100 }],
    };
    const at = invoiceToEInvoiceData(inv, { ...settings, kleinunternehmer: true });
    expect(at.taxExemptionReason).toContain("§ 6 Abs. 1 Z 27 UStG 1994");
    const de = invoiceToEInvoiceData(inv, { ...settings, country: "DE", kleinunternehmer: true });
    expect(de.taxExemptionReason).toContain("§ 19 Abs. 1 UStG");
    expect(de.taxExemptionReason).not.toContain("1994");
  });
});
