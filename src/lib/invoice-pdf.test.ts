// @vitest-environment jsdom

import { describe, test, expect, vi } from "vitest";

vi.mock("jspdf", () => {
  const mockDoc = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setFont: vi.fn(),
    text: vi.fn(),
    addPage: vi.fn(),
    save: vi.fn(),
    output: vi.fn(() => "blob"),
    splitTextToSize: vi.fn((s: string) => [s]),
    getLastAutoTable: { finalY: 100 },
  };
  return {
    jsPDF: vi.fn(() => {
      Object.defineProperty(mockDoc, "lastAutoTable", {
        value: { finalY: 100 },
        writable: true,
      });
      return mockDoc;
    }),
  };
});

vi.mock("jspdf-autotable", () => ({
  default: vi.fn((doc: any) => {
    (doc as any).lastAutoTable = { finalY: 100 };
  }),
}));

import { generateInvoicePdf, type InvoicePdfData } from "./invoice-pdf";

function makeInvoiceData(overrides: Partial<InvoicePdfData> = {}): InvoicePdfData {
  return {
    number: "R-2024-001",
    client: "Max Mustermann",
    date: "2024-06-01",
    dueDate: "2024-06-15",
    items: [
      { description: "Beratung", date: "2024-05-30", hours: 2.5, rate: 200, amount: 500 },
    ],
    expenses: [
      { description: "Gerichtskosten", date: "2024-05-28", amount: 50 },
    ],
    subtotal: 500,
    expenseTotal: 50,
    advancePayment: 0,
    vatRate: 20,
    tax: 110,
    total: 660,
    kanzlei: {
      name: "Mustermann Kanzlei",
      anwaltName: "Dr. Mustermann",
      adresse: "Hauptstr. 1\n1010 Wien",
      email: "office@mustermann.at",
      telefon: "+43 1 234",
      ustId: "ATU123",
    },
    ...overrides,
  };
}

describe("generateInvoicePdf", () => {
  test("returns a jsPDF document", () => {
    const doc = generateInvoicePdf(makeInvoiceData());
    expect(doc).toBeDefined();
    expect(doc.internal).toBeDefined();
  });

  test("does not throw with minimal data", () => {
    const minimal = makeInvoiceData({
      kanzlei: { name: "Kanzlei" },
      items: [],
      expenses: [],
    });
    expect(() => generateInvoicePdf(minimal)).not.toThrow();
  });

  test("does not throw with full data", () => {
    const full = makeInvoiceData({
      clientAddress: "Client Str. 1\nWien",
      caseNumber: "AZ-123/24",
      paymentTerms: "Zahlbar innerhalb 14 Tagen",
      bank: { name: "Erste Bank", iban: "AT00 1234", bic: "GIBA" },
      notes: "Vielen Dank",
    });
    expect(() => generateInvoicePdf(full)).not.toThrow();
  });

  test("handles empty kanzlei name", () => {
    const data = makeInvoiceData({ kanzlei: { name: "" } });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles multiple items", () => {
    const data = makeInvoiceData({
      items: [
        { description: "Beratung", date: "2024-05-30", hours: 2, rate: 200, amount: 400 },
        { description: "Schriftsatz", date: "2024-05-31", hours: 3, rate: 250, amount: 750 },
        { description: "Verhandlung", date: "2024-06-01", hours: 1, rate: 300, amount: 300 },
      ],
    });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles multiple expenses", () => {
    const data = makeInvoiceData({
      expenses: [
        { description: "Gerichtskosten", date: "2024-05-28", amount: 50 },
        { description: "Kopien", date: "2024-05-29", amount: 10 },
      ],
    });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles zero amounts", () => {
    const data = makeInvoiceData({
      items: [{ description: "Pro bono", date: "2024-05-30", hours: 0, rate: 0, amount: 0 }],
      expenses: [],
      subtotal: 0,
      expenseTotal: 0,
      tax: 0,
      total: 0,
    });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles advance payment", () => {
    const data = makeInvoiceData({
      advancePayment: 200,
      total: 460,
    });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles multi-line client address", () => {
    const data = makeInvoiceData({
      clientAddress: "Firma GmbH\nHauptstr. 42\n1010 Wien\nÖsterreich",
    });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles multi-line kanzlei adresse", () => {
    const data = makeInvoiceData({
      kanzlei: {
        name: "Kanzlei",
        adresse: "Str. 1\n1010 Wien\nÖsterreich",
        ustId: "ATU999",
        kammerNummer: "RAK 123",
      },
    });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles no client address (uses client name)", () => {
    const data = makeInvoiceData({ clientAddress: undefined });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles no expenses", () => {
    const data = makeInvoiceData({ expenses: [], expenseTotal: 0 });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });

  test("handles no items", () => {
    const data = makeInvoiceData({ items: [], subtotal: 0, tax: 0, total: 0 });
    expect(() => generateInvoicePdf(data)).not.toThrow();
  });
});
