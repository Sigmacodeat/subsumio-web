/**
 * Invoice ↔ billed-work bookkeeping (server only).
 *
 * Three rules keep a piece of work on at most one live invoice:
 *
 *  1. Reserve before create. `createInvoiceReservingEntries` claims the time
 *     entries / expenses for the new invoice number FIRST — atomically, in the
 *     engine's single UPDATE with an in-statement "already billed" skip — and
 *     only then writes the invoice page. When any entry is billed elsewhere or
 *     missing, the claim is rolled back and no invoice is created (409). Two
 *     parallel invoices over the same work: exactly one wins.
 *
 *  2. Release on draft delete and Storno. `releaseInvoiceEntries` puts every
 *     entry still billed under that invoice number back to "open", so a
 *     corrected invoice can bill it again.
 *
 *  3. Unbill only when the invoice no longer binds the work.
 *     `findUnbillBlockers` names entries whose invoice is issued (sent / paid /
 *     overdue) and neither stornoed nor deleted.
 */

import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages, type ListedPage } from "@/lib/engine-pages";
import { isTombstoned } from "@/lib/tombstone";
import {
  STANDALONE_ENTRY_PREFIX,
  unbillTimeEntries,
  updateStandaloneBilling,
  type TimeEntriesArrayClient,
} from "@/lib/time-tracking";
import { unbillExpensesAtomic, type ExpensesArrayClient } from "@/lib/expense-tracking";
import { createServerBrainClient } from "@/lib/server-brain";
import { logAudit, SYSTEM_BRAIN } from "@/lib/audit";
import { logger } from "@/lib/logger";

const log = logger("lib/invoice-billing-lock");

/** Structurally also a TimeEntriesArrayClient (its append result carries `items`). */
export interface InvoiceBillingClient extends ExpensesArrayClient {
  getPage(slug: string): Promise<{ frontmatter?: unknown } | null>;
  updatePage(input: { slug: string; frontmatter: Record<string, unknown> }): Promise<unknown>;
}

export interface EntryIdsByKind {
  time: string[];
  expenses: string[];
}

export interface Reservation {
  claimed: EntryIdsByKind;
  /** Billed under another invoice (or billed outside Subsumio) — never taken over. */
  alreadyBilled: EntryIdsByKind;
  notFound: EntryIdsByKind;
}

const empty = (): EntryIdsByKind => ({ time: [], expenses: [] });

export function reservationComplete(r: Reservation): boolean {
  return (
    r.alreadyBilled.time.length + r.alreadyBilled.expenses.length === 0 &&
    r.notFound.time.length + r.notFound.expenses.length === 0
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Claim embedded entries for `invoiceNumber`. The skip guard is the strict
 * one — ANY billed entry is skipped inside the UPDATE; a skipped entry that
 * already carries this very number is ours (idempotent retry).
 */
async function claimArray(
  brain: TimeEntriesArrayClient,
  caseSlug: string,
  field: "time_entries" | "expenses",
  ids: string[],
  invoiceNumber: string
): Promise<{ claimed: string[]; alreadyBilled: string[]; notFound: string[] }> {
  if (ids.length === 0) return { claimed: [], alreadyBilled: [], notFound: [] };
  const res = await brain.mutatePageArray(caseSlug, field, {
    match: ids,
    set: { billed: true, invoice_number: invoiceNumber },
    unless: { eq: { billed: true } },
  });
  const byId = new Map<string, Record<string, unknown>>();
  for (const e of res.items ?? []) if (isRecord(e)) byId.set(String(e.id), e);
  const ours = (id: string) => byId.get(id)?.invoice_number === invoiceNumber;
  return {
    claimed: [...res.updated_ids, ...res.skipped_ids.filter(ours)],
    alreadyBilled: res.skipped_ids.filter((id) => !ours(id)),
    notFound: res.not_found_ids,
  };
}

/** Claim the time entries and expenses of one matter for an invoice number. */
export async function reserveInvoiceEntries(
  brain: InvoiceBillingClient,
  input: { caseSlug: string; invoiceNumber: string; timeEntryIds: string[]; expenseIds: string[] }
): Promise<Reservation> {
  const out: Reservation = { claimed: empty(), alreadyBilled: empty(), notFound: empty() };
  const standaloneIds = input.timeEntryIds.filter((id) => id.startsWith(STANDALONE_ENTRY_PREFIX));
  const caseIds = input.timeEntryIds.filter((id) => !id.startsWith(STANDALONE_ENTRY_PREFIX));

  const time = await claimArray(
    brain,
    input.caseSlug,
    "time_entries",
    caseIds,
    input.invoiceNumber
  );
  out.claimed.time.push(...time.claimed);
  out.alreadyBilled.time.push(...time.alreadyBilled);
  out.notFound.time.push(...time.notFound);

  if (standaloneIds.length > 0) {
    const standalone = await updateStandaloneBilling(brain, standaloneIds, {
      billed: true,
      invoiceNumber: input.invoiceNumber,
    });
    const refused = new Set([...standalone.already_billed, ...standalone.not_found]);
    out.claimed.time.push(...standaloneIds.filter((id) => !refused.has(id)));
    out.alreadyBilled.time.push(...standalone.already_billed);
    out.notFound.time.push(...standalone.not_found);
  }

  // Lost the race on the time entries already — don't grab the expenses too.
  if (!reservationComplete(out)) return out;

  const exp = await claimArray(
    brain,
    input.caseSlug,
    "expenses",
    input.expenseIds,
    input.invoiceNumber
  );
  out.claimed.expenses.push(...exp.claimed);
  out.alreadyBilled.expenses.push(...exp.alreadyBilled);
  out.notFound.expenses.push(...exp.notFound);
  return out;
}

function idsBilledUnder(list: unknown, invoiceNumber: string): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is Record<string, unknown> => isRecord(e))
    .filter((e) => e.billed === true && e.invoice_number === invoiceNumber && e.id != null)
    .map((e) => String(e.id));
}

/**
 * Put every entry still billed under `invoiceNumber` back to open — on the
 * given matters and on the listed standalone time-entry pages. Entries billed
 * under another invoice by now are never touched (in-statement guard).
 * Throws when a matter cannot be read or written; the caller reports it.
 */
export async function releaseInvoiceEntries(
  brain: InvoiceBillingClient,
  input: {
    caseSlugs: string[];
    invoiceNumber: string;
    timeEntryIds?: string[];
    /** Limit the release to these ids (rollback of one reservation). */
    onlyIds?: EntryIdsByKind;
  }
): Promise<{ time: number; expenses: number }> {
  const released = { time: 0, expenses: 0 };
  if (!input.invoiceNumber) return released;
  const only = input.onlyIds;
  const keep = (ids: string[], allowed: string[] | undefined) =>
    allowed ? ids.filter((id) => allowed.includes(id)) : ids;

  for (const caseSlug of [...new Set(input.caseSlugs.filter(Boolean))]) {
    const page = await brain.getPage(caseSlug);
    const fm = (page?.frontmatter ?? {}) as Record<string, unknown>;
    const timeIds = keep(idsBilledUnder(fm.time_entries, input.invoiceNumber), only?.time);
    const expenseIds = keep(idsBilledUnder(fm.expenses, input.invoiceNumber), only?.expenses);
    if (timeIds.length > 0) {
      const r = await unbillTimeEntries(brain, caseSlug, timeIds, input.invoiceNumber);
      released.time += r.updated;
    }
    if (expenseIds.length > 0) {
      const r = await unbillExpensesAtomic(brain, caseSlug, expenseIds, input.invoiceNumber);
      released.expenses += r.updated;
    }
  }

  const standaloneIds = keep(
    (input.timeEntryIds ?? []).filter((id) => id.startsWith(STANDALONE_ENTRY_PREFIX)),
    only?.time
  );
  const ours: string[] = [];
  for (const id of standaloneIds) {
    const page = await brain.getPage(id).catch(() => null);
    const fm = (page?.frontmatter ?? null) as Record<string, unknown> | null;
    if (fm?.billed === true && fm.invoice_number === input.invoiceNumber) ours.push(id);
  }
  if (ours.length > 0) {
    const r = await updateStandaloneBilling(brain, ours, { billed: false });
    released.time += r.updated;
  }
  return released;
}

/**
 * Release the work of an invoice that no longer bills it (deleted draft,
 * Storno) and write the audit entry. Never throws: the invoice-side change is
 * already done; a failed release is logged and reported as `null`, and the
 * entries can still be freed via unbill (the invoice no longer binds them).
 */
export async function releaseWorkOfInvoice(
  headers: Record<string, string>,
  invoiceSlug: string,
  fm: Record<string, unknown>,
  reason: "draft_deleted" | "storno",
  brain: InvoiceBillingClient = createServerBrainClient(headers)
): Promise<{ time: number; expenses: number } | null> {
  const invoiceNumber = String(fm.invoice_number ?? "");
  if (!invoiceNumber) return { time: 0, expenses: 0 };
  const caseSlugs = Array.isArray(fm.case_slugs)
    ? fm.case_slugs.filter((s): s is string => typeof s === "string")
    : [];
  const timeEntryIds = Array.isArray(fm.time_entry_ids)
    ? fm.time_entry_ids.filter((s): s is string => typeof s === "string")
    : [];
  try {
    const released = await releaseInvoiceEntries(brain, {
      caseSlugs,
      invoiceNumber,
      timeEntryIds,
    });
    void logAudit("invoice.update", "invoice", {
      brainId: headers["x-subsumio-source"] || SYSTEM_BRAIN,
      entityId: invoiceSlug,
      details: { action: "entries_released", reason, invoiceNumber, ...released },
    });
    return released;
  } catch (err) {
    log.error(
      `[invoice-billing-lock] release after ${reason} failed:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ── Unbill: does the invoice still bind the work? ───────────────────────

/** Statuses of an issued invoice that still binds its entries. */
const BINDING_STATUSES = new Set(["sent", "paid", "overdue"]);

function hasLiveStorno(invoice: ListedPage, invoices: ListedPage[]): boolean {
  return invoices.some(
    (p) =>
      p.frontmatter?.invoice_type === "storno" &&
      p.frontmatter?.parent_invoice_id === invoice.slug &&
      !isTombstoned(p)
  );
}

/**
 * The issued invoice that still binds work billed under `invoiceNumber`, or
 * null when the work may be released: no invoice with that number exists, or
 * every one of them is a draft, deleted, cancelled or stornoed.
 */
export function bindingInvoice(invoiceNumber: string, invoices: ListedPage[]): ListedPage | null {
  for (const inv of invoices) {
    if (String(inv.frontmatter?.invoice_number ?? "") !== invoiceNumber) continue;
    if (isTombstoned(inv)) continue;
    const status = String(inv.frontmatter?.status ?? "");
    if (!BINDING_STATUSES.has(status)) continue;
    if (hasLiveStorno(inv, invoices)) continue;
    return inv;
  }
  return null;
}

export interface UnbillBlocker {
  id: string;
  invoice_number: string;
  status: string;
}

export type InvoiceLister = (headers: Record<string, string>) => Promise<ListedPage[]>;

const listAllInvoices: InvoiceLister = (headers) =>
  listEnginePages(headers, "invoice", 5000, { includeTombstoned: true, strict: true });

/**
 * Entries that may NOT be unbilled because their invoice is issued and still
 * valid. Entries without an invoice number are free. Throws when the invoices
 * cannot be listed — the caller must refuse (fail closed).
 */
export async function findUnbillBlockers(
  headers: Record<string, string>,
  entries: Array<{ id: string; invoice_number?: unknown }>,
  listInvoices: InvoiceLister = listAllInvoices
): Promise<UnbillBlocker[]> {
  const withNumber = entries
    .map((e) => ({ id: e.id, invoice_number: String(e.invoice_number ?? "") }))
    .filter((e) => e.invoice_number !== "");
  if (withNumber.length === 0) return [];
  const invoices = await listInvoices(headers);
  const blockers: UnbillBlocker[] = [];
  for (const e of withNumber) {
    const inv = bindingInvoice(e.invoice_number, invoices);
    if (inv) {
      blockers.push({ ...e, status: String(inv.frontmatter?.status ?? "") });
    }
  }
  return blockers;
}

/** 409 body for an unbill refused because the invoice is issued. */
export function unbillBlockedResponse(blockers: UnbillBlocker[]): Response {
  const numbers = [...new Set(blockers.map((b) => b.invoice_number))].join(", ");
  return Response.json(
    {
      error: "invoice_finalized",
      message: `Die Leistung steht auf der bereits ausgestellten Rechnung ${numbers} und kann nicht freigegeben werden. Für Korrekturen: Storno-Note verwenden.`,
      blocked: blockers,
    },
    { status: 409 }
  );
}

// ── Create an invoice with its work reserved ────────────────────────────

export interface InvoiceCreateInput {
  slug: string;
  title: string;
  content?: string;
  frontmatter: Record<string, unknown>;
  caseSlug: string;
  invoiceNumber: string;
  timeEntryIds: string[];
  expenseIds: string[];
}

export type InvoiceCreateOutcome =
  | { kind: "created"; page: unknown; claimed: EntryIdsByKind }
  | { kind: "conflict"; alreadyBilled: EntryIdsByKind; notFound: EntryIdsByKind }
  /** A page already sits at the slug (created in the meantime); nothing was written. */
  | { kind: "exists" }
  | { kind: "create_failed"; status: number; body: unknown };

export type EnginePageCreate = (
  headers: Record<string, string>,
  payload: Record<string, unknown>
) => Promise<Response>;

const createEnginePage: EnginePageCreate = (headers, payload) =>
  fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

/**
 * Reserve the invoice's work, then write the invoice page. Nothing is left
 * behind on failure: a conflicting reservation and a failed page write both
 * release what this call claimed. The release is best-effort — if it fails
 * too, the entries stay billed under a number without an invoice, which the
 * unbill route frees (no issued invoice binds them).
 *
 * The page write is create-only (`if_absent`): the engine refuses a taken
 * slug in the same statement that inserts the page, so an invoice created
 * between the caller's existence check and this write is never replaced.
 */
export async function createInvoiceReservingEntries(
  headers: Record<string, string>,
  brain: InvoiceBillingClient,
  input: InvoiceCreateInput,
  createPage: EnginePageCreate = createEnginePage
): Promise<InvoiceCreateOutcome> {
  // Rollback touches only this invoice's own ids under its own number — the
  // caller guarantees the number is not used by another invoice.
  const release = () =>
    releaseInvoiceEntries(brain, {
      caseSlugs: [input.caseSlug],
      invoiceNumber: input.invoiceNumber,
      timeEntryIds: input.timeEntryIds,
      onlyIds: { time: input.timeEntryIds, expenses: input.expenseIds },
    }).catch(() => undefined);

  let reservation: Reservation;
  try {
    reservation = await reserveInvoiceEntries(brain, {
      caseSlug: input.caseSlug,
      invoiceNumber: input.invoiceNumber,
      timeEntryIds: input.timeEntryIds,
      expenseIds: input.expenseIds,
    });
  } catch (err) {
    await release();
    throw err;
  }
  if (!reservationComplete(reservation)) {
    await release();
    return {
      kind: "conflict",
      alreadyBilled: reservation.alreadyBilled,
      notFound: reservation.notFound,
    };
  }

  let res: Response;
  try {
    res = await createPage(headers, {
      slug: input.slug,
      title: input.title,
      type: "invoice",
      ...(input.content !== undefined ? { content: input.content } : {}),
      frontmatter: { ...input.frontmatter, type: "invoice" },
      if_absent: true,
    });
  } catch (err) {
    await release();
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    await release();
    if (res.status === 409 && (body as { error?: unknown } | null)?.error === "page_exists") {
      return { kind: "exists" };
    }
    return { kind: "create_failed", status: res.status, body };
  }
  return {
    kind: "created",
    page: await res.json().catch(() => null),
    claimed: reservation.claimed,
  };
}
