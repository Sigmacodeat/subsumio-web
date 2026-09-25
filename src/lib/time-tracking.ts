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
import type { PageArrayMutation, PageArrayMutateResult } from "@/lib/server-brain";
import { zonedDateString } from "@/lib/datetime";
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
  /** Set on entries the timer/passive capture created (stopCurrentActivity). */
  is_auto_generated?: boolean;
}

/**
 * Map a standalone `time_entry` page (timer stops, imports — id IS the page
 * slug under `time-entries/…`) to the shared entry shape. Used by the firm
 * list and by the PATCH/DELETE fallback in /api/time.
 */
export function standaloneEntryFromPage(
  slug: string,
  fm: Record<string, unknown>
): TimeEntryWithCase {
  return {
    id: slug,
    description: String(fm.description ?? ""),
    minutes: Number(fm.minutes ?? 0),
    date: String(fm.date ?? ""),
    // `!= null`, not truthiness — an explicit rate of 0 (pro bono) must
    // survive as 0, not fall back to the default rate.
    rate: fm.rate != null ? Number(fm.rate) : undefined,
    billable: Boolean(fm.billable),
    billed: Boolean(fm.billed),
    invoice_number: fm.invoice_number ? String(fm.invoice_number) : undefined,
    lawyer: fm.lawyer ? String(fm.lawyer) : undefined,
    activity_type: fm.activity_type ? String(fm.activity_type) : undefined,
    case_slug: fm.case_slug ? String(fm.case_slug) : undefined,
    is_auto_generated: fm.is_auto_generated === true,
  };
}

/** Standalone `time_entry` pages carry their id as the page slug. */
export const STANDALONE_ENTRY_PREFIX = "time-entries/";

export interface StandaloneBillingResult {
  updated: number;
  not_found: string[];
  /** Entries already covered by a different invoice — never overwritten. */
  already_billed: string[];
}

/**
 * Mark or unmark standalone `time_entry` pages (timer stops, imports).
 * Unlike the matter-embedded array, each entry is its own page — a PATCH
 * on one page can't clobber a sibling, so no read-modify-write retry is
 * needed. Billing a page already billed under a DIFFERENT invoice is
 * refused (already_billed) rather than silently re-attributed.
 */
export async function updateStandaloneBilling(
  brain: {
    getPage: (slug: string) => Promise<{ frontmatter?: unknown } | null>;
    updatePage: (input: { slug: string; frontmatter: Record<string, unknown> }) => Promise<unknown>;
  },
  ids: string[],
  mode: { billed: true; invoiceNumber: string } | { billed: false }
): Promise<StandaloneBillingResult> {
  const result: StandaloneBillingResult = { updated: 0, not_found: [], already_billed: [] };
  for (const id of ids) {
    if (!id.startsWith(STANDALONE_ENTRY_PREFIX)) {
      result.not_found.push(id);
      continue;
    }
    const page = await brain.getPage(id).catch(() => null);
    const fm = (page?.frontmatter ?? null) as Record<string, unknown> | null;
    if (!fm || fm.status === "tombstoned") {
      result.not_found.push(id);
      continue;
    }
    if (mode.billed) {
      if (fm.billed === true && fm.invoice_number !== mode.invoiceNumber) {
        result.already_billed.push(id);
        continue;
      }
      await brain.updatePage({
        slug: id,
        frontmatter: { ...fm, billed: true, invoice_number: mode.invoiceNumber },
      });
    } else {
      const nextFm: Record<string, unknown> = { ...fm, billed: false };
      delete nextFm.invoice_number;
      await brain.updatePage({ slug: id, frontmatter: nextFm });
    }
    result.updated += 1;
  }
  return result;
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
  /** Entries already billed under a DIFFERENT invoice — never re-attributed. */
  already_billed: string[];
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
export class TimeEntryBilledError extends Error {}

/**
 * Minimal client shape for the atomic time_entries helpers — implemented by
 * `ServerBrainClient` (createServerBrainClient). The engine applies the
 * mutation in a single UPDATE statement; there is no read-modify-write
 * window, so the old write-verify-retry workaround is gone.
 */
export interface TimeEntriesArrayClient {
  appendPageArray(slug: string, field: string, items: unknown[]): Promise<{ items: unknown[] }>;
  mutatePageArray(
    slug: string,
    field: string,
    mutation: PageArrayMutation
  ): Promise<PageArrayMutateResult>;
}

const TIME_ENTRIES_FIELD = "time_entries";

/**
 * Append entries to a matter's time_entries atomically. Missing field
 * becomes an array; the page must exist (404 from the engine otherwise).
 */
export async function appendTimeEntries(
  brain: TimeEntriesArrayClient,
  caseSlug: string,
  entries: TimeEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  await brain.appendPageArray(caseSlug, TIME_ENTRIES_FIELD, entries);
}

/**
 * Patch one embedded entry by id. Billed entries are skipped by the engine's
 * `unless` guard inside the same statement — a concurrent mark-billed that
 * lands between our read and write can never be silently overwritten.
 * `undefined` values in `updates` remove the key (old merge semantics).
 */
export async function updateTimeEntry(
  brain: TimeEntriesArrayClient,
  caseSlug: string,
  id: string,
  updates: Partial<TimeEntry>
): Promise<TimeEntry> {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const [k, v] of Object.entries(updates)) {
    if (k === "id") continue; // identity is stable — never rewritten
    if (v === undefined) unset.push(k);
    else set[k] = v;
  }
  const res = await brain.mutatePageArray(caseSlug, TIME_ENTRIES_FIELD, {
    match: [id],
    set,
    unset: unset.length > 0 ? unset : undefined,
    // A billed entry is part of an invoice's basis — edits must go through
    // unbill/mark-billed so the audit trail keeps the invoice transition.
    unless: { eq: { billed: true } },
  });
  if (res.not_found_ids.includes(id)) throw new TimeEntriesNotFoundError();
  if (res.skipped_ids.includes(id)) throw new TimeEntryBilledError();
  const updated = (res.items as TimeEntry[]).find((e) => e && e.id === id);
  if (!updated) throw new TimeEntriesNotFoundError();
  return updated;
}

/**
 * Remove one embedded entry by id — billed entries are guard-skipped, same
 * statement. Throws TimeEntriesNotFoundError / TimeEntryBilledError.
 */
export async function deleteTimeEntry(
  brain: TimeEntriesArrayClient,
  caseSlug: string,
  id: string
): Promise<void> {
  const res = await brain.mutatePageArray(caseSlug, TIME_ENTRIES_FIELD, {
    match: [id],
    remove: true,
    unless: { eq: { billed: true } },
  });
  if (res.not_found_ids.includes(id)) throw new TimeEntriesNotFoundError();
  if (res.skipped_ids.includes(id)) throw new TimeEntryBilledError();
}

export interface EmbeddedBillingResult {
  updated: number;
  not_found: string[];
  already_billed: string[];
}

/**
 * Mark embedded matter entries as billed — atomically. The `unless` guard is
 * evaluated inside the UPDATE: entries already billed under a DIFFERENT
 * invoice are skipped (reported as already_billed, never re-attributed —
 * GoBD), while same-invoice retries stay idempotent. Not-found ids are
 * reported, not silently ignored.
 */
export async function markTimeEntriesBilled(
  brain: TimeEntriesArrayClient,
  caseSlug: string,
  ids: string[],
  invoiceNumber: string
): Promise<EmbeddedBillingResult> {
  if (ids.length === 0) return { updated: 0, not_found: [], already_billed: [] };
  const res = await brain.mutatePageArray(caseSlug, TIME_ENTRIES_FIELD, {
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

/** Clear billed flag + invoice_number on embedded entries — atomically. */
export async function unbillTimeEntries(
  brain: TimeEntriesArrayClient,
  caseSlug: string,
  ids: string[]
): Promise<{ updated: number; not_found: string[] }> {
  if (ids.length === 0) return { updated: 0, not_found: [] };
  const res = await brain.mutatePageArray(caseSlug, TIME_ENTRIES_FIELD, {
    match: ids,
    set: { billed: false },
    unset: ["invoice_number"],
  });
  return { updated: res.updated_ids.length, not_found: res.not_found_ids };
}

/** The engine returns at most 100 pages per request; page through the rest. */
export async function listAllPagesOfType(
  brain: {
    listPages: (opts: { type: string; limit: number; offset: number }) => Promise<unknown[]>;
  },
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
  const fromPages: TimeEntryWithCase[] = pages.flatMap((p) => {
    const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
    if (String(fm.status ?? "") === "tombstoned") return [];
    return [standaloneEntryFromPage(p.slug, fm)];
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
      // `??`, not `||` — an explicit rate of 0 (pro bono) must not fall back
      // to the default rate and get billed.
      const rate = e.rate ?? defaultRate ?? 0;
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
  const alreadyBilled: string[] = [];
  const updated: TimeEntryWithCase[] = [];

  for (const id of ids) {
    if (!entries.some((e) => e.id === id)) {
      notFound.push(id);
    }
  }

  const result = entries.map((e) => {
    if (idSet.has(e.id)) {
      // An entry already billed under a different invoice keeps its
      // attribution — silently moving it to the new invoice would falsify
      // the GoBD trail of the old one. Same-invoice retries stay
      // idempotent. Reversal goes through unbill.
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
    already_billed: [],
    entries: result,
  };
}

// ── Passive Time Tracking (W3.2) ───────────────────────────────────────

/**
 * Harte Obergrenze für einen laufenden Timer: 12 Stunden seit `started_at`.
 * Der Inactivity-Cron stoppt nur bei fehlendem Heartbeat — ein versehentlich
 * über Nacht laufender Timer mit offenem Tab (der Heartbeat läuft weiter)
 * würde sonst unbegrenzt Zeit gutschreiben. Erzwungen an zwei Stellen:
 * serverseitig in der Heartbeat-Route (Auto-Stop + 409) und im
 * Inactivity-Cron als Fallback, falls der Client nie wieder heartbeats.
 */
export const TIMER_MAX_DURATION_MS = 12 * 60 * 60 * 1000;

/** ISO-Ende an der Obergrenze: `started_at` + TIMER_MAX_DURATION_MS. */
export function timerMaxDurationEnd(activity: Pick<CurrentActivity, "started_at">): string {
  return new Date(new Date(activity.started_at).getTime() + TIMER_MAX_DURATION_MS).toISOString();
}

/** true, wenn die laufende Aktivität die Höchstdauer überschritten hat. */
export function timerExceededMaxDuration(
  activity: Pick<CurrentActivity, "started_at">,
  now: Date = new Date()
): boolean {
  return now.getTime() - new Date(activity.started_at).getTime() > TIMER_MAX_DURATION_MS;
}

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
    // Try merge-update instead — the engine has no PATCH route; POST with
    // merge:true to /api/pages is the partial-update op.
    const update = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug,
        frontmatter: payload,
        merge: true,
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

  // Merge-write via POST /api/pages — the engine has no PATCH route.
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug,
      frontmatter: {
        ...current,
        last_activity_at: new Date().toISOString(),
      },
      merge: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    // Swallowing this failure makes the timer look alive while the
    // inactivity cron is about to stop it — fail loudly instead.
    throw new Error(`activity heartbeat failed: HTTP ${res.status}`);
  }
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

  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
    method: "DELETE",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  // 404 = nothing running — fine. Anything else means a zombie "current
  // activity" survives, which would block the next start — fail loudly.
  if (!res.ok && res.status !== 404) {
    throw new Error(`clear current activity failed: HTTP ${res.status}`);
  }
}

/**
 * Stop current activity and create time entry.
 *
 * `endedAt` overrides the end timestamp — the inactivity cron passes the
 * last real heartbeat (`last_activity_at`) so the idle tail between the
 * lawyer's last action and the cron run is not billed.
 *
 * The end is always clamped to `started_at + TIMER_MAX_DURATION_MS`: the
 * 12h cap must hold for every stop path, not just the heartbeat route.
 */
export async function stopCurrentActivity(
  brainId: string,
  userId: string,
  callerHeaders?: Record<string, string>,
  endedAtOverride?: string
): Promise<string | null> {
  const current = await getCurrentActivity(brainId, userId, callerHeaders);
  if (!current) return null;

  const requestedEnd = endedAtOverride ?? new Date().toISOString();
  const startedAt = new Date(current.started_at);
  const capEndMs = startedAt.getTime() + TIMER_MAX_DURATION_MS;
  // NaN-safe: a corrupt started_at must not throw inside toISOString().
  const endedAt = Number.isFinite(capEndMs)
    ? new Date(Math.min(new Date(requestedEnd).getTime(), capEndMs)).toISOString()
    : requestedEnd;
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
    // Firm calendar day, not UTC — a timer stopped at 00:30 Vienna time
    // belongs to the new day, not the UTC previous day.
    date: zonedDateString(startedAt),
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
