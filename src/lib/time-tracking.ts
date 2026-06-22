/**
 * Time-Tracking Business Logic — Filterung, Zusammenfassung,
 * Billing-Integration und CRUD-Helpers für Zeiterfassungs-Einträge.
 *
 * Extrahiert aus der API-Route src/app/api/time/route.ts,
 * damit die Logik testbar und von anderen Modulen (Invoicing, Dashboard)
 * wiederverwendbar ist.
 */

import type { TimeEntry } from "@/lib/legal-types";

// ── Types ─────────────────────────────────────────────────────────────

export interface TimeEntryWithCase extends TimeEntry {
  case_slug?: string;
}

export interface TimeQueryFilters {
  billable?: boolean;
  unbilled?: boolean;
  from?: string;
  to?: string;
  lawyer?: string;
}

export interface TimeSummary {
  total_minutes: number;
  total_hours: number;
  billable_amount: number;
}

export interface BillingSummaryEntry {
  case_slug: string;
  case_title?: string;
  entry_count: number;
  total_minutes: number;
  total_hours: number;
  billable_amount: number;
  entries: TimeEntryWithCase[];
}

export interface BillingSummary {
  total_unbilled_entries: number;
  total_unbilled_minutes: number;
  total_unbilled_hours: number;
  total_unbilled_amount: number;
  by_case: BillingSummaryEntry[];
}

export interface MarkBilledResult {
  updated: number;
  not_found: string[];
  entries: TimeEntryWithCase[];
}

// ── Filtering ─────────────────────────────────────────────────────────

export function filterEntries(
  entries: TimeEntryWithCase[],
  opts: TimeQueryFilters
): TimeEntryWithCase[] {
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
  if (opts.lawyer) {
    const lower = opts.lawyer.toLowerCase();
    result = result.filter((e) => e.lawyer?.toLowerCase().includes(lower));
  }
  return result;
}

// ── Summary ───────────────────────────────────────────────────────────

export function computeSummary(entries: TimeEntry[]): TimeSummary {
  const totalMinutes = entries.reduce((sum, e) => sum + (e.minutes || 0), 0);
  const totalAmount = entries.reduce((sum, e) => {
    if (!e.billable) return sum;
    const hours = (e.minutes || 0) / 60;
    return sum + hours * (e.rate || 0);
  }, 0);

  return {
    total_minutes: totalMinutes,
    total_hours: Math.round((totalMinutes / 60) * 100) / 100,
    billable_amount: Math.round(totalAmount * 100) / 100,
  };
}

// ── CRUD Helpers ──────────────────────────────────────────────────────

export function createTimeEntry(input: {
  description: string;
  minutes: number;
  date: string;
  rate?: number;
  billable?: boolean;
  lawyer?: string;
  activity_type?: string;
}): TimeEntry {
  return {
    id: `time-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    description: input.description,
    minutes: input.minutes,
    date: input.date,
    rate: input.rate,
    billable: input.billable ?? true,
    billed: false,
    lawyer: input.lawyer,
    activity_type: input.activity_type,
  };
}

export function updateEntry(
  entries: TimeEntry[],
  id: string,
  updates: Partial<TimeEntry>
): { found: boolean; entries: TimeEntry[]; updated?: TimeEntry } {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return { found: false, entries };
  const updated = { ...entries[idx], ...updates };
  const next = [...entries];
  next[idx] = updated;
  return { found: true, entries: next, updated };
}

export function deleteEntry(
  entries: TimeEntry[],
  id: string
): { found: boolean; entries: TimeEntry[] } {
  const filtered = entries.filter((e) => e.id !== id);
  return {
    found: filtered.length < entries.length,
    entries: filtered,
  };
}

// ── Billing Integration ───────────────────────────────────────────────

/**
 * Gruppiert abrechenbare, nicht-abgerechnete Zeiteinträge nach Akte.
 * Liefert eine Zusammenfassung pro Akte + Gesamtwerte.
 */
export function computeBillingSummary(
  entries: TimeEntryWithCase[],
  defaultRate?: number
): BillingSummary {
  const unbilled = entries.filter((e) => e.billable !== false && !e.billed);

  const byCaseMap = new Map<string, TimeEntryWithCase[]>();
  for (const entry of unbilled) {
    const caseSlug = entry.case_slug ?? "_unknown";
    const list = byCaseMap.get(caseSlug) ?? [];
    list.push(entry);
    byCaseMap.set(caseSlug, list);
  }

  const by_case: BillingSummaryEntry[] = [];
  for (const [caseSlug, caseEntries] of byCaseMap) {
    const summary = computeSummary(caseEntries);
    const amount = caseEntries.reduce((sum, e) => {
      const hours = (e.minutes || 0) / 60;
      const rate = e.rate || defaultRate || 0;
      return sum + hours * rate;
    }, 0);

    by_case.push({
      case_slug: caseSlug,
      entry_count: caseEntries.length,
      total_minutes: summary.total_minutes,
      total_hours: summary.total_hours,
      billable_amount: Math.round(amount * 100) / 100,
      entries: caseEntries,
    });
  }

  by_case.sort((a, b) => b.billable_amount - a.billable_amount);

  const totalUnbilledMinutes = unbilled.reduce((sum, e) => sum + (e.minutes || 0), 0);
  const totalUnbilledAmount = by_case.reduce((sum, c) => sum + c.billable_amount, 0);

  return {
    total_unbilled_entries: unbilled.length,
    total_unbilled_minutes: totalUnbilledMinutes,
    total_unbilled_hours: Math.round((totalUnbilledMinutes / 60) * 100) / 100,
    total_unbilled_amount: Math.round(totalUnbilledAmount * 100) / 100,
    by_case,
  };
}

/**
 * Markiert mehrere Zeiteinträge als abgerechnet.
 * Erwartet Einträge mit case_slug, gruppiert nach Akte
 * und gibt die aktualisierten Einträge pro Akte zurück.
 */
export function markEntriesBilled(
  entries: TimeEntryWithCase[],
  ids: string[],
  invoiceNumber: string,
  _at?: Date
): MarkBilledResult {
  const idSet = new Set(ids);
  const notFound: string[] = [];
  const updated: TimeEntryWithCase[] = [];

  for (const id of ids) {
    if (!entries.some((e) => e.id === id)) {
      notFound.push(id);
    }
  }

  const result = entries.map((e) => {
    if (idSet.has(e.id)) {
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
    entries: result,
  };
}

/**
 * Gruppiert aktualisierte Einträge nach case_slug für
 * Brain-Page-Updates (eine Update-Anfrage pro Akte).
 */
export function groupByCase(entries: TimeEntryWithCase[]): Map<string, TimeEntry[]> {
  const byCase = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const caseSlug = entry.case_slug ?? "_unknown";
    const list = byCase.get(caseSlug) ?? [];
    const { case_slug: _cs, ...entryWithoutCase } = entry;
    list.push(entryWithoutCase);
    byCase.set(caseSlug, list);
  }
  return byCase;
}
