import { describe, expect, it } from "vitest";
import { BMD_FIBU04_HEADER, bmdRowForInvoice, generateBmdExport } from "./bmd";
import { FibuExportInputError, type FibuBookingInput, type FibuExportConfig } from "./types";

const config: FibuExportConfig = { debitorKonto: 20000, erloesKonto: 4000 };
const steuercodeForRate = { 20: "1" };

const entry: FibuBookingInput = {
  invoiceNumber: "R-2026-042",
  date: "2026-03-05",
  clientName: "Muster GmbH",
  net: 1000,
  vat: 200,
  vatRatePercent: 20,
  gross: 1200,
};

describe("bmdRowForInvoice", () => {
  it("emits one row with the header field order, per BMD_FIBU04_HEADER", () => {
    const row = bmdRowForInvoice(entry, config, steuercodeForRate);
    const fields = row.split(";");
    expect(fields).toHaveLength(BMD_FIBU04_HEADER.length);
    const byName = Object.fromEntries(BMD_FIBU04_HEADER.map((h, i) => [h, fields[i]]));
    expect(byName.Konto).toBe("20000");
    expect(byName.Gkonto).toBe("4000");
    expect(byName.Buchsymbol).toBe("AR");
    expect(byName.Belegnr).toBe("R-2026-042");
    expect(byName.Buchdatum).toBe("05.03.2026");
    expect(byName.Belegdatum).toBe("05.03.2026");
    expect(byName.Buchcode).toBe("1");
    expect(byName.Steuercode).toBe("1");
    expect(byName.Betrag).toBe("1200,00");
    expect(byName.Prozent).toBe("20");
    expect(byName.Steuer).toBe("200,00");
    expect(byName.Text).toContain("R-2026-042");
  });

  it("uses GU for Gutschrift and ST for Storno", () => {
    const gu = bmdRowForInvoice({ ...entry, invoiceType: "gutschrift" }, config, steuercodeForRate);
    const st = bmdRowForInvoice({ ...entry, invoiceType: "storno" }, config, steuercodeForRate);
    expect(gu.split(";")[2]).toBe("GU");
    expect(st.split(";")[2]).toBe("ST");
  });

  it("negates the amount for Gutschrift/Storno", () => {
    const row = bmdRowForInvoice({ ...entry, invoiceType: "storno" }, config, steuercodeForRate);
    const fields = row.split(";");
    expect(fields[BMD_FIBU04_HEADER.indexOf("Betrag")]).toBe("-1200,00");
  });

  it("replaces semicolons in text fields with commas instead of quoting", () => {
    const row = bmdRowForInvoice(
      { ...entry, clientName: "Muster; Partner GmbH" },
      config,
      steuercodeForRate
    );
    // The row must still split into exactly the header count of fields —
    // a stray semicolon inside Text would otherwise shift every later column.
    expect(row.split(";")).toHaveLength(BMD_FIBU04_HEADER.length);
    expect(row).toContain("Muster, Partner GmbH");
  });

  it("rejects a VAT rate without a configured Steuercode", () => {
    expect(() =>
      bmdRowForInvoice({ ...entry, vatRatePercent: 13 }, config, steuercodeForRate)
    ).toThrow(FibuExportInputError);
  });
});

describe("generateBmdExport", () => {
  it("starts with the BMD_FIBU04_HEADER row", () => {
    const out = generateBmdExport([entry], config, steuercodeForRate);
    expect(out.split("\r\n")[0]).toBe(BMD_FIBU04_HEADER.join(";"));
  });

  it("rejects an empty entry list", () => {
    expect(() => generateBmdExport([], config, steuercodeForRate)).toThrow(FibuExportInputError);
  });
});
