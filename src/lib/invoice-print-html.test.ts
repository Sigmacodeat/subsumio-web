import { describe, expect, it } from "vitest";
import { invoicePrintHtml } from "./invoice-print-html";
import { invoiceFromPage } from "./invoicing-view";

const invoice = invoiceFromPage({
  slug: "invoice/r-1",
  title: "R-1",
  created_at: "2026-03-01",
  frontmatter: {
    invoice_number: "R-2026-<1>",
    client: 'Müller & Söhne <script>alert("x")</script>',
    subtotal: 1000,
    tax: 200,
    total: 1200,
    items: [{ description: "Klage <b>", date: "2026-03-01", hours: 2.5, rate: 400, amount: 1000 }],
  },
});

describe("invoicePrintHtml (QA-13)", () => {
  const html = invoicePrintHtml(
    invoice,
    { kanzleiName: "Kanzlei & Partner", ustId: "ATU123" } as never,
    0.2,
    "de"
  );

  it("escapes every user-supplied value", () => {
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Müller &amp; Söhne &lt;script&gt;");
    expect(html).toContain("Klage &lt;b&gt;");
    expect(html).toContain("<title>Rechnung R-2026-&lt;1&gt;</title>");
    expect(html).toContain("Kanzlei &amp; Partner");
  });

  it("prints amounts in Austrian format with the VAT rate", () => {
    expect(html).toContain("2,50");
    expect(html).toContain("1.000,00");
    expect(html).toContain("Mehrwertsteuer (20%)");
    expect(html).toMatch(/Gesamtbetrag<\/span><span>€\s?1\.200,00/);
  });
});
