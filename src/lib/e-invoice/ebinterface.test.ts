import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EBINTERFACE_NAMESPACE,
  EBINTERFACE_NO_VAT_ID,
  generateEbInterfaceXml,
} from "./ebinterface";
import type { EInvoiceData } from "./types";

const invoice: EInvoiceData = {
  invoiceNumber: "2026/0042",
  invoiceDate: "2026-09-18",
  dueDate: "2026-10-02",
  invoiceTypeCode: "380",
  currency: "EUR",
  profile: "BASIC",
  seller: {
    name: "Kanzlei Beispiel & Partner",
    contactName: "Dr. Alice Beispiel",
    street: "Wollzeile 1",
    zip: "1010",
    city: "Wien",
    country: "AT",
    vatId: "ATU12345678",
    email: "office@kanzlei-beispiel.at",
  },
  buyer: {
    name: "Widget GmbH",
    street: "Hauptplatz 3",
    zip: "8010",
    city: "Graz",
    country: "AT",
  },
  lineItems: [
    {
      id: "1",
      name: "Klage (TP 3A RATG)",
      quantity: 1,
      unit: "C62",
      unitPrice: 1234.567,
      taxRate: 20,
      taxCategory: "S",
    },
    {
      id: "2",
      name: "Besprechung",
      description: "Besprechung mit dem Mandanten",
      quantity: 1.5,
      unit: "HUR",
      unitPrice: 280,
      taxRate: 20,
      taxCategory: "S",
    },
    {
      id: "3",
      name: "Gerichtsgebühr (Barauslage)",
      quantity: 1,
      unit: "C62",
      unitPrice: 427,
      taxRate: 0,
      taxCategory: "E",
    },
  ],
  taxRate: 20,
  taxCategory: "S",
  bank: { name: "Erste Bank", iban: "AT61 1904 3002 3457 3201", bic: "GIBAATWWXXX" },
  buyerReference: "4500012345",
  caseReference: "QA-2026-001",
  paymentTerms: "Zahlbar binnen 14 Tagen",
  taxExemptionReason: "Durchlaufender Posten (§ 4 Abs 3 UStG)",
};

function amountOf(xml: string, tag: string): number {
  const m = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`));
  if (!m) throw new Error(`missing ${tag}`);
  return Number(m[1]);
}

describe("generateEbInterfaceXml", () => {
  const { xml, filename } = generateEbInterfaceXml(invoice);

  it("produces well-formed XML in the 6.1 namespace", () => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.documentElement.localName).toBe("Invoice");
    expect(xml).toContain(`xmlns="${EBINTERFACE_NAMESPACE}"`);
    expect(filename).toBe("ebInterface_2026_0042.xml");
  });

  it("adds up: sum of tax items equals the gross total", () => {
    // Lines: 1234.57 + 420.00 at 20 %, 427.00 exempt.
    const taxSection = xml.slice(xml.indexOf("<Tax>"), xml.indexOf("</Tax>"));
    const taxable = [...taxSection.matchAll(/<TaxableAmount>([^<]+)</g)].map((m) => Number(m[1]));
    const tax = [...taxSection.matchAll(/<TaxAmount>([^<]+)</g)].map((m) => Number(m[1]));
    expect(taxable).toEqual([1654.57, 427]);
    expect(tax).toEqual([330.91, 0]);
    expect(amountOf(xml, "TotalGrossAmount")).toBe(2412.48);
    expect(amountOf(xml, "PayableAmount")).toBe(2412.48);
  });

  it("carries the order reference the federal portal requires", () => {
    expect(xml).toMatch(/<InvoiceRecipient>[\s\S]*<OrderID>4500012345<\/OrderID>/);
  });

  it("uses the no-VAT-ID placeholder for a recipient without UID", () => {
    expect(xml).toMatch(
      new RegExp(
        `<InvoiceRecipient>\\s*<VATIdentificationNumber>${EBINTERFACE_NO_VAT_ID}</VATIdentificationNumber>`
      )
    );
  });

  it("names the legal basis on exempt tax items only", () => {
    expect(xml.match(/Durchlaufender Posten/g)?.length).toBe(1);
  });

  it("escapes markup in names", () => {
    expect(xml).toContain("Kanzlei Beispiel &amp; Partner");
  });

  it("subtracts a prepayment", () => {
    const r = generateEbInterfaceXml({ ...invoice, advancePayment: 500 });
    expect(amountOf(r.xml, "PrepaidAmount")).toBe(500);
    expect(amountOf(r.xml, "PayableAmount")).toBe(1912.48);
  });

  it("marks a credit note as CreditMemo", () => {
    expect(generateEbInterfaceXml({ ...invoice, invoiceTypeCode: "381" }).xml).toContain(
      'DocumentType="CreditMemo"'
    );
  });

  // Schema check against the official XSD (github.com/austriapro/
  // ebinterface-standards, schemas/ebInterface6p1/Invoice.xsd). The XSD has
  // no license in that repository, so it is not vendored; point
  // EBINTERFACE_XSD at a local copy to run this.
  const xsd = process.env.EBINTERFACE_XSD;
  const hasXmllint = (() => {
    try {
      execFileSync("xmllint", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  it.skipIf(!xsd || !existsSync(xsd) || !hasXmllint)("validates against the 6.1 XSD", () => {
    const dir = mkdtempSync(join(tmpdir(), "ebi-"));
    const variants = [
      xml,
      generateEbInterfaceXml({ ...invoice, advancePayment: 500, invoiceTypeCode: "381" }).xml,
      generateEbInterfaceXml({
        ...invoice,
        bank: undefined,
        buyerReference: undefined,
        dueDate: undefined,
        paymentTerms: undefined,
        allowanceCharges: [
          {
            amount: 50,
            reason: "Pauschalnachlass",
            taxRate: 20,
            taxCategory: "S",
            isCharge: false,
          },
        ],
      }).xml,
    ];
    variants.forEach((variant, i) => {
      const file = join(dir, `invoice-${i}.xml`);
      writeFileSync(file, variant);
      execFileSync("xmllint", ["--noout", "--schema", xsd as string, file], { stdio: "pipe" });
    });
  });
});
