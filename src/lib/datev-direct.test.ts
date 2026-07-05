import { describe, test, expect } from "vitest";
import { createDatevExport, invoicesToDatevRecords, isDatevConfigured } from "./datev-direct";

describe("datev-direct", () => {
  describe("invoicesToDatevRecords", () => {
    test("converts invoices to DATEV records", () => {
      const records = invoicesToDatevRecords([
        {
          invoice_number: "R-001",
          invoice_date: "2026-06-01",
          client_name: "Test GmbH",
          net_amount: 1000,
          tax_rate: 19,
        },
        {
          invoice_number: "R-002",
          invoice_date: "2026-06-15",
          client_name: "Test AG",
          net_amount: 500,
          tax_rate: 19,
        },
      ]);
      expect(records).toHaveLength(2);
      expect(records[0]!.belegdatum).toBe("2026-06-01");
      expect(records[0]!.betrag).toBe(1000);
    });
  });

  describe("createDatevExport", () => {
    test("creates export record", () => {
      const exportRecord = createDatevExport({
        type: "invoices",
        period: { from: "2026-01-01", to: "2026-06-30" },
        record_count: 0,
        total_amount: 0,
      });
      expect(exportRecord.id).toMatch(/^datev-/);
      expect(exportRecord.type).toBe("invoices");
      expect(exportRecord.status).toBe("pending");
    });
  });

  describe("isDatevConfigured", () => {
    test("returns false by default", () => {
      expect(isDatevConfigured()).toBe(false);
    });
  });
});
