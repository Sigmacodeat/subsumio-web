/**
 * Invoice totals — one implementation for every place that builds an
 * invoice (quick-create dialog, Copilot draft). Computed in integer cents so
 * the sum of the lines, the subtotal, VAT and the total always agree
 * (floating-point sums like 0.1 + 0.2 never leak into a stored amount).
 */

export interface InvoiceTotalsInput {
  /** Line amounts in euro (fees). */
  items: ReadonlyArray<{ amount: number }>;
  /** Disbursement amounts in euro (VAT-able like fees). */
  expenses?: ReadonlyArray<{ amount: number }>;
  /** VAT rate as a fraction, e.g. 0.2 for 20 %. */
  vatRate: number;
  /** Advance already paid, in euro; deducted after VAT, never below zero. */
  advance?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  expenseTotal: number;
  taxableBase: number;
  tax: number;
  advance: number;
  total: number;
}

const toCents = (euro: number): number => Math.round((Number.isFinite(euro) ? euro : 0) * 100);
const toEuro = (cents: number): number => cents / 100;

/** A line amount rounded to the cent (hours × rate). */
export function lineAmount(hours: number, rate: number): number {
  return toEuro(
    Math.round((Number.isFinite(hours) ? hours : 0) * (Number.isFinite(rate) ? rate : 0) * 100)
  );
}

export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotals {
  const subtotalCents = input.items.reduce((sum, i) => sum + toCents(i.amount), 0);
  const expenseCents = (input.expenses ?? []).reduce((sum, e) => sum + toCents(e.amount), 0);
  const baseCents = subtotalCents + expenseCents;
  const taxCents = Math.round(baseCents * (Number.isFinite(input.vatRate) ? input.vatRate : 0));
  const advanceCents = Math.max(0, toCents(input.advance ?? 0));
  const totalCents = Math.max(0, baseCents + taxCents - advanceCents);
  return {
    subtotal: toEuro(subtotalCents),
    expenseTotal: toEuro(expenseCents),
    taxableBase: toEuro(baseCents),
    tax: toEuro(taxCents),
    advance: toEuro(advanceCents),
    total: toEuro(totalCents),
  };
}

/**
 * Hourly rate from the firm settings ("190", "187,50", "187.50"). Returns
 * null when no usable rate is configured — callers must not invent one.
 */
export function parseHourlyRate(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (!value) return null;
  const n = Number.parseFloat(String(value).trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
