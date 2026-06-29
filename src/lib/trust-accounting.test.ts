// @vitest-environment node

import { describe, test, expect } from "vitest";
import {
  computeBalance,
  isOverdrawn,
  getRecentTransactions,
  generateQuarterlyReport,
  exportTransactionsCsv,
  parseTrustAccount,
  TRANSACTION_TYPE_LABELS_DE,
  ACCOUNT_STATUS_LABELS_DE,
  type TrustAccount,
  type TrustTransaction,
} from "./trust-accounting";

const baseAccount = (overrides?: Partial<TrustAccount>): TrustAccount => ({
  slug: "tk-001",
  accountName: "Mandantengelder",
  accountNumber: "DE123456789",
  status: "active",
  currency: "EUR",
  openingBalance: 1000,
  currentBalance: 1000,
  transactions: [],
  reconciliations: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const tx = (
  overrides: Partial<TrustTransaction> & { type: TrustTransaction["type"]; amount: number }
): TrustTransaction => ({
  id: "tx-1",
  currency: "EUR",
  date: "2026-01-15",
  description: "Test",
  createdAt: "2026-01-15T00:00:00Z",
  ...overrides,
});

describe("computeBalance", () => {
  test("deposit increases balance", () => {
    const account = baseAccount({
      openingBalance: 1000,
      transactions: [tx({ type: "deposit", amount: 500 })],
    });
    expect(computeBalance(account.openingBalance, account.transactions)).toBe(1500);
  });

  test("withdrawal decreases balance", () => {
    const account = baseAccount({
      openingBalance: 1000,
      transactions: [tx({ type: "withdrawal", amount: 200 })],
    });
    expect(computeBalance(account.openingBalance, account.transactions)).toBe(800);
  });

  test("interest increases balance", () => {
    const account = baseAccount({
      openingBalance: 1000,
      transactions: [tx({ type: "interest", amount: 10 })],
    });
    expect(computeBalance(account.openingBalance, account.transactions)).toBe(1010);
  });

  test("fee decreases balance", () => {
    const account = baseAccount({
      openingBalance: 1000,
      transactions: [tx({ type: "fee", amount: 50 })],
    });
    expect(computeBalance(account.openingBalance, account.transactions)).toBe(950);
  });

  test("transfer and adjustment modify balance", () => {
    const account = baseAccount({
      openingBalance: 1000,
      transactions: [
        tx({ type: "transfer", amount: -100, id: "tx-1" }),
        tx({ type: "adjustment", amount: 25, id: "tx-2", date: "2026-01-16" }),
      ],
    });
    expect(computeBalance(account.openingBalance, account.transactions)).toBe(925);
  });

  test("empty transactions returns opening balance", () => {
    expect(computeBalance(5000, [])).toBe(5000);
  });
});

describe("isOverdrawn", () => {
  test("negative balance is overdrawn", () => {
    expect(isOverdrawn(baseAccount({ currentBalance: -10 }))).toBe(true);
  });

  test("zero balance is not overdrawn", () => {
    expect(isOverdrawn(baseAccount({ currentBalance: 0 }))).toBe(false);
  });

  test("positive balance is not overdrawn", () => {
    expect(isOverdrawn(baseAccount({ currentBalance: 1 }))).toBe(false);
  });
});

describe("getRecentTransactions", () => {
  test("filters transactions within last 90 days by default", () => {
    const transactions: TrustTransaction[] = [
      tx({ id: "old", date: "2026-01-01", type: "deposit", amount: 100 }),
      tx({ id: "recent", date: "2026-06-25", type: "deposit", amount: 200 }),
    ];
    const recent = getRecentTransactions(transactions, 90);
    expect(recent.map((t) => t.id)).toEqual(["recent"]);
  });

  test("sorts recent first", () => {
    const transactions: TrustTransaction[] = [
      tx({ id: "a", date: "2026-06-20", type: "deposit", amount: 100 }),
      tx({ id: "b", date: "2026-06-25", type: "deposit", amount: 200 }),
    ];
    const recent = getRecentTransactions(transactions, 90);
    expect(recent.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("generateQuarterlyReport", () => {
  test("computes Q1 report correctly", () => {
    const account = baseAccount({
      openingBalance: 0,
      transactions: [
        tx({ id: "d1", type: "deposit", amount: 1000, date: "2026-01-15" }),
        tx({ id: "w1", type: "withdrawal", amount: 200, date: "2026-02-10" }),
        tx({ id: "f1", type: "fee", amount: 50, date: "2026-03-05" }),
        tx({ id: "i1", type: "interest", amount: 10, date: "2026-03-20" }),
        tx({ id: "d2", type: "deposit", amount: 500, date: "2026-04-01" }),
      ],
    });
    const report = generateQuarterlyReport(account, 1, 2026);
    expect(report.totalDeposits).toBe(1000);
    expect(report.totalWithdrawals).toBe(200);
    expect(report.totalFees).toBe(50);
    expect(report.totalInterest).toBe(10);
    expect(report.transactionCount).toBe(4);
    expect(report.openingBalance).toBe(0);
    expect(report.closingBalance).toBe(760);
  });

  test("ignores transactions outside quarter", () => {
    const account = baseAccount({
      openingBalance: 0,
      transactions: [tx({ id: "d1", type: "deposit", amount: 1000, date: "2026-04-01" })],
    });
    const report = generateQuarterlyReport(account, 1, 2026);
    expect(report.transactionCount).toBe(0);
    expect(report.totalDeposits).toBe(0);
  });

  test("matters list is unique", () => {
    const account = baseAccount({
      openingBalance: 0,
      transactions: [
        tx({ id: "d1", type: "deposit", amount: 100, date: "2026-01-15", matterSlug: "m1" }),
        tx({ id: "d2", type: "deposit", amount: 100, date: "2026-02-15", matterSlug: "m1" }),
        tx({ id: "d3", type: "deposit", amount: 100, date: "2026-03-15", matterSlug: "m2" }),
      ],
    });
    const report = generateQuarterlyReport(account, 1, 2026);
    expect(report.matters).toEqual(["m1", "m2"]);
  });
});

describe("exportTransactionsCsv", () => {
  test("exports CSV with proper escaping", () => {
    const transactions: TrustTransaction[] = [
      tx({
        id: "t1",
        type: "deposit",
        amount: 1000,
        description: 'Test "quoted"',
        date: "2026-01-15",
        matterTitle: "Matter A",
      }),
    ];
    const csv = exportTransactionsCsv(transactions);
    expect(csv).toContain('"Datum","Typ","Betrag","Währung","Beschreibung","Akte","Referenz"');
    expect(csv).toContain('"Test ""quoted"""');
    expect(csv).toContain("Einzahlung");
    expect(csv).toContain('"1000.00"');
  });
});

describe("parseTrustAccount", () => {
  test("parses valid trust account frontmatter", () => {
    const account = parseTrustAccount("slug-1", {
      type: "trust_account",
      account_name: "Testkonto",
      account_number: "12345",
      opening_balance: 2000,
      transactions: [tx({ id: "t1", type: "deposit", amount: 500, date: "2026-01-15" })],
    });
    expect(account).not.toBeNull();
    expect(account?.accountName).toBe("Testkonto");
    expect(account?.currentBalance).toBe(2500);
  });

  test("returns null for non-trust-account type", () => {
    const account = parseTrustAccount("slug-1", { type: "case" });
    expect(account).toBeNull();
  });

  test("defaults missing fields", () => {
    const account = parseTrustAccount("slug-1", { type: "trust_account" });
    expect(account?.currency).toBe("EUR");
    expect(account?.status).toBe("active");
    expect(account?.currentBalance).toBe(0);
  });
});

describe("labels", () => {
  test("transaction type labels cover all types", () => {
    const types: TrustTransaction["type"][] = [
      "deposit",
      "withdrawal",
      "transfer",
      "fee",
      "interest",
      "adjustment",
    ];
    for (const type of types) {
      expect(TRANSACTION_TYPE_LABELS_DE[type]).toBeDefined();
    }
  });

  test("status labels cover all statuses", () => {
    const statuses: TrustAccount["status"][] = ["active", "frozen", "closed", "overdrawn"];
    for (const status of statuses) {
      expect(ACCOUNT_STATUS_LABELS_DE[status]).toBeDefined();
    }
  });
});
