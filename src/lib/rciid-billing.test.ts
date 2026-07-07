import { describe, it, expect } from "vitest";
import {
  calculateForensicsFee,
  createForensicsExpense,
  isReadyForBilling,
  formatExpenseDescription,
  calculateTotalWithVat,
  type RciidBillingConfig,
} from "./rciid-billing";
import type { RciidCase, RciidCaseStatus } from "./rciid";

describe("rciid-billing", () => {
  describe("calculateForensicsFee", () => {
    it("uses RCIID pricing when available (flat)", () => {
      const rciidCase: Pick<RciidCase, "pricing"> = {
        pricing: { amount: 2500, currency: "EUR", type: "flat" },
      };
      const fee = calculateForensicsFee(rciidCase);
      expect(fee.amount).toBe(2500);
      expect(fee.currency).toBe("EUR");
      expect(fee.type).toBe("flat");
    });

    it("uses RCIID pricing when available (hourly)", () => {
      const rciidCase: Pick<RciidCase, "pricing"> = {
        pricing: { amount: 150, currency: "EUR", type: "hourly" },
      };
      const fee = calculateForensicsFee(rciidCase);
      expect(fee.type).toBe("hourly");
    });

    it("applies markup percentage", () => {
      const rciidCase: Pick<RciidCase, "pricing"> = {
        pricing: { amount: 1000, currency: "EUR", type: "flat" },
      };
      const config: Partial<RciidBillingConfig> = { markupPercent: 0.15 };
      const fee = calculateForensicsFee(rciidCase, config);
      expect(fee.amount).toBe(1150);
    });

    it("falls back to default flat fee when no pricing", () => {
      const rciidCase: Pick<RciidCase, "pricing"> = { pricing: undefined };
      const fee = calculateForensicsFee(rciidCase, { defaultFlatFee: 3000 });
      expect(fee.amount).toBe(3000);
      expect(fee.type).toBe("flat");
    });

    it("uses RVG auslagenpauschale mode", () => {
      const rciidCase: Pick<RciidCase, "pricing"> = {
        pricing: { amount: 5000, currency: "EUR", type: "flat" },
      };
      const fee = calculateForensicsFee(rciidCase, {
        mode: "rvg_auslage",
        rvgAuslagenpauschale: 20,
      });
      expect(fee.amount).toBe(20);
      expect(fee.description).toContain("VV 7002");
    });
  });

  describe("createForensicsExpense", () => {
    it("creates an ExpenseEntry with correct fields", () => {
      const rciidCase: Pick<RciidCase, "case_id" | "pricing" | "status"> = {
        case_id: "rciid-2026-001",
        pricing: { amount: 2500, currency: "EUR", type: "flat" },
        status: "completed",
      };
      const expense = createForensicsExpense("case-2026-001", rciidCase);
      expect(expense.id).toContain("rciid-2026-001");
      expect(expense.description).toContain("rciid-2026-001");
      expect(expense.amount).toBe(2500);
      expect(expense.billable).toBe(true);
      expect(expense.billed).toBe(false);
      expect(expense.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("respects custom config", () => {
      const rciidCase: Pick<RciidCase, "case_id" | "pricing" | "status"> = {
        case_id: "rciid-2026-002",
        pricing: { amount: 1000, currency: "EUR", type: "flat" },
        status: "completed",
      };
      const expense = createForensicsExpense("case-2026-002", rciidCase, {
        markupPercent: 0.2,
        vatRate: 0.19,
      });
      expect(expense.amount).toBe(1200);
      expect(expense.vat_rate).toBe(0.19);
    });
  });

  describe("isReadyForBilling", () => {
    it("returns true for completed status", () => {
      expect(isReadyForBilling("completed")).toBe(true);
    });

    it("returns false for non-completed statuses", () => {
      expect(isReadyForBilling("investigating")).toBe(false);
      expect(isReadyForBilling("submitted")).toBe(false);
      expect(isReadyForBilling("received")).toBe(false);
      expect(isReadyForBilling("rejected")).toBe(false);
      expect(isReadyForBilling("none")).toBe(false);
    });
  });

  describe("formatExpenseDescription", () => {
    it("formats a readable description", () => {
      const desc = formatExpenseDescription("rciid-2026-001", 3, {
        amount: 2500,
        currency: "EUR",
        type: "flat",
      });
      expect(desc).toContain("rciid-2026-001");
      expect(desc).toContain("3 Wallet");
      expect(desc).toContain("2500.00 EUR");
    });
  });

  describe("calculateTotalWithVat", () => {
    it("calculates net, vat, and gross correctly", () => {
      const result = calculateTotalWithVat(1000, 0.19);
      expect(result.net).toBe(1000);
      expect(result.vat).toBe(190);
      expect(result.gross).toBe(1190);
    });

    it("handles zero VAT", () => {
      const result = calculateTotalWithVat(500, 0);
      expect(result.net).toBe(500);
      expect(result.vat).toBe(0);
      expect(result.gross).toBe(500);
    });
  });
});
