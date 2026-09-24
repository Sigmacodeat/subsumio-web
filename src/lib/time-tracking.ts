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

export class TimeEntriesNotFoundError extends Error {}
export class TimeEntriesWriteConflictError extends Error {}
export class TimeEntryBilledError extends Error {}

const TIME_ENTRIES_WRITE_MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every write to a matter's `time_entries` array is a read-modify-write on
 * the whole frontmatter field — the engine has no atomic array-append. Two
 * concurrent writers can read the same array and the second merge-update
 * silently clobbers the first. This wrapper re-reads after the write and
 * retries on mismatch: "silently lose data" becomes "detect and retry",
 * failing loudly (409) only after repeated collisions.
 */
export async function writeTimeEntriesWithRetry<M>(
  brain: { getPage: (slug: string) => Promise<{ frontmatter?: unknown }>; updatePage: (page: { slug: string; frontmatter: Record<string, unknown> }) => Promise<unknown> },
  caseSlug: string,
  compute: (
    freshEntries: TimeEntry[],
    freshFrontmatter: Record<string, unknown>
  ) => { nextEntries: TimeEntry[]; meta: M } | { notFound: true } | { billed: true },
  log?: { warn: (msg: string, ctx?: object) => void; error: (msg: string, ctx?: object) => void }
): Promise<{ entries: TimeEntry[]; meta: M }> {
  for (let attempt = 0; attempt < TIME_ENTRIES_WRITE_MAX_ATTEMPTS; attempt++) {
    const casePage = await brain.getPage(caseSlug);
    const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
    const freshEntries = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];

    const outcome = compute(freshEntries, fm);
    if ("notFound" in outcome) throw new TimeEntriesNotFoundError();
    if ("billed" in outcome) throw new TimeEntryBilledError();

    await brain.updatePage({
      slug: caseSlug,
      frontmatter: { ...fm, time_entries: outcome.nextEntries },
    });

    const verifyPage = await brain.getPage(caseSlug);
    const verifyFm = (verifyPage.frontmatter ?? {}) as Record<string, unknown>;
    const verifyEntries = Array.isArray(verifyFm.time_entries)
      ? (verifyFm.time_entries as TimeEntry[])
      : [];
    if (JSON.stringify(verifyEntries) === JSON.stringify(outcome.nextEntries)) {
      return { entries: outcome.nextEntries, meta: outcome.meta };
    }
    log?.warn("[time] write_conflict, retrying", { caseSlug, attempt });
    await sleep(25 + Math.random() * 75);
  }
  log?.error("[time] write_conflict exhausted retries", { caseSlug });
  throw new TimeEntriesWriteConflictError();
}

/** The engine returns at most 100 pages per request; page through the rest. */
export async function listAllPagesOfType(
  brain: { listPages: (opts: { type: string; limit: number; offset: number }) => Promise<unknown[]> },
  type: string,
  max = 5000
) {
  const out: unknown[] = [];
  for (let offset = 0; offset < max; offset += 100) {
    const batch = await brain.listPages({ type, limit: 100, offset });
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out as Array<{ slug: string; frontmatter?: unknown }>;
}

/**
 * Firm-wide entry list: standalone `time_entry` pages (timer, imports) merged
 * with the `time_entries` array embedded in each matter. Shared by /api/time
 * and /api/time/billing-summary so both report identical numbers.
 */
export async function listAllTimeEntries(brain: {
  listPages: (opts: { type: string; limit: number; offset: number }) => Promise<unknown[]>;
}): Promise<TimeEntryWithCase[]> {
  const [pages, cases] = await Promise.all([
    listAllPagesOfType(brain, "time_entry"),
    listAllPagesOfType(brain, "legal_case"),
  ]);
  const fromPages: TimeEntryWithCase[] = pages.map((p) => {
    const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
    return {
      id: p.slug,
      description: String(fm.description ?? ""),
      minutes: Number(fm.minutes ?? 0),
      date: String(fm.date ?? ""),
      rate: fm.rate ? Number(fm.rate) : undefined,
      billable: Boolean(fm.billable),
      billed: Boolean(fm.billed),
      invoice_number: fm.invoice_number ? String(fm.invoice_number) : undefined,
      lawyer: fm.lawyer ? String(fm.lawyer) : undefined,
      activity_type: fm.activity_type ? String(fm.activity_type) : undefined,
      case_slug: fm.case_slug ? String(fm.case_slug) : undefined,
    };
  });
  const fromCases: TimeEntryWithCase[] = cases.flatMap((c) => {
    const fm = (c.frontmatter ?? {}) as Record<string, unknown>;
    if (String(fm.status ?? "") === "tombstoned") return [];
    const raw = Array.isArray(fm.time_entries) ? (fm.time_entries as TimeEntry[]) : [];
    return raw.map((e) => ({ ...e, case_slug: c.slug }));
  });
  const seen = new Set<string>();
  return [...fromCases, ...fromPages]
    .filter((e) => {
      const key = `${e.case_slug ?? ""}#${e.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}


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
): { found: boolean; billed?: boolean; entries: TimeEntry[]; updated?: TimeEntry } {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return { found: false, entries };
  // A billed entry is part of an invoice's basis — changing or un-billing it
  // must go through unbill/mark-billed so the audit trail keeps the
  // invoice_number transition. Editing silently would detach the invoice
  // from the work it charges (GoBD).
  if (entries[idx].billed) return { found: true, billed: true, entries };
  const updated = { ...entries[idx], ...updates };
  const next = [...entries];
  next[idx] = updated;
  return { found: true, entries: next, updated };
}

export function deleteEntry(
  entries: TimeEntry[],
  id: string
): { found: boolean; billed?: boolean; entries: TimeEntry[] } {
  const target = entries.find((e) => e.id === id);
  if (!target) return { found: false, entries };
  if (target.billed) return { found: true, billed: true, entries };
  const filtered = entries.filter((e) => e.id !== id);
  return { found: true, entries: filtered };
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
 * Engine headers for the time-tracking calls below. Routes pass the signed-in
 * user's `ctx.headers` (identity-bearing, so the engine applies the matter
 * access rules); only the inactivity cron, which has no user session, falls
 * back to the bare firm headers.
 */
function timeHeaders(brainId: string, callerHeaders?: Record<string, string>) {
  return callerHeaders ?? engineHeadersForBrain(brainId);
}

/**
 * Set current activity for a user (starts passive time tracking).
 */
export async function setCurrentActivity(
  activity: CurrentActivity,
  callerHeaders?: Record<string, string>
): Promise<void> {
  const headers = {
    ...timeHeaders(activity.brain_id, callerHeaders),
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
  userId: string,
  callerHeaders?: Record<string, string>
): Promise<CurrentActivity | null> {
  const headers = timeHeaders(brainId, callerHeaders);
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
export async function updateActivityHeartbeat(
  brainId: string,
  userId: string,
  callerHeaders?: Record<string, string>
): Promise<void> {
  const current = await getCurrentActivity(brainId, userId, callerHeaders);
  if (!current) return;

  const headers = {
    ...timeHeaders(brainId, callerHeaders),
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
export async function clearCurrentActivity(
  brainId: string,
  userId: string,
  callerHeaders?: Record<string, string>
): Promise<void> {
  const headers = timeHeaders(brainId, callerHeaders);
  const slug = currentActivitySlug(userId, brainId);

  await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
    method: "DELETE",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * Stop current activity and create time entry.
 *
 * `endedAt` overrides the end timestamp — the inactivity cron passes the
 * last real heartbeat (`last_activity_at`) so the idle tail between the
 * lawyer's last action and the cron run is not billed.
 */
export async function stopCurrentActivity(
  brainId: string,
  userId: string,
  callerHeaders?: Record<string, string>,
  endedAtOverride?: string
): Promise<string | null> {
  const current = await getCurrentActivity(brainId, userId, callerHeaders);
  if (!current) return null;

  const endedAt = endedAtOverride ?? new Date().toISOString();
  const startedAt = new Date(current.started_at);
  const duration = Math.floor((new Date(endedAt).getTime() - startedAt.getTime()) / 1000);

  // Only create entry if duration > 60 seconds (1 minute minimum)
  if (duration < 60) {
    await clearCurrentActivity(brainId, userId, callerHeaders);
    return null;
  }

  // Create time entry via Brain API
  const entryId = timeEntrySlug(userId, current.started_at);
  const headers = {
    ...timeHeaders(brainId, callerHeaders),
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
    // The entry slug is deterministic (user + started_at), so a conflict means
    // an earlier stop already wrote the entry but failed to clear the
    // activity — treat it as done instead of wedging the timer forever.
    if (create.status === 409) {
      await clearCurrentActivity(brainId, userId, callerHeaders);
      return entryId;
    }
    throw new Error(`time_entry_create_failed_${create.status}`);
  }

  // Clear current activity
  await clearCurrentActivity(brainId, userId, callerHeaders);

  return entryId;
}
