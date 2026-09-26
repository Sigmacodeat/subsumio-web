/**
 * Expense-Tracking Business Logic — CRUD-Helpers, Billed-Guards und
 * Billing-Integration für die `expenses[]`-Liste einer Akte.
 *
 * Pendant zu src/lib/time-tracking.ts. Bewusster Unterschied: Auslagen
 * existieren NUR als eingebettetes Array im Case-Frontmatter — es gibt keinen
 * Erzeugungspfad für standalone `expense`-Pages (UI, Legal-Chat und
 * WhatsApp-Flows schreiben alle in `caseFm.expenses`), und
 * src/lib/invoice-billing-lock.ts behandelt `expense_entry_ids` als IDs
 * innerhalb der Akte. Deshalb gibt es hier kein Standalone-Prefix/Slug-Handling.
 *
 * Jeder Schreibzugriff läuft über die atomaren Engine-Operationen
 * `page_array_append` / `page_array_mutate` (ein UPDATE, Guard in der
 * Engine) — wie die Zeiteinträge seit PR #56. Ein Read-Modify-Write mit
 * Verify-Read (die erste Fassung) konnte zwei parallel erstellte Rechnungen
 * dieselbe Auslage doppelt abrechnen lassen: beide lasen `billed:false`,
 * beide schrieben, und der Verify-Read sah jeweils nur den eigenen Stand.
 */

import type { ExpenseEntry } from "@/lib/legal-types";
import type {
  PageArrayAppendResult,
  PageArrayMutateResult,
  PageArrayMutation,
} from "@/lib/server-brain";
import { listAllPagesOfType } from "@/lib/time-tracking";

// ── Types ─────────────────────────────────────────────────────────────

export interface ExpenseEntryWithCase extends ExpenseEntry {
  case_slug?: string;
}

export interface ExpenseQueryFilters {
  billable?: boolean;
  unbilled?: boolean;
  from?: string;
  to?: string;
}

export interface ExpenseSummary {
  total_amount: number;
  billable_amount: number;
  unbilled_amount: number;
  billed_amount: number;
}

export interface ExpenseBillingResult {
  updated: number;
  not_found: string[];
  /** Entries already billed under a DIFFERENT invoice — never re-attributed. */
  already_billed: string[];
}

/** The two atomic array ops the server brain client exposes. */
export interface ExpensesArrayClient {
  appendPageArray(slug: string, field: string, items: unknown[]): Promise<PageArrayAppendResult>;
  mutatePageArray(
    slug: string,
    field: string,
    mutation: PageArrayMutation
  ): Promise<PageArrayMutateResult>;
}

export const EXPENSES_FIELD = "expenses";

// ── Errors ────────────────────────────────────────────────────────────

export class ExpensesNotFoundError extends Error {}
export class ExpenseBilledError extends Error {}

// ── Lesen ─────────────────────────────────────────────────────────────

/**
 * Kanzleiweite Auslagenliste: die `expenses`-Arrays aller Akten
 * (keine Standalone-Pages — siehe Modulkommentar).
 */
export async function listAllExpenses(brain: {
  listPages: (opts: { type: string; limit: number; offset: number }) => Promise<unknown[]>;
}): Promise<ExpenseEntryWithCase[]> {
  const cases = await listAllPagesOfType(brain, "legal_case");
  const seen = new Set<string>();
  return cases
    .flatMap((c) => {
      const fm = (c.frontmatter ?? {}) as Record<string, unknown>;
      if (String(fm.status ?? "") === "tombstoned") return [];
      const raw = Array.isArray(fm.expenses) ? (fm.expenses as ExpenseEntry[]) : [];
      return raw.map((e) => ({ ...e, case_slug: c.slug }));
    })
    .filter((e) => {
      const key = `${e.case_slug ?? ""}#${e.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Calendar day (YYYY-MM-DD) of an expense date that may carry a time part. */
function dayOf(date: string): string {
  return String(date).slice(0, 10);
}

export function filterExpenses(
  entries: ExpenseEntryWithCase[],
  opts: ExpenseQueryFilters
): ExpenseEntryWithCase[] {
  let result = [...entries];
  if (opts.billable !== undefined) {
    result = result.filter((e) => e.billable === opts.billable);
  }
  if (opts.unbilled) {
    result = result.filter((e) => !e.billed);
  }
  // Compare calendar days: the UI stores `date` as a full ISO timestamp, so a
  // plain string compare against `to=2026-09-25` would drop that day's
  // expenses.
  if (opts.from) {
    result = result.filter((e) => dayOf(e.date) >= dayOf(opts.from!));
  }
  if (opts.to) {
    result = result.filter((e) => dayOf(e.date) <= dayOf(opts.to!));
  }
  return result;
}

export function computeExpenseSummary(entries: ExpenseEntry[]): ExpenseSummary {
  const round = (n: number) => Math.round(n * 100) / 100;
  const total = entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const billable = entries
    .filter((e) => e.billable !== false)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const billed = entries
    .filter((e) => e.billed)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const unbilled = entries
    .filter((e) => e.billable !== false && !e.billed)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  return {
    total_amount: round(total),
    billable_amount: round(billable),
    unbilled_amount: round(unbilled),
    billed_amount: round(billed),
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────

export function createExpense(input: {
  description: string;
  amount: number;
  date: string;
  currency?: string;
  vat_rate?: number;
  billable?: boolean;
  receipt_slug?: string;
}): ExpenseEntry {
  return {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: input.description,
    amount: input.amount,
    date: input.date,
    currency: input.currency ?? "EUR",
    vat_rate: input.vat_rate,
    billable: input.billable ?? true,
    billed: false,
    receipt_slug: input.receipt_slug,
  };
}

/** Atomic append — no read-modify-write, so parallel creates never lose one. */
export async function appendExpense(
  brain: ExpensesArrayClient,
  caseSlug: string,
  entry: ExpenseEntry
): Promise<void> {
  await brain.appendPageArray(caseSlug, EXPENSES_FIELD, [entry]);
}

/**
 * Eine abgerechnete Auslage ist Teil der Rechnungsgrundlage — Ändern oder
 * Löschen darf nur über unbill/mark-billed laufen, damit der Audit-Trail den
 * invoice_number-Übergang behält. Stilles Editieren würde die Rechnung von
 * ihrer Bemessungsgrundlage lösen (GoBD). Der Guard läuft IN der Engine, im
 * selben UPDATE — eine parallel laufende Abrechnung kann ihn nicht überholen.
 */
const NOT_WHEN_BILLED = { eq: { billed: true } };

export async function updateExpenseAtomic(
  brain: ExpensesArrayClient,
  caseSlug: string,
  id: string,
  updates: Partial<ExpenseEntry>
): Promise<ExpenseEntry> {
  const res = await brain.mutatePageArray(caseSlug, EXPENSES_FIELD, {
    match: [id],
    set: updates,
    unless: NOT_WHEN_BILLED,
  });
  if (res.not_found_ids.includes(id)) throw new ExpensesNotFoundError();
  if (res.skipped_ids.includes(id)) throw new ExpenseBilledError();
  const updated = (res.items as ExpenseEntry[]).find((e) => e && e.id === id);
  if (!updated) throw new ExpensesNotFoundError();
  return updated;
}

export async function deleteExpenseAtomic(
  brain: ExpensesArrayClient,
  caseSlug: string,
  id: string
): Promise<void> {
  const res = await brain.mutatePageArray(caseSlug, EXPENSES_FIELD, {
    match: [id],
    remove: true,
    unless: NOT_WHEN_BILLED,
  });
  if (res.not_found_ids.includes(id)) throw new ExpensesNotFoundError();
  if (res.skipped_ids.includes(id)) throw new ExpenseBilledError();
}

// ── Billing-Integration ───────────────────────────────────────────────

/**
 * Markiert Auslagen als abgerechnet — atomar, analog markTimeEntriesBilled.
 * Der `unless`-Guard wird im UPDATE ausgewertet: Einträge, die bereits unter
 * einer ANDEREN Rechnung abgerechnet sind, werden übersprungen (als
 * already_billed gemeldet, nie umgehängt — sonst würde der GoBD-Trail der
 * alten Rechnung gefälscht); Retries derselben Rechnung bleiben idempotent.
 */
export async function markExpensesBilledAtomic(
  brain: ExpensesArrayClient,
  caseSlug: string,
  ids: string[],
  invoiceNumber: string
): Promise<ExpenseBillingResult> {
  if (ids.length === 0) return { updated: 0, not_found: [], already_billed: [] };
  const res = await brain.mutatePageArray(caseSlug, EXPENSES_FIELD, {
    match: ids,
    set: { billed: true, invoice_number: invoiceNumber },
    // Skip only entries billed under a different invoice: eq requires
    // billed === true AND ne requires invoice_number present-and-different.
    unless: { eq: { billed: true }, ne: { invoice_number: invoiceNumber } },
  });
  return {
    updated: res.updated_ids.length,
    not_found: res.not_found_ids,
    already_billed: res.skipped_ids,
  };
}

/**
 * Hebt die Abrechnungsmarkierung auf: billed=false, invoice_number weg — atomar.
 * Mit `onlyInvoiceNumber` bleiben Auslagen, die inzwischen unter einer anderen
 * Rechnung stehen, im selben UPDATE unangetastet.
 */
export async function unbillExpensesAtomic(
  brain: ExpensesArrayClient,
  caseSlug: string,
  ids: string[],
  onlyInvoiceNumber?: string
): Promise<{ updated: number; not_found: string[] }> {
  if (ids.length === 0) return { updated: 0, not_found: [] };
  const res = await brain.mutatePageArray(caseSlug, EXPENSES_FIELD, {
    match: ids,
    set: { billed: false },
    unset: ["invoice_number"],
    ...(onlyInvoiceNumber !== undefined
      ? { unless: { ne: { invoice_number: onlyInvoiceNumber } } }
      : {}),
  });
  return { updated: res.updated_ids.length, not_found: res.not_found_ids };
}
