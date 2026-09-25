/**
 * Expense-Tracking Business Logic — CRUD-Helpers, Billed-Guards und
 * Billing-Integration für die `expenses[]`-Liste einer Akte.
 *
 * Pendant zu src/lib/time-tracking.ts. Bewusster Unterschied: Auslagen
 * existieren NUR als eingebettetes Array im Case-Frontmatter — es gibt keinen
 * Erzeugungspfad für standalone `expense`-Pages (UI, Legal-Chat und
 * WhatsApp-Flows schreiben alle in `caseFm.expenses`), und
 * src/lib/invoice-mark-billed.ts behandelt `expense_ids` als IDs innerhalb
 * der Akte. Deshalb gibt es hier kein Standalone-Prefix/Slug-Handling.
 */

import type { ExpenseEntry } from "@/lib/legal-types";
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

export interface MarkExpensesBilledResult {
  updated: number;
  not_found: string[];
  /** Entries already billed under a DIFFERENT invoice — never re-attributed. */
  already_billed: string[];
  entries: ExpenseEntryWithCase[];
}

// ── Errors ────────────────────────────────────────────────────────────

export class ExpensesNotFoundError extends Error {}
export class ExpensesWriteConflictError extends Error {}
export class ExpenseBilledError extends Error {}

const EXPENSES_WRITE_MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Read-modify-write mit Retry ───────────────────────────────────────

/**
 * Jeder Schreibzugriff auf `expenses` einer Akte ist ein Read-Modify-Write
 * auf das gesamte Frontmatter-Feld — die Engine kann kein atomares
 * Array-Append. Zwei konkurrierende Writer lesen dasselbe Array und das
 * zweite Merge-Update überschreibt das erste still. Dieser Wrapper liest
 * nach dem Schreiben erneut und retried bei Mismatch: "Daten still
 * verlieren" wird zu "erkennen und wiederholen", erst nach wiederholten
 * Kollisionen schlägt es hörbar fehl (409).
 */
export async function writeExpensesWithRetry<M>(
  brain: {
    getPage: (slug: string) => Promise<{ frontmatter?: unknown }>;
    updatePage: (page: { slug: string; frontmatter: Record<string, unknown> }) => Promise<unknown>;
  },
  caseSlug: string,
  compute: (
    freshEntries: ExpenseEntry[],
    freshFrontmatter: Record<string, unknown>
  ) => { nextEntries: ExpenseEntry[]; meta: M } | { notFound: true } | { billed: true },
  log?: { warn: (msg: string, ctx?: object) => void; error: (msg: string, ctx?: object) => void }
): Promise<{ entries: ExpenseEntry[]; meta: M }> {
  for (let attempt = 0; attempt < EXPENSES_WRITE_MAX_ATTEMPTS; attempt++) {
    const casePage = await brain.getPage(caseSlug);
    const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
    const freshEntries = Array.isArray(fm.expenses) ? (fm.expenses as ExpenseEntry[]) : [];

    const outcome = compute(freshEntries, fm);
    if ("notFound" in outcome) throw new ExpensesNotFoundError();
    if ("billed" in outcome) throw new ExpenseBilledError();

    await brain.updatePage({
      slug: caseSlug,
      frontmatter: { ...fm, expenses: outcome.nextEntries },
    });

    const verifyPage = await brain.getPage(caseSlug);
    const verifyFm = (verifyPage.frontmatter ?? {}) as Record<string, unknown>;
    const verifyEntries = Array.isArray(verifyFm.expenses)
      ? (verifyFm.expenses as ExpenseEntry[])
      : [];
    if (JSON.stringify(verifyEntries) === JSON.stringify(outcome.nextEntries)) {
      return { entries: outcome.nextEntries, meta: outcome.meta };
    }
    log?.warn("[expenses] write_conflict, retrying", { caseSlug, attempt });
    await sleep(25 + Math.random() * 75);
  }
  log?.error("[expenses] write_conflict exhausted retries", { caseSlug });
  throw new ExpensesWriteConflictError();
}

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
  if (opts.from) {
    result = result.filter((e) => e.date >= opts.from!);
  }
  if (opts.to) {
    result = result.filter((e) => e.date <= opts.to!);
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

export function updateExpenseEntry(
  entries: ExpenseEntry[],
  id: string,
  updates: Partial<ExpenseEntry>
): { found: boolean; billed?: boolean; entries: ExpenseEntry[]; updated?: ExpenseEntry } {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return { found: false, entries };
  // Eine abgerechnete Auslage ist Teil der Rechnungsgrundlage — Ändern oder
  // Entbuchen darf nur über unbill/mark-billed laufen, damit der Audit-Trail
  // den invoice_number-Übergang behält. Stilles Editieren würde die Rechnung
  // von ihrer Bemessungsgrundlage lösen (GoBD).
  if (entries[idx].billed) return { found: true, billed: true, entries };
  const updated = { ...entries[idx], ...updates };
  const next = [...entries];
  next[idx] = updated;
  return { found: true, entries: next, updated };
}

export function deleteExpenseEntry(
  entries: ExpenseEntry[],
  id: string
): { found: boolean; billed?: boolean; entries: ExpenseEntry[] } {
  const target = entries.find((e) => e.id === id);
  if (!target) return { found: false, entries };
  if (target.billed) return { found: true, billed: true, entries };
  const filtered = entries.filter((e) => e.id !== id);
  return { found: true, entries: filtered };
}

// ── Billing-Integration ───────────────────────────────────────────────

/**
 * Markiert mehrere Auslagen als abgerechnet (analog markEntriesBilled).
 * Einträge, die bereits unter einer ANDEREN Rechnung abgerechnet sind,
 * behalten ihre Zuordnung — sonst würde der GoBD-Trail der alten Rechnung
 * gefälscht. Retries derselben Rechnung bleiben idempotent.
 */
export function markExpensesBilled(
  entries: ExpenseEntryWithCase[],
  ids: string[],
  invoiceNumber: string
): MarkExpensesBilledResult {
  const idSet = new Set(ids);
  const notFound: string[] = [];
  const alreadyBilled: string[] = [];
  const updated: ExpenseEntryWithCase[] = [];

  for (const id of ids) {
    if (!entries.some((e) => e.id === id)) {
      notFound.push(id);
    }
  }

  const result = entries.map((e) => {
    if (idSet.has(e.id)) {
      if (e.billed && e.invoice_number && e.invoice_number !== invoiceNumber) {
        alreadyBilled.push(e.id);
        return e;
      }
      const updatedEntry = {
        ...e,
        billed: true,
        invoice_number: invoiceNumber,
      };
      updated.push(updatedEntry);
      return updatedEntry;
    }
    return e;
  });

  return {
    updated: updated.length,
    not_found: notFound,
    already_billed: alreadyBilled,
    entries: result,
  };
}

/**
 * Hebt die Abrechnungsmarkierung für angegebene Auslagen auf.
 * Setzt billed=false und entfernt invoice_number.
 */
export function unbillExpenses(
  entries: ExpenseEntryWithCase[],
  ids: string[]
): MarkExpensesBilledResult {
  const idSet = new Set(ids);
  const notFound: string[] = [];
  const updated: ExpenseEntryWithCase[] = [];

  for (const id of ids) {
    if (!entries.some((e) => e.id === id)) {
      notFound.push(id);
    }
  }

  const result = entries.map((e) => {
    if (idSet.has(e.id)) {
      const { invoice_number: _inv, ...rest } = e;
      const updatedEntry: ExpenseEntryWithCase = { ...rest, billed: false };
      updated.push(updatedEntry);
      return updatedEntry;
    }
    return e;
  });

  return {
    updated: updated.length,
    not_found: notFound,
    already_billed: [],
    entries: result,
  };
}
