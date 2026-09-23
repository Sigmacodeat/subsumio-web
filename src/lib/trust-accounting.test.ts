// @vitest-environment node

import { describe, test, it, expect } from "vitest";
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
  buildTrustBooking,
  matterBalances,
  validateTrustBooking,
  type TrustBookingInput,
  type TrustTransaction as LedgerTx,
  overdueReconciliationAccounts,
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
    const recent = getRecentTransactions(transactions, 90, new Date("2026-09-01T12:00:00Z"));
    expect(recent.map((t) => t.id)).toEqual(["b", "a"]);
  });

  test("keeps a booking dated exactly at the edge of the window", () => {
    const transactions: TrustTransaction[] = [
      tx({ id: "edge", date: "2026-06-20", type: "deposit", amount: 100 }),
      tx({ id: "older", date: "2026-06-19", type: "deposit", amount: 100 }),
    ];
    // 2026-09-18 minus 90 days is 2026-06-20; the run must not depend on the clock.
    const recent = getRecentTransactions(transactions, 90, new Date("2026-09-18T01:00:00Z"));
    expect(recent.map((t) => t.id)).toEqual(["edge"]);
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

describe("Treuhand-Buchungsregeln", () => {
  const account = (transactions: LedgerTx[] = [], status: "active" | "frozen" = "active") => ({
    status,
    currency: "EUR",
    transactions,
  });
  const book = (txs: LedgerTx[], input: Partial<TrustBookingInput>) => {
    const full: TrustBookingInput = {
      type: "deposit",
      amount: 100,
      date: "2026-09-17",
      description: "Buchung",
      matterSlug: "legal/cases/a",
      ...input,
    };
    const check = validateTrustBooking(account(txs), full);
    if (!check.ok) return { check, txs };
    return { check, txs: [...txs, buildTrustBooking(account(txs), full, "anwalt@kanzlei.at")] };
  };

  it("numbers bookings consecutively and records who booked", () => {
    let { txs } = book([], { amount: 5000 });
    ({ txs } = book(txs, { type: "withdrawal", amount: 1200 }));
    expect(txs.map((t) => t.number)).toEqual([1, 2]);
    expect(txs[1].createdBy).toBe("anwalt@kanzlei.at");
    expect(matterBalances(txs).get("legal/cases/a")).toBe(3800);
  });

  it("never pays out more than the matter holds, even if the account holds enough", () => {
    let { txs } = book([], { amount: 10_000, matterSlug: "legal/cases/b" });
    ({ txs } = book(txs, { amount: 500 }));
    const r = book(txs, { type: "withdrawal", amount: 600 });
    expect(r.check).toMatchObject({ ok: false, code: "exceeds_matter_balance" });
    expect(book(txs, { type: "fee", amount: 500 }).check.ok).toBe(true);
  });

  it("rejects zero, negative and sub-cent amounts, bookings without a matter and on a frozen account", () => {
    expect(book([], { amount: 0 }).check).toMatchObject({ ok: false, code: "amount_positive" });
    expect(book([], { amount: -50 }).check).toMatchObject({ ok: false, code: "amount_positive" });
    expect(book([], { amount: 10.005 }).check).toMatchObject({ ok: false, code: "amount_cents" });
    expect(book([], { matterSlug: " " }).check).toMatchObject({
      ok: false,
      code: "matter_required",
    });
    expect(
      validateTrustBooking(account([], "frozen"), {
        type: "deposit",
        amount: 1,
        date: "x",
        description: "d",
        matterSlug: "m",
      })
    ).toMatchObject({ ok: false, code: "account_not_active" });
  });

  it("corrects by reversal: once, same matter, never a reversal of a reversal", () => {
    let { txs } = book([], { amount: 2000 });
    const depositId = txs[0].id;
    ({ txs } = book(txs, { type: "reversal", reversesId: depositId, amount: 0 }));
    expect(txs[1]).toMatchObject({
      type: "reversal",
      amount: 2000,
      reversesId: depositId,
      number: 2,
    });
    expect(matterBalances(txs).get("legal/cases/a")).toBe(0);
    expect(book(txs, { type: "reversal", reversesId: depositId }).check).toMatchObject({
      code: "already_reversed",
    });
    expect(book(txs, { type: "reversal", reversesId: txs[1].id }).check).toMatchObject({
      code: "reversal_of_reversal",
    });
    expect(
      book(txs, { type: "reversal", reversesId: depositId, matterSlug: "legal/cases/x" }).check.ok
    ).toBe(false);
  });

  it("a reversal of a deposit that was already spent is refused", () => {
    let { txs } = book([], { amount: 1000 });
    ({ txs } = book(txs, { type: "withdrawal", amount: 800 }));
    expect(book(txs, { type: "reversal", reversesId: txs[0].id }).check).toMatchObject({
      code: "exceeds_matter_balance",
    });
  });

  it("warns above 40.000 € per matter (§ 10a Abs. 2 RAO)", () => {
    let { txs } = book([], { amount: 30_000 });
    const below = book(txs, { amount: 10_000 });
    expect(below.check.ok && below.check.warnings).toEqual([]);
    ({ txs } = below);
    const above = book(txs, { amount: 0.01 });
    expect(above.check.ok && above.check.warnings[0]).toMatch(/§ 10a Abs\. 2 RAO/);
  });
});

describe("Quartalsbericht mit Storno", () => {
  it("leaves reversed bookings and their reversals out of the totals", () => {
    const tx = (over: Partial<LedgerTx>): LedgerTx => ({
      id: "x",
      type: "deposit",
      amount: 0,
      currency: "EUR",
      date: "2026-08-01",
      description: "",
      matterSlug: "m",
      createdAt: "2026-08-01",
      ...over,
    });
    const report = generateQuarterlyReport(
      {
        slug: "a",
        accountName: "A",
        accountNumber: "1",
        status: "active",
        currency: "EUR",
        openingBalance: 0,
        currentBalance: 0,
        transactions: [
          tx({ id: "d", amount: 50_000 }),
          tx({ id: "w1", type: "withdrawal", amount: 10_000 }),
          tx({ id: "w2", type: "withdrawal", amount: 10_000, reversedById: "r" }),
          tx({ id: "r", type: "reversal", amount: 10_000, reversesId: "w2" }),
        ],
        reconciliations: [],
        createdAt: "",
        updatedAt: "",
      },
      3,
      2026
    );
    expect(report.totalWithdrawals).toBe(10_000);
    expect(report.closingBalance).toBe(40_000);
  });
});

describe("buildTreuhandMeldung (§ 10a RAO)", () => {
  it("erzeugt einen Meldeentwurf mit Akte, Betrag und IBAN", async () => {
    const { buildTreuhandMeldung } = await import("./trust-accounting");
    const text = buildTreuhandMeldung({
      kanzleiName: "Kanzlei Muster",
      matterTitle: "Kauf Liegenschaft Huber",
      matterSlug: "cases/26-0042",
      accountIban: "AT611904300234573201",
      deposits: 150_000,
      heute: new Date("2026-09-22"),
    });
    expect(text).toContain("§ 10a Abs. 2 RAO");
    expect(text).toContain("Kanzlei Muster");
    expect(text).toContain("26-0042");
    expect(text).toContain("AT611904300234573201");
    expect(text).toContain("150");
    expect(text).toContain("anwaltlich zu prüfen");
  });
});

describe("Anderkonto § 43a BRAO (DE)", () => {
  const deAccount = {
    status: "active" as const,
    jurisdiction: "de" as const,
    transactions: [],
  };
  const input = {
    type: "deposit" as const,
    amount: 1_000,
    date: "2026-09-22",
    description: "Fremdgeld",
    matterSlug: "m",
  };

  it("warnt bei DE-Einzahlung auf die Unverzüglichkeits- und Hinweispflicht", () => {
    const check = validateTrustBooking(deAccount, input);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.warnings.some((w) => w.includes("§ 43a Abs. 3 BRAO"))).toBe(true);
      expect(check.warnings.some((w) => w.includes("§ 43a Abs. 5 BRAO"))).toBe(true);
    }
  });

  it("warnt ab 15.000 € auf das Einzelanderkonto-Verlangen", () => {
    const check = validateTrustBooking(deAccount, { ...input, amount: 16_000 });
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.warnings.some((w) => w.includes("Einzelanderkonto"))).toBe(true);
    }
  });

  it("warnt bei AT nicht auf DE-Regeln", () => {
    const check = validateTrustBooking({ status: "active", transactions: [] }, input);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.warnings.some((w) => w.includes("BRAO"))).toBe(false);
    }
  });
});

describe("buildAnderkontoMitteilung (§ 43a Abs. 5 BRAO)", () => {
  it("erzeugt einen Unterrichtungsentwurf mit IBAN und Schwelle", async () => {
    const { buildAnderkontoMitteilung } = await import("./trust-accounting");
    const text = buildAnderkontoMitteilung({
      kanzleiName: "Kanzlei Muster",
      matterTitle: "Kauf GmbH-Anteile",
      matterSlug: "cases/26-0101",
      accountIban: "DE89370400440532013000",
      bankName: "Musterbank",
      deposits: 80_000,
      heute: new Date("2026-09-22"),
    });
    expect(text).toContain("§ 43a Abs. 5 BRAO");
    expect(text).toContain("DE89370400440532013000");
    expect(text).toContain("15.000");
    expect(text).toContain("anwaltlich zu prüfen");
  });
});

describe("overdueReconciliationAccounts (Quartalsabgleich RAO)", () => {
  function acc(recs: Array<{ date: string }>) {
    return { slug: "trust/1", frontmatter: { reconciliations: recs } };
  }

  it("zählt Konten ohne Abgleich im laufenden Quartal (nach Kulanzmonat)", () => {
    const now = new Date("2026-05-15"); // Mai = Monat 4, Q2 startet April (Monat 3)
    expect(overdueReconciliationAccounts([acc([])], now)).toHaveLength(1);
    expect(overdueReconciliationAccounts([acc([{ date: "2026-04-10" }])], now)).toHaveLength(0);
  });

  it("Kulanzmonat: im ersten Quartalsmonat ist noch nichts überfällig", () => {
    const now = new Date("2026-04-20"); // erster Monat von Q2
    expect(overdueReconciliationAccounts([acc([])], now)).toHaveLength(0);
  });

  it("Abgleich aus Vorquartal zählt nicht", () => {
    const now = new Date("2026-05-15");
    expect(overdueReconciliationAccounts([acc([{ date: "2026-01-15" }])], now)).toHaveLength(1);
  });

  it("leere/fehlende reconciliations-Liste → überfällig", () => {
    const now = new Date("2026-08-10"); // Q3, Kulanzmonat Juli vorbei
    expect(overdueReconciliationAccounts([{ slug: "t/x", frontmatter: {} }], now)).toHaveLength(1);
  });
});
