/**
 * Treuhandkonto (Anderkonto) — Fremdgeld der Klientinnen und Klienten.
 *
 * Österreich:
 *   - § 10a Abs. 1 RAO: eigenverantwortliche Treuhandschaft, schriftlicher
 *     Treuhandauftrag, Verzeichnis mit fortlaufender Nummerierung.
 *   - § 10a Abs. 2 und 3 RAO: Treuhanderlag über 40 000 Euro ist über die
 *     Treuhandeinrichtung der Rechtsanwaltskammer abzuwickeln (Ausnahmen u. a.
 *     Prozessführung, Forderungsbetreibung, Gerichtsgebühren, Steuern) und vor
 *     der ersten Verfügung zu melden.
 *
 * Buchungsregeln (validateTrustBooking):
 *   - Buchungen sind unveränderlich und fortlaufend nummeriert. Fehler werden
 *     storniert, nicht überschrieben.
 *   - Jede Buchung gehört zu einer Akte. Fremdgeld einer Akte darf nicht für
 *     eine andere verwendet werden: Auszahlungen und Honorarentnahmen dürfen
 *     das Guthaben der Akte nicht übersteigen.
 */

export type TrustTransactionType =
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "fee"
  | "interest"
  | "adjustment"
  | "reversal";

/** Types that can be booked today; "transfer" and "adjustment" exist only in older data. */
export const BOOKABLE_TRUST_TYPES = [
  "deposit",
  "withdrawal",
  "fee",
  "interest",
  "reversal",
] as const;
export type BookableTrustType = (typeof BOOKABLE_TRUST_TYPES)[number];

/** Treuhanderlag above which § 10a Abs. 2 RAO requires the chamber's trust institution. */
export const TREUHANDEINRICHTUNG_THRESHOLD = 40_000;
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
  /** Fortlaufende Nummer im Verzeichnis (§ 10a Abs. 1 RAO). */
  number?: number;
  /** Storno: id of the booking this one reverses. */
  reversesId?: string;
  /** Set on a booking once it has been reversed. */
  reversedById?: string;
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
  fee: "Honorarentnahme",
  interest: "Zinsen",
  adjustment: "Korrektur",
  reversal: "Storno",
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
  reversal: "#64748b",
};

const cents = (n: number) => Math.round(n * 100);

/** Effect of one booking on the balance, in euros (reversals mirror their original). */
export function signedAmount(tx: TrustTransaction, all: TrustTransaction[]): number {
  switch (tx.type) {
    case "deposit":
    case "interest":
      return tx.amount;
    case "withdrawal":
    case "fee":
      return -tx.amount;
    case "transfer":
    case "adjustment":
      return tx.amount;
    case "reversal": {
      const original = all.find((t) => t.id === tx.reversesId);
      return original && original.type !== "reversal" ? -signedAmount(original, all) : 0;
    }
    default:
      return 0;
  }
}

export function computeBalance(openingBalance: number, transactions: TrustTransaction[]): number {
  const total = transactions.reduce(
    (sum, tx) => sum + cents(signedAmount(tx, transactions)),
    cents(openingBalance)
  );
  return total / 100;
}

export const NO_MATTER = "";

/** Guthaben je Akte. Bookings without a matter (older data) collect under NO_MATTER. */
export function matterBalances(transactions: TrustTransaction[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const tx of transactions) {
    const key = tx.matterSlug ?? NO_MATTER;
    out.set(key, (out.get(key) ?? 0) + cents(signedAmount(tx, transactions)));
  }
  for (const [k, v] of out) out.set(k, v / 100);
  return out;
}

/** Summe der Einzahlungen einer Akte (abzüglich stornierter), für § 10a Abs. 2 RAO. */
export function matterDeposits(transactions: TrustTransaction[], matterSlug: string): number {
  const reversed = new Set(
    transactions.filter((t) => t.type === "reversal").map((t) => t.reversesId)
  );
  return (
    transactions
      .filter((t) => t.matterSlug === matterSlug && t.type === "deposit" && !reversed.has(t.id))
      .reduce((sum, t) => sum + cents(t.amount), 0) / 100
  );
}

export interface TrustBookingInput {
  type: BookableTrustType;
  amount: number;
  date: string;
  description: string;
  matterSlug: string;
  matterTitle?: string;
  reference?: string;
  reversesId?: string;
}

export type TrustBookingCheck =
  | { ok: true; warnings: string[]; signed: number }
  | { ok: false; code: string; message: string };

const euro = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export function validateTrustBooking(
  account: Pick<TrustAccount, "status" | "transactions">,
  input: TrustBookingInput
): TrustBookingCheck {
  const fail = (code: string, message: string) => ({ ok: false as const, code, message });
  if (account.status === "frozen" || account.status === "closed") {
    return fail(
      "account_not_active",
      "Auf ein eingefrorenes oder geschlossenes Treuhandkonto kann nicht gebucht werden."
    );
  }
  if (!input.matterSlug?.trim()) {
    return fail("matter_required", "Jede Treuhandbuchung muss einer Akte zugeordnet sein.");
  }
  if (!input.description?.trim()) {
    return fail("description_required", "Bitte den Buchungstext angeben.");
  }
  const txs = account.transactions;
  let signed: number;

  if (input.type === "reversal") {
    const original = txs.find((t) => t.id === input.reversesId);
    if (!original)
      return fail("reversal_target_missing", "Die zu stornierende Buchung wurde nicht gefunden.");
    if (original.type === "reversal")
      return fail("reversal_of_reversal", "Ein Storno kann nicht storniert werden.");
    if (original.reversedById || txs.some((t) => t.reversesId === original.id)) {
      return fail("already_reversed", "Diese Buchung wurde bereits storniert.");
    }
    if ((original.matterSlug ?? NO_MATTER) !== input.matterSlug) {
      return fail(
        "reversal_matter_mismatch",
        "Ein Storno gehört zur Akte der ursprünglichen Buchung."
      );
    }
    signed = -signedAmount(original, txs);
  } else {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return fail("amount_positive", "Der Betrag muss größer als 0 sein.");
    }
    if (cents(input.amount) / 100 !== input.amount) {
      return fail("amount_cents", "Beträge haben höchstens zwei Nachkommastellen.");
    }
    signed = input.type === "withdrawal" || input.type === "fee" ? -input.amount : input.amount;
  }

  const matterBalance = matterBalances(txs).get(input.matterSlug) ?? 0;
  if (signed < 0 && cents(matterBalance) + cents(signed) < 0) {
    return fail(
      "exceeds_matter_balance",
      `Die Buchung übersteigt das Treuhandguthaben dieser Akte (${euro(matterBalance)}). Fremdgeld einer anderen Akte darf nicht verwendet werden.`
    );
  }

  const warnings: string[] = [];
  if (input.type === "deposit") {
    const deposits = matterDeposits(txs, input.matterSlug) + input.amount;
    if (deposits > TREUHANDEINRICHTUNG_THRESHOLD) {
      warnings.push(
        `Der Treuhanderlag dieser Akte übersteigt 40.000 € (${euro(deposits)}). Nach § 10a Abs. 2 RAO ist die Treuhandschaft über die Treuhandeinrichtung der Rechtsanwaltskammer abzuwickeln und vor der ersten Verfügung zu melden, sofern keine gesetzliche Ausnahme vorliegt.`
      );
    }
  }
  return { ok: true, warnings, signed };
}

/** The immutable booking as stored; number continues the account's sequence. */
export function buildTrustBooking(
  account: Pick<TrustAccount, "transactions" | "currency">,
  input: TrustBookingInput,
  by: string,
  now = new Date()
): TrustTransaction {
  const txs = account.transactions;
  const next = txs.reduce((max, t) => Math.max(max, t.number ?? 0), 0) + 1;
  const original =
    input.type === "reversal" ? txs.find((t) => t.id === input.reversesId) : undefined;
  return {
    id: `ttx-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    number: Math.max(next, txs.length + 1),
    type: input.type,
    amount: original ? original.amount : input.amount,
    currency: account.currency || "EUR",
    date: input.date,
    description: input.description.trim(),
    matterSlug: input.matterSlug,
    matterTitle: input.matterTitle ?? original?.matterTitle,
    reference: input.reference?.trim() || undefined,
    reversesId: original?.id,
    createdBy: by,
    createdAt: now.toISOString(),
  };
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

  // Balances include reversals (computed against the whole ledger); the totals
  // leave out reversed bookings and their reversals, which cancel each other.
  const closingBalance = computeBalance(
    account.openingBalance,
    account.transactions.filter((tx) => new Date(tx.date) <= endDate)
  );
  const reversedIds = new Set(
    account.transactions.filter((t) => t.type === "reversal").map((t) => t.reversesId)
  );
  const effective = quarterTxs.filter((t) => t.type !== "reversal" && !reversedIds.has(t.id));

  return {
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    quarter,
    year,
    openingBalance,
    closingBalance,
    totalDeposits: effective.filter((t) => t.type === "deposit").reduce((s, t) => s + t.amount, 0),
    totalWithdrawals: effective
      .filter((t) => t.type === "withdrawal")
      .reduce((s, t) => s + t.amount, 0),
    totalFees: effective.filter((t) => t.type === "fee").reduce((s, t) => s + t.amount, 0),
    totalInterest: effective.filter((t) => t.type === "interest").reduce((s, t) => s + t.amount, 0),
    transactionCount: quarterTxs.length,
    matters: [...new Set(quarterTxs.map((t) => t.matterSlug).filter(Boolean))] as string[],
  };
}

export function exportTransactionsCsv(transactions: TrustTransaction[]): string {
  const headers = ["Nr.", "Datum", "Typ", "Betrag", "Währung", "Beschreibung", "Akte", "Referenz"];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = transactions.map((tx) => [
    tx.number ? String(tx.number) : "",
    new Date(tx.date).toLocaleDateString("de-AT"),
    TRANSACTION_TYPE_LABELS_DE[tx.type],
    signedAmount(tx, transactions).toFixed(2),
    tx.currency,
    tx.description,
    tx.matterTitle ?? "",
    tx.reference ?? "",
  ]);
  return [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

export function parseTrustAccount(
  slug: string,
  frontmatter: Record<string, unknown>,
  /** Page type from the engine column — frontmatter.type is stripped on store. */
  pageType?: string
): TrustAccount | null {
  if ((pageType ?? frontmatter.type) !== "trust_account") return null;
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
