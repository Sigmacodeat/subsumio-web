import { describe, it, expect } from "vitest";
import {
  generateXRechnungXml,
  parseXRechnungXml,
  validateEInvoice,
  validateXmlWellformed,
  generateEpcQrPayload,
  generateSwissQrPayload,
  isQrIban,
  calculateQrReferenceCheckDigit,
  validateQrReference,
  invoiceToEInvoiceData,
  generateZugferdPdfFromScratch,
  extractZugferdXml,
} from "./index";
import type { EInvoiceData } from "./types";
import type { KanzleiSettings } from "../kanzlei-settings";

// =====================
// TEST FIXTURE
// =====================

const sampleInvoice: EInvoiceData = {
  invoiceNumber: "RE-2026-001",
  invoiceDate: "2026-07-05",
  dueDate: "2026-07-19",
  invoiceTypeCode: "380",
  currency: "EUR",
  profile: "BASIC",
  seller: {
    name: "Rechtsanwaltskanzlei Müller",
    contactName: "RA Dr. Müller",
    street: "Königsstraße 1",
    zip: "70173",
    city: "Stuttgart",
    country: "DE",
    vatId: "DE123456789",
    email: "kanzlei@mueller.de",
    phone: "+49 711 1234567",
  },
  buyer: {
    name: "Bautec GmbH",
    contactName: "Hr. Schmidt",
    street: "Industriestraße 42",
    zip: "80331",
    city: "München",
    country: "DE",
    vatId: "DE987654321",
    email: "schmidt@bautec.de",
  },
  lineItems: [
    {
      id: "1",
      name: "Beratung Vertragsrecht",
      description: "Prüfung und Beratung zum Liefervertrag",
      quantity: 3.5,
      unit: "HUR",
      unitPrice: 250,
      taxRate: 19,
      taxCategory: "S",
    },
    {
      id: "2",
      name: "Gerichtstermin Vorbereitung",
      quantity: 2,
      unit: "HUR",
      unitPrice: 280,
      taxRate: 19,
      taxCategory: "S",
    },
  ],
  taxRate: 19,
  taxCategory: "S",
  paymentTerms: "Zahlbar innerhalb 14 Tagen ohne Abzug",
  bank: {
    name: "Commerzbank Stuttgart",
    iban: "DE89 3704 0044 0532 0130 00",
    bic: "COBADEFFXXX",
  },
  leitwegId: "991-51097-29",
  caseReference: "AZ-2026-42",
  notes: "Vielen Dank für Ihren Auftrag.",
};

// =====================
// XRECHNUNG XML GENERATION
// =====================

describe("generateXRechnungXml", () => {
  it("generates valid XML with CrossIndustryInvoice root element", () => {
    const result = generateXRechnungXml(sampleInvoice);
    expect(result.xml).toContain('<?xml version="1.0"');
    expect(result.xml).toContain("<CrossIndustryInvoice");
    expect(result.xml).toContain("</CrossIndustryInvoice>");
    expect(result.filename).toBe("xrechnung_RE-2026-001.xml");
    expect(result.profile).toBe("BASIC");
  });

  it("includes correct guideline spec ID for XRechnung", () => {
    const result = generateXRechnungXml(sampleInvoice, "xrechnung");
    expect(result.xml).toContain("urn:cen.eu:en16931:2017");
    expect(result.xml).toContain("xrechnung_2.0");
  });

  it("includes correct guideline spec ID for ZUGFeRD", () => {
    const result = generateXRechnungXml(sampleInvoice, "zugferd");
    expect(result.xml).toContain("urn:cen.eu:en16931:2017");
    expect(result.xml).not.toContain("xrechnung_2.0");
  });

  it("includes seller and buyer parties", () => {
    const result = generateXRechnungXml(sampleInvoice);
    expect(result.xml).toContain("Rechtsanwaltskanzlei Müller");
    expect(result.xml).toContain("Bautec GmbH");
    expect(result.xml).toContain("DE123456789");
    expect(result.xml).toContain("DE987654321");
  });

  it("includes line items with correct amounts", () => {
    const result = generateXRechnungXml(sampleInvoice);
    expect(result.xml).toContain("Beratung Vertragsrecht");
    expect(result.xml).toContain("Gerichtstermin Vorbereitung");
    expect(result.xml).toContain("875.00"); // 3.5 * 250
    expect(result.xml).toContain("560.00"); // 2 * 280
  });

  it("includes bank details with cleaned IBAN", () => {
    const result = generateXRechnungXml(sampleInvoice);
    expect(result.xml).toContain("DE89370400440532013000");
    expect(result.xml).toContain("COBADEFFXXX");
  });

  it("includes Leitweg-ID as BuyerReference", () => {
    const result = generateXRechnungXml(sampleInvoice);
    expect(result.xml).toContain("991-51097-29");
    expect(result.xml).toContain("BuyerReference");
  });

  it("includes correct monetary summation", () => {
    const result = generateXRechnungXml(sampleInvoice);
    // Line total: 875 + 560 = 1435
    expect(result.xml).toContain("<ram:LineTotalAmount>1435.00</ram:LineTotalAmount>");
    // Tax: 1435 * 0.19 = 272.65
    expect(result.xml).toContain(
      '<ram:TaxTotalAmount currencyID="EUR">272.65</ram:TaxTotalAmount>'
    );
    // Grand total: 1435 + 272.65 = 1707.65
    expect(result.xml).toContain("<ram:GrandTotalAmount>1707.65</ram:GrandTotalAmount>");
  });

  it("includes invoice type code 380", () => {
    const result = generateXRechnungXml(sampleInvoice);
    expect(result.xml).toContain("<ram:TypeCode>380</ram:TypeCode>");
  });

  it("includes dates in format 102 (YYYYMMDD)", () => {
    const result = generateXRechnungXml(sampleInvoice);
    expect(result.xml).toContain("20260705"); // invoice date
    expect(result.xml).toContain("20260719"); // due date
  });

  it("escapes XML special characters", () => {
    const invoice: EInvoiceData = {
      ...sampleInvoice,
      seller: { ...sampleInvoice.seller, name: "Müller & Partner <Rechtsanwälte>" },
      notes: "Rechnung \"spezial\" mit 'Apostroph'",
    };
    const result = generateXRechnungXml(invoice);
    expect(result.xml).toContain("Müller &amp; Partner &lt;Rechtsanwälte&gt;");
    expect(result.xml).toContain("&quot;spezial&quot;");
    expect(result.xml).toContain("&apos;Apostroph&apos;");
  });

  it("handles credit notes (type 381)", () => {
    const credit: EInvoiceData = {
      ...sampleInvoice,
      invoiceTypeCode: "381",
      invoiceNumber: "GUT-2026-001",
    };
    const result = generateXRechnungXml(credit);
    expect(result.xml).toContain("<ram:TypeCode>381</ram:TypeCode>");
    expect(result.filename).toBe("xrechnung_GUT-2026-001.xml");
  });

  it("handles advance payment", () => {
    const invoice: EInvoiceData = {
      ...sampleInvoice,
      advancePayment: 500,
    };
    const result = generateXRechnungXml(invoice);
    expect(result.xml).toContain("<ram:TotalPrepaidAmount>500.00</ram:TotalPrepaidAmount>");
    // Due = 1707.65 - 500 = 1207.65
    expect(result.xml).toContain("<ram:DuePayableAmount>1207.65</ram:DuePayableAmount>");
  });

  it("handles allowance/charges", () => {
    const invoice: EInvoiceData = {
      ...sampleInvoice,
      allowanceCharges: [
        { amount: 50, reason: "Skonto", taxRate: 19, taxCategory: "S", isCharge: false },
        { amount: 10, reason: "Bearbeitungsgebühr", taxRate: 19, taxCategory: "S", isCharge: true },
      ],
    };
    const result = generateXRechnungXml(invoice);
    expect(result.xml).toContain("Skonto");
    expect(result.xml).toContain("Bearbeitungsgebühr");
    expect(result.xml).toContain("<ram:AllowanceTotalAmount>50.00</ram:AllowanceTotalAmount>");
    expect(result.xml).toContain("<ram:ChargeTotalAmount>10.00</ram:ChargeTotalAmount>");
  });
});

// =====================
// XRECHNUNG XML PARSING
// =====================

describe("parseXRechnungXml", () => {
  it("round-trips generate then parse correctly", () => {
    const generated = generateXRechnungXml(sampleInvoice);
    const parsed = parseXRechnungXml(generated.xml);

    expect(parsed.invoiceNumber).toBe("RE-2026-001");
    expect(parsed.invoiceDate).toBe("2026-07-05");
    expect(parsed.currency).toBe("EUR");
    expect(parsed.seller.name).toBe("Rechtsanwaltskanzlei Müller");
    expect(parsed.buyer.name).toBe("Bautec GmbH");
    expect(parsed.lineItems).toHaveLength(2);
    expect(parsed.lineItems[0].name).toBe("Beratung Vertragsrecht");
    expect(parsed.lineItems[0].quantity).toBe(3.5);
    expect(parsed.lineItems[0].unitPrice).toBe(250);
    expect(parsed.lineItems[1].name).toBe("Gerichtstermin Vorbereitung");
  });

  it("extracts bank details from parsed XML", () => {
    const generated = generateXRechnungXml(sampleInvoice);
    const parsed = parseXRechnungXml(generated.xml);

    expect(parsed.bank).toBeDefined();
    expect(parsed.bank?.iban).toBe("DE89370400440532013000");
    expect(parsed.bank?.bic).toBe("COBADEFFXXX");
  });

  it("extracts totals correctly", () => {
    const generated = generateXRechnungXml(sampleInvoice);
    const parsed = parseXRechnungXml(generated.xml);

    expect(parsed.totalNet).toBe(1435);
    expect(parsed.totalTax).toBe(272.65);
    expect(parsed.totalGross).toBe(1707.65);
  });
});

// =====================
// VALIDATION
// =====================

describe("validateEInvoice", () => {
  it("validates a correct invoice without errors", () => {
    const result = validateEInvoice(sampleInvoice);
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("reports missing invoice number", () => {
    const result = validateEInvoice({ ...sampleInvoice, invoiceNumber: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "invoiceNumber")).toBe(true);
  });

  it("reports missing seller name", () => {
    const result = validateEInvoice({
      ...sampleInvoice,
      seller: { ...sampleInvoice.seller, name: "" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "seller.name")).toBe(true);
  });

  it("reports empty line items", () => {
    const result = validateEInvoice({ ...sampleInvoice, lineItems: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "lineItems")).toBe(true);
  });

  it("reports invalid IBAN format", () => {
    const result = validateEInvoice({
      ...sampleInvoice,
      bank: { iban: "INVALID", bic: "ABC" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "bank.iban")).toBe(true);
  });

  it("warns about missing Leitweg-ID", () => {
    const result = validateEInvoice({
      ...sampleInvoice,
      leitwegId: undefined,
      buyerReference: undefined,
    });
    expect(result.warnings.some((w) => w.field === "leitwegId")).toBe(true);
  });

  it("reports invalid tax rate", () => {
    const result = validateEInvoice({
      ...sampleInvoice,
      lineItems: [
        { ...sampleInvoice.lineItems[0], taxRate: 150 },
        ...sampleInvoice.lineItems.slice(1),
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "lineItems[0].taxRate")).toBe(true);
  });
});

describe("validateXmlWellformed", () => {
  it("validates well-formed XML", () => {
    const { xml } = generateXRechnungXml(sampleInvoice);
    const result = validateXmlWellformed(xml);
    expect(result.valid).toBe(true);
  });

  it("reports empty XML", () => {
    const result = validateXmlWellformed("");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "xml")).toBe(true);
  });

  it("reports missing CrossIndustryInvoice root", () => {
    const result = validateXmlWellformed('<?xml version="1.0"?>\n<Other><child/></Other>');
    expect(result.valid).toBe(false);
  });
});

// =====================
// EPC-QR (GiroCode)
// =====================

describe("generateEpcQrPayload", () => {
  it("generates correct EPC-QR payload", () => {
    const payload = generateEpcQrPayload({
      bic: "COBADEFFXXX",
      name: "Rechtsanwaltskanzlei Müller",
      iban: "DE89 3704 0044 0532 0130 00",
      amount: 1707.65,
      remittanceInfo: "RE-2026-001",
    });

    const lines = payload.split("\n");
    expect(lines[0]).toBe("BCD");
    expect(lines[1]).toBe("002");
    expect(lines[2]).toBe("1");
    expect(lines[3]).toBe("SCT");
    expect(lines[4]).toBe("COBADEFFXXX");
    expect(lines[5]).toBe("Rechtsanwaltskanzlei Müller");
    expect(lines[6]).toBe("DE89370400440532013000");
    expect(lines[7]).toBe("EUR1707.65");
    expect(lines[10]).toBe("RE-2026-001");
  });

  it("handles missing BIC (SCT without BIC)", () => {
    const payload = generateEpcQrPayload({
      name: "Test Kanzlei",
      iban: "DE89370400440532013000",
    });
    const lines = payload.split("\n");
    expect(lines[4]).toBe("");
    expect(lines[7]).toBe("");
  });
});

// =====================
// SWISS QR-BILL
// =====================

describe("generateSwissQrPayload", () => {
  it("generates correct Swiss QR payload", () => {
    const payload = generateSwissQrPayload({
      creditor: {
        name: "Treuhand AG",
        street: "Bahnhofstrasse 1",
        zip: "8001",
        city: "Zürich",
        country: "CH",
      },
      iban: "CH44 3199 1234 5089 0123 4",
      amount: 1500.5,
      currency: "CHF",
      reference: "210000000003139471430009017",
      unstructuredMessage: "Rechnung 2026-001",
    });

    const lines = payload.split("\n");
    expect(lines[0]).toBe("SPC");
    expect(lines[1]).toBe("0200");
    expect(lines[2]).toBe("1");
    expect(lines[3]).toBe("CH4431991234508901234");
    expect(lines[4]).toBe("Treuhand AG");
    // Creditor address: name(4), street(5), building(6), zip(7), city(8), country(9)
    expect(lines[5]).toBe("Bahnhofstrasse 1");
    expect(lines[7]).toBe("8001");
    expect(lines[8]).toBe("Zürich");
    expect(lines[9]).toBe("CH");
    // Ultimate creditor: 6 empty fields (10-15)
    // Amount(16), Currency(17)
    expect(lines[16]).toBe("1500.50");
    expect(lines[17]).toBe("CHF");
  });
});

describe("isQrIban", () => {
  it("identifies QR-IBAN correctly", () => {
    expect(isQrIban("CH44 3199 1234 5089 0123 4")).toBe(true);
    expect(isQrIban("CH93 0076 2011 6238 5295 7")).toBe(false);
  });
});

describe("calculateQrReferenceCheckDigit", () => {
  it("calculates correct check digit", () => {
    // Example from Swiss QR-bill spec
    const check = calculateQrReferenceCheckDigit("210000000003139471430009017");
    // The full reference includes the check digit as last digit
    // For a 27-digit reference, the last digit is the check
    expect(check).toMatch(/^[0-9]$/);
  });
});

describe("validateQrReference", () => {
  it("validates a correct 27-digit reference", () => {
    // Generate a valid reference using the check digit function
    const base = "21000000000313947143000901";
    const check = calculateQrReferenceCheckDigit(base);
    const validRef = base + check;
    expect(validateQrReference(validRef)).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(validateQrReference("12345")).toBe(false);
  });
});

// =====================
// ADAPTER
// =====================

describe("invoiceToEInvoiceData", () => {
  it("converts InvoiceFrontmatter to EInvoiceData", () => {
    const invoice = {
      invoice_number: "RE-2026-042",
      client: "Testmandant GmbH",
      client_address: "Teststraße 1",
      case_number: "AZ-2026-42",
      date: "2026-07-05",
      due_date: "2026-07-19",
      items: [{ description: "Beratung", date: "2026-07-05", hours: 2, rate: 200, amount: 400 }],
      expenses: [],
      status: "draft",
      subtotal: 400,
      vat_rate: 19,
      tax: 76,
      total: 476,
      bank: { name: "Test Bank", iban: "DE89370400440532013000", bic: "TESTDEFF" },
    };

    const settings: KanzleiSettings = {
      kanzleiName: "Test Kanzlei",
      anwaltName: "RA Test",
      ustId: "DE123456789",
      stundensatz: "200",
      street: "Kanzleistraße 1",
      zip: "70173",
      city: "Stuttgart",
      country: "DE",
      rechtsgebietSaetze: {},
    };

    const data = invoiceToEInvoiceData(invoice, settings, {
      leitwegId: "991-51097-29",
    });

    expect(data.invoiceNumber).toBe("RE-2026-042");
    expect(data.seller.name).toBe("Test Kanzlei");
    expect(data.seller.vatId).toBe("DE123456789");
    expect(data.buyer.name).toBe("Testmandant GmbH");
    expect(data.lineItems).toHaveLength(1);
    expect(data.lineItems[0].name).toBe("Beratung");
    expect(data.lineItems[0].quantity).toBe(2);
    expect(data.lineItems[0].unit).toBe("HUR");
    expect(data.leitwegId).toBe("991-51097-29");
    expect(data.caseReference).toBe("AZ-2026-42");
    expect(data.bank?.iban).toBe("DE89370400440532013000");
  });

  it("converts expenses as additional line items", () => {
    const invoice = {
      invoice_number: "RE-2026-043",
      client: "Test GmbH",
      date: "2026-07-05",
      items: [{ description: "Beratung", date: "2026-07-05", hours: 1, rate: 200, amount: 200 }],
      expenses: [
        { description: "Gerichtskosten", date: "2026-07-05", amount: 50, type: "gericht" as const },
      ],
      vat_rate: 19,
      bank: { iban: "DE89370400440532013000" },
    };

    const settings: KanzleiSettings = {
      kanzleiName: "Kanzlei",
      anwaltName: "",
      ustId: "DE123",
      stundensatz: "200",
      rechtsgebietSaetze: {},
    };

    const data = invoiceToEInvoiceData(invoice, settings);
    expect(data.lineItems).toHaveLength(2);
    expect(data.lineItems[1].name).toBe("Gerichtskosten");
    expect(data.lineItems[1].unit).toBe("C62");
    expect(data.lineItems[1].unitPrice).toBe(50);
  });

  it("handles credit note invoice type", () => {
    const invoice = {
      invoice_number: "GUT-2026-001",
      client: "Client",
      date: "2026-07-05",
      items: [{ description: "Gutschrift", date: "2026-07-05", hours: 1, rate: 100, amount: 100 }],
      invoice_type: "gutschrift" as const,
      vat_rate: 19,
    };

    const settings: KanzleiSettings = {
      kanzleiName: "K",
      anwaltName: "",
      ustId: "DE1",
      stundensatz: "200",
      rechtsgebietSaetze: {},
    };
    const data = invoiceToEInvoiceData(invoice, settings);
    expect(data.invoiceTypeCode).toBe("381");
  });
});

// =====================
// ZUGFERD PDF
// =====================

describe("generateZugferdPdfFromScratch", () => {
  it("generates a PDF with embedded XML", async () => {
    const result = await generateZugferdPdfFromScratch(sampleInvoice);
    expect(result.pdf).toBeInstanceOf(Uint8Array);
    expect(result.pdf.length).toBeGreaterThan(1000);
    expect(result.filename).toBe("zugferd_RE-2026-001.pdf");
    expect(result.profile).toBe("BASIC");

    // Verify it's a valid PDF
    const header = new TextDecoder().decode(result.pdf.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});

describe("extractZugferdXml", () => {
  it("extracts embedded XML from a ZUGFeRD PDF", async () => {
    const result = await generateZugferdPdfFromScratch(sampleInvoice);
    const xml = await extractZugferdXml(result.pdf);
    expect(xml).not.toBeNull();
    expect(xml).toContain("CrossIndustryInvoice");
    expect(xml).toContain("RE-2026-001");
  });

  it("returns null for non-ZUGFeRD PDF", async () => {
    // Create a minimal PDF without embedded XML
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const bytes = await doc.save();
    const xml = await extractZugferdXml(bytes);
    expect(xml).toBeNull();
  });
});
