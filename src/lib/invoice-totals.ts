/**
 * Rechnungssummen — die EINE Rechenvorschrift für Anlage (Browser und
 * Copilot), Serverprüfung und Export.
 *
 * Gerechnet wird in ganzen Cent, nie in Euro-Gleitkomma:
 *  - Honorarpositionen (`items`) tragen den Steuersatz der Rechnung;
 *  - Auslagen (`expenses`) ihren eigenen (`vat_rate`, z. B. 0 für eine im
 *    Namen des Mandanten entrichtete Gerichtsgebühr — durchlaufender Posten,
 *    § 4 Abs 3 UStG 1994). Ohne eigenen Satz gilt der Satz der Rechnung;
 *  - USt wird je Steuersatz auf die gerundete Netto-Summe gerechnet
 *    (Steueraufschlüsselung pro Satz, § 11 Abs 1 Z 3 lit e UStG 1994);
 *  - Übergang der Steuerschuld (Reverse Charge, § 19 Abs 1 UStG 1994): keine
 *    USt, alle Sätze 0 — der Pflichthinweis steht in REVERSE_CHARGE_NOTE.
 *
 * Der Server legt eine Rechnung nur an bzw. finalisiert sie nur, wenn die
 * gespeicherten Summen dieser Rechnung entsprechen (checkStoredInvoiceTotals).
 */

export const REVERSE_CHARGE_NOTE =
  "Übergang der Steuerschuld auf den Leistungsempfänger (Reverse Charge, § 19 Abs 1 UStG 1994 / Art. 196 MwStSystRL).";

/** Kaufmännisch runden, symmetrisch um 0 (−0,5 Cent → −1 Cent). */
function roundHalfAway(n: number): number {
  const r = Math.round(Math.abs(n));
  return n < 0 ? -r : r;
}

/** Euro → ganze Cent (nicht-numerisch → 0). */
export function toCents(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // 1e-9 fängt Darstellungsfehler wie 1.005 * 100 = 100.49999… ab.
  return roundHalfAway(n * 100 + (n >= 0 ? 1e-9 : -1e-9));
}

/** Ganze Cent → Euro (exakt auf zwei Stellen). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Auf Cent gerundeter Euro-Betrag. */
export function roundEur(value: unknown): number {
  return fromCents(toCents(value));
}

/**
 * Steuersatz als Anteil (0,2). Rechnungen speichern den Anteil, Auslagen und
 * ältere Daten Prozent (20). Einen USt-Satz von 1 % gibt es in AT/DE nicht —
 * ein Wert ≤ 1 ist daher immer ein Anteil.
 */
export function rateFraction(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  const f = n > 1 ? n / 100 : n;
  return Math.round(f * 10_000) / 10_000;
}

export interface TotalsItem {
  amount: number;
}

export interface TotalsExpense {
  amount: number;
  /** Anteil (0,2) oder Prozent (20); fehlt er, gilt der Satz der Rechnung. */
  vat_rate?: number | null;
}

export interface InvoiceTotalsInput {
  items: TotalsItem[];
  expenses?: TotalsExpense[];
  /** Satz der Rechnung (Anteil oder Prozent). */
  vatRate: number;
  advancePayment?: number;
  reverseCharge?: boolean;
}

export interface TaxBreakdownRow {
  /** Anteil, z. B. 0.2. */
  rate: number;
  net: number;
  tax: number;
}

export interface InvoiceTotals {
  subtotal: number;
  expense_total: number;
  /** Netto gesamt (Honorar + Auslagen). */
  net: number;
  tax: number;
  /** Brutto der Leistung (Netto + USt), vor Abzug einer Akontozahlung. */
  gross: number;
  advance_payment: number;
  /** Zahlbetrag: Brutto minus Akonto. */
  total: number;
  tax_breakdown: TaxBreakdownRow[];
}

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const invoiceRate = input.reverseCharge ? 0 : rateFraction(input.vatRate, 0);
  const buckets = new Map<number, number>();
  const add = (rate: number, cents: number) => buckets.set(rate, (buckets.get(rate) ?? 0) + cents);

  let subtotalCents = 0;
  for (const item of input.items ?? []) {
    const c = toCents(item?.amount);
    subtotalCents += c;
    add(invoiceRate, c);
  }
  let expenseCents = 0;
  for (const exp of input.expenses ?? []) {
    const c = toCents(exp?.amount);
    expenseCents += c;
    add(input.reverseCharge ? 0 : rateFraction(exp?.vat_rate, invoiceRate), c);
  }

  const rows = [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, netCents]) => ({ rate, netCents, taxCents: roundHalfAway(netCents * rate) }));
  const taxCents = rows.reduce((s, r) => s + r.taxCents, 0);
  const netCents = subtotalCents + expenseCents;
  const grossCents = netCents + taxCents;
  const advanceCents = toCents(input.advancePayment ?? 0);
  const payable = grossCents - advanceCents;
  // A regular invoice never asks for less than nothing; a Storno-Note
  // (negative amounts throughout) keeps its sign.
  const totalCents = grossCents >= 0 ? Math.max(0, payable) : payable;

  return {
    subtotal: fromCents(subtotalCents),
    expense_total: fromCents(expenseCents),
    net: fromCents(netCents),
    tax: fromCents(taxCents),
    gross: fromCents(grossCents),
    advance_payment: fromCents(advanceCents),
    total: fromCents(totalCents),
    tax_breakdown: rows.map((r) => ({
      rate: r.rate,
      net: fromCents(r.netCents),
      tax: fromCents(r.taxCents),
    })),
  };
}

/** The input of computeInvoiceTotals, read from a stored invoice frontmatter. */
export function totalsInputFromFrontmatter(fm: Record<string, unknown>): InvoiceTotalsInput {
  const items = Array.isArray(fm.items) ? (fm.items as TotalsItem[]) : [];
  const expenses = Array.isArray(fm.expenses) ? (fm.expenses as TotalsExpense[]) : [];
  return {
    items,
    expenses,
    vatRate: rateFraction(fm.vat_rate, 0.2),
    advancePayment: Number(fm.advance_payment ?? 0) || 0,
    reverseCharge: fm.reverse_charge === true,
  };
}

const CHECKED_FIELDS = ["subtotal", "expense_total", "tax", "total"] as const;

/**
 * Names of the stored sum fields that do not match the positions (empty =
 * consistent). Also flags positions whose amount is not a finite number.
 */
export function checkStoredInvoiceTotals(fm: Record<string, unknown>): string[] {
  const bad: string[] = [];
  const input = totalsInputFromFrontmatter(fm);
  const all = [...input.items, ...(input.expenses ?? [])];
  if (all.some((p) => !p || !Number.isFinite(Number(p.amount)))) bad.push("items");
  const expected = computeInvoiceTotals(input);
  for (const field of CHECKED_FIELDS) {
    const stored = fm[field];
    // A missing expense_total is fine when there are no expenses.
    if (field === "expense_total" && (stored === undefined || stored === null)) {
      if (toCents(expected.expense_total) !== 0) bad.push(field);
      continue;
    }
    if (typeof stored !== "number" || !Number.isFinite(stored)) {
      bad.push(field);
      continue;
    }
    if (toCents(stored) !== toCents(expected[field])) bad.push(field);
  }
  return bad;
}
