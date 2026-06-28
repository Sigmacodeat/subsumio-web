/**
 * Trust Accounting — Treuhandkonten-Verwaltung für Kanzleien.
 *
 * DACH-konforme Verwaltung von Mandantengeldern auf Anderkonto:
 *   - Deutschland: § 43a BRAO, § 51 BRAO, RVB (Rechtsanwaltsvergütungsverordnung)
 *   - Österreich: § 16 RAO, § 17 RAO (Kanzleiverrechnungskonto)
 *   - Schweiz: Art. 3 AnwG, GoB
 *
 * Features:
 *   - Trust Account (Anderkonto) mit Transaktions-Tracking
 *   - Matter-spezifische Zuordnung
 *   - Ein-/Auszahlungen mit Beleg-Referenz
 *   - Saldo-Abgleich (Reconciliation)
 *   - Dreimonatiger Bericht (§ 51a BRAO)
 *   - Warnung bei Unterdeckung
 */

export type TrustTransactionType =
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "fee"
  | "interest"
  | "adjustment";
export type TrustAccountStatus = "active" | "frozen" | "closed" | "overdrawn";
export type ReconciliationStatus = "balanced" | "discrepancy" | "pending";

export interface TrustTransaction {
  id: string;
  type: TrustTransactionType;
  amount: number;
  currency: string;
  date: string;
  description: string;
  matterSlug?: string;
  matterTitle?: string;
  reference?: string;
  createdBy?: string;
  createdAt: string;
}

export interface TrustAccount {
  slug: string;
  accountName: string;
  accountNumber: string;
  bankName?: string;
  iban?: string;
  bic?: string;
  status: TrustAccountStatus;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  matterSlug?: string;
  matterTitle?: string;
  clientName?: string;
  transactions: TrustTransaction[];
  reconciliations: Array<{
    id: string;
    date: string;
    bankBalance: number;
    bookBalance: number;
    difference: number;
    status: ReconciliationStatus;
    reconciledBy?: string;
    notes?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export const TRANSACTION_TYPE_LABELS_DE: Record<TrustTransactionType, string> = {
  deposit: "Einzahlung",
  withdrawal: "Auszahlung",
  transfer: "Umbuchung",
  fee: "Gebühr",
  interest: "Zinsen",
  adjustment: "Korrektur",
};

export const ACCOUNT_STATUS_LABELS_DE: Record<TrustAccountStatus, string> = {
  active: "Aktiv",
  frozen: "Eingefroren",
  closed: "Geschlossen",
  overdrawn: "Überzogen",
};

export const RECONCILIATION_STATUS_LABELS_DE: Record<ReconciliationStatus, string> = {
  balanced: "Ausgeglichen",
  discrepancy: "Differenz",
  pending: "Offen",
};

export const TRANSACTION_TYPE_COLORS: Record<TrustTransactionType, string> = {
  deposit: "#22c55e",
  withdrawal: "#ef4444",
  transfer: "#6366f1",
  fee: "#f59e0b",
  interest: "#10b981",
  adjustment: "#8b5cf6",
};

export function computeBalance(openingBalance: number, transactions: TrustTransaction[]): number {
  return transactions.reduce((balance, tx) => {
    switch (tx.type) {
      case "deposit":
      case "interest":
        return balance + tx.amount;
      case "withdrawal":
      case "fee":
        return balance - tx.amount;
      case "transfer":
      case "adjustment":
        return balance + tx.amount;
      default:
        return balance;
    }
  }, openingBalance);
}

export function isOverdrawn(account: TrustAccount): boolean {
  return account.currentBalance < 0;
}

export function getRecentTransactions(
  transactions: TrustTransaction[],
  days: number = 90
): TrustTransaction[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return transactions
    .filter((tx) => new Date(tx.date) >= cutoff)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function generateQuarterlyReport(
  account: TrustAccount,
  quarter: number,
  year: number
): {
  accountName: string;
  accountNumber: string;
  quarter: number;
  year: number;
  openingBalance: number;
  closingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalFees: number;
  totalInterest: number;
  transactionCount: number;
  matters: string[];
} {
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 0, 23, 59, 59);

  const quarterTxs = account.transactions.filter((tx) => {
    const txDate = new Date(tx.date);
    return txDate >= startDate && txDate <= endDate;
  });

  const openingBalance = computeBalance(
    account.openingBalance,
    account.transactions.filter((tx) => new Date(tx.date) < startDate)
  );

  const closingBalance = computeBalance(openingBalance, quarterTxs);

  return {
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    quarter,
    year,
    openingBalance,
    closingBalance,
    totalDeposits: quarterTxs.filter((t) => t.type === "deposit").reduce((s, t) => s + t.amount, 0),
    totalWithdrawals: quarterTxs
      .filter((t) => t.type === "withdrawal")
      .reduce((s, t) => s + t.amount, 0),
    totalFees: quarterTxs.filter((t) => t.type === "fee").reduce((s, t) => s + t.amount, 0),
    totalInterest: quarterTxs
      .filter((t) => t.type === "interest")
      .reduce((s, t) => s + t.amount, 0),
    transactionCount: quarterTxs.length,
    matters: [...new Set(quarterTxs.map((t) => t.matterSlug).filter(Boolean))] as string[],
  };
}

export function exportTransactionsCsv(transactions: TrustTransaction[]): string {
  const headers = ["Datum", "Typ", "Betrag", "Währung", "Beschreibung", "Akte", "Referenz"];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = transactions.map((tx) => [
    new Date(tx.date).toLocaleDateString("de-DE"),
    TRANSACTION_TYPE_LABELS_DE[tx.type],
    tx.amount.toFixed(2),
    tx.currency,
    tx.description,
    tx.matterTitle ?? "",
    tx.reference ?? "",
  ]);
  return [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

export function parseTrustAccount(
  slug: string,
  frontmatter: Record<string, unknown>
): TrustAccount | null {
  if (frontmatter.type !== "trust_account") return null;
  const transactions = (frontmatter.transactions as TrustTransaction[]) ?? [];
  const openingBalance = (frontmatter.opening_balance as number) ?? 0;
  return {
    slug,
    accountName: (frontmatter.account_name as string) ?? slug,
    accountNumber: (frontmatter.account_number as string) ?? "",
    bankName: frontmatter.bank_name as string | undefined,
    iban: frontmatter.iban as string | undefined,
    bic: frontmatter.bic as string | undefined,
    status: (frontmatter.status as TrustAccountStatus) ?? "active",
    currency: (frontmatter.currency as string) ?? "EUR",
    openingBalance,
    currentBalance: computeBalance(openingBalance, transactions),
    matterSlug: frontmatter.matter_slug as string | undefined,
    matterTitle: frontmatter.matter_title as string | undefined,
    clientName: frontmatter.client_name as string | undefined,
    transactions,
    reconciliations: (frontmatter.reconciliations as TrustAccount["reconciliations"]) ?? [],
    createdAt: (frontmatter.created_at as string) ?? new Date().toISOString(),
    updatedAt: (frontmatter.updated_at as string) ?? new Date().toISOString(),
    createdBy: frontmatter.created_by as string | undefined,
  };
}
