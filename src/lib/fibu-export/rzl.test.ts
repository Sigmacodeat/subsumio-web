import { describe, expect, it } from "vitest";
import { generateRzlExport, rzlRowsForInvoice } from "./rzl";
import { FibuExportInputError, type FibuBookingInput, type FibuExportConfig } from "./types";

const config: FibuExportConfig = { debitorKonto: 20100, erloesKonto: 4120 };

// Transcribed from the RZL primary source ("RZL FIBU Import Schnittstelle",
// Handbuch Datenimport, Kap. 6.3 "Musterbeispiel Ausgangsrechnung Inland
// (in EUR)"), read directly a second time:
//   20100;4120;100;15012025;;EUR;12000,00;0,00;0,00;;0,00;0,00;0;AR;100;1;20;2;0;1;...
//   4120;20100;100;15012025;;EUR;0,00;10000,00;2000,00;;0,00;0,00;0;AR;100;1;20;2;0;1;...
// (invoice: EUR 10 000,-- net + 2 000,-- USt = EUR 12 000,-- gross,
// Rechnungsdatum 15.01.2025, Rechnungsnr. 100)
describe("rzlRowsForInvoice matches the primary source example", () => {
  const entry: FibuBookingInput = {
    invoiceNumber: "100",
    date: "2025-01-15",
    clientName: "Testkunde",
    net: 10000,
    vat: 2000,
    vatRatePercent: 20,
    gross: 12000,
  };

  it("produces two lines of exactly 41 fields each", () => {
    const [line1, line2] = rzlRowsForInvoice(entry, config);
    expect(line1.split(";")).toHaveLength(41);
    expect(line2.split(";")).toHaveLength(41);
  });

  it("line 1 books the gross amount as Soll on the Debitorenkonto", () => {
    const [line1] = rzlRowsForInvoice(entry, config);
    const f = line1.split(";");
    expect(f[0]).toBe("20100"); // Kontonummer
    expect(f[1]).toBe("4120"); // Gegenkonto
    expect(f[3]).toBe("15012025"); // Beleg-Datum TTMMJJJJ
    expect(f[5]).toBe("EUR");
    expect(f[6]).toBe("12000,00"); // Sollbetrag
    expect(f[7]).toBe(""); // Habenbetrag
    expect(f[8]).toBe("0,00"); // Steuerbetrag
    expect(f[13]).toBe("AR"); // Belegkreis
    expect(f[14]).toBe("100"); // Belegnummer
    expect(f[15]).toBe("1"); // USt-Land Österreich
    expect(f[16]).toBe("20"); // USt-Schlüssel
    expect(f[17]).toBe("2"); // USt-Code MwSt.
    expect(f[19]).toBe("1"); // Buchungsart
  });

  it("line 2 books net + tax as Haben on the Erlöskonto (Gegenbuchung)", () => {
    const [, line2] = rzlRowsForInvoice(entry, config);
    const f = line2.split(";");
    expect(f[0]).toBe("4120");
    expect(f[1]).toBe("20100");
    expect(f[6]).toBe(""); // Sollbetrag
    expect(f[7]).toBe("10000,00"); // Habenbetrag
    expect(f[8]).toBe("2000,00"); // Steuerbetrag
  });

  it("negates amounts for Storno/Gutschrift", () => {
    const [line1] = rzlRowsForInvoice({ ...entry, invoiceType: "storno" }, config);
    expect(line1.split(";")[6]).toBe("-12000,00");
  });

  it("rejects a VAT rate with no known USt-Schlüssel", () => {
    expect(() => rzlRowsForInvoice({ ...entry, vatRatePercent: 7.7 }, config)).toThrow(
      FibuExportInputError
    );
  });
});

describe("generateRzlExport", () => {
  it("joins rows with CR/LF and no trailing separator", () => {
    const out = generateRzlExport(
      [
        {
          invoiceNumber: "100",
          date: "2025-01-15",
          clientName: "Testkunde",
          net: 10000,
          vat: 2000,
          vatRatePercent: 20,
          gross: 12000,
        },
      ],
      config
    );
    const lines = out.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("rejects an empty entry list", () => {
    expect(() => generateRzlExport([], config)).toThrow(FibuExportInputError);
  });
});
