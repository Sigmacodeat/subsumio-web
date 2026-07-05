/**
 * Time-Tracking Business Logic — Filterung, Zusammenfassung,
 * Billing-Integration und CRUD-Helpers für Zeiterfassungs-Einträge.
 *
 * Extrahiert aus der API-Route src/app/api/time/route.ts,
 * damit die Logik testbar und von anderen Modulen (Invoicing, Dashboard)
 * wiederverwendbar ist.
 *
 * Erweitert um passive/automatische Zeiterfassung (W3.2).
 */

import type { TimeEntry } from "@/lib/legal-types";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { createHash } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────

export type ActivityType =
  | "document" // Dokument öffnen/bearbeiten
  | "query" // Query ausführen
  | "case" // Case bearbeiten
  | "meeting" // Meeting/Konferenz
  | "email" // E-Mail schreiben/lesen
  | "phone" // Telefonat
  | "review" // Review/Prüfung
  | "other"; // Sonstige Tätigkeit

export interface CurrentActivity {
  user_id: string;
  brain_id: string;
  case_slug?: string;
  activity_type: ActivityType;
  description: string;
  started_at: string;
  last_activity_at: string;
}

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

/**
 * Hebt die Abrechnungsmarkierung für angegebene Einträge auf.
 * Setzt billed=false und entfernt invoice_number.
 */
export function unbillEntries(entries: TimeEntryWithCase[], ids: string[]): MarkBilledResult {
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
      const { invoice_number: _inv, ...rest } = e;
      const updatedEntry: TimeEntryWithCase = { ...rest, billed: false };
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

// ── Passive Time Tracking (W3.2) ───────────────────────────────────────

function timeEntrySlug(userId: string, startedAt: string): string {
  const timestamp = new Date(startedAt).getTime().toString(36);
  const hash = createHash("sha256").update(`${userId}${startedAt}`).digest("hex").slice(0, 8);
  return `time-entries/${userId}/${timestamp}-${hash}`;
}

function currentActivitySlug(userId: string, brainId: string): string {
  return `current-activity/${userId}/${brainId}`;
}

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * Set current activity for a user (starts passive time tracking).
 */
export async function setCurrentActivity(activity: CurrentActivity): Promise<void> {
  const headers = {
    ...engineHeadersForBrain(activity.brain_id),
    "Content-Type": "application/json",
  };
  const slug = currentActivitySlug(activity.user_id, activity.brain_id);

  const payload = {
    ...activity,
    last_activity_at: new Date().toISOString(),
  };

  const create = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug,
      title: `Current Activity: ${activity.description}`,
      type: "current_activity",
      frontmatter: payload,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!create.ok) {
    // Try update instead
    const update = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        frontmatter: payload,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!update.ok) {
      throw new Error(`current_activity_set_failed_${update.status}`);
    }
  }
}

/**
 * Get current activity for a user.
 */
export async function getCurrentActivity(
  brainId: string,
  userId: string
): Promise<CurrentActivity | null> {
  const headers = engineHeadersForBrain(brainId);
  const slug = currentActivitySlug(userId, brainId);

  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
    headers,
    signal: AbortSignal.timeout(5_000),
  });

  if (!res.ok) {
    return null;
  }

  const page = await res.json();
  return page.frontmatter as CurrentActivity;
}

/**
 * Update last_activity_at for current activity (heartbeat).
 */
export async function updateActivityHeartbeat(brainId: string, userId: string): Promise<void> {
  const current = await getCurrentActivity(brainId, userId);
  if (!current) return;

  const headers = {
    ...engineHeadersForBrain(brainId),
    "Content-Type": "application/json",
  };
  const slug = currentActivitySlug(userId, brainId);

  await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      frontmatter: {
        ...current,
        last_activity_at: new Date().toISOString(),
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Clear current activity for a user.
 */
export async function clearCurrentActivity(brainId: string, userId: string): Promise<void> {
  const headers = engineHeadersForBrain(brainId);
  const slug = currentActivitySlug(userId, brainId);

  await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
    method: "DELETE",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Stop current activity and create time entry.
 */
export async function stopCurrentActivity(brainId: string, userId: string): Promise<string | null> {
  const current = await getCurrentActivity(brainId, userId);
  if (!current) return null;

  const endedAt = new Date().toISOString();
  const startedAt = new Date(current.started_at);
  const duration = Math.floor((new Date(endedAt).getTime() - startedAt.getTime()) / 1000);

  // Only create entry if duration > 60 seconds (1 minute minimum)
  if (duration < 60) {
    await clearCurrentActivity(brainId, userId);
    return null;
  }

  // Create time entry via Brain API
  const entryId = timeEntrySlug(userId, current.started_at);
  const headers = {
    ...engineHeadersForBrain(brainId),
    "Content-Type": "application/json",
  };

  const timeEntryPayload = {
    id: entryId,
    description: current.description,
    minutes: Math.floor(duration / 60),
    date: current.started_at.split("T")[0],
    rate: undefined,
    billable: true,
    billed: false,
    lawyer: undefined,
    activity_type: current.activity_type,
    case_slug: current.case_slug,
    is_auto_generated: true,
    started_at: current.started_at,
    ended_at: endedAt,
    duration_seconds: duration,
  };

  const create = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug: entryId,
      title: current.description,
      type: "time_entry",
      frontmatter: timeEntryPayload,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!create.ok) {
    throw new Error(`time_entry_create_failed_${create.status}`);
  }

  // Clear current activity
  await clearCurrentActivity(brainId, userId);

  return entryId;
}
