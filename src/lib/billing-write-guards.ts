/**
 * Server-side billing guards for the generic write paths
 * (/api/pages POST, /api/pages/[...slug] PATCH/DELETE,
 * /api/pages/array-mutate, /api/pages/array-append).
 *
 *  1. Issued invoices stay frozen on the atomic array paths too: an
 *     array-append / array-mutate on a sent/paid/overdue/cancelled invoice
 *     may only touch payment bookkeeping (`payments`), never `items`,
 *     `expenses` or anything else of the document.
 *
 *  2. "Bereits abgerechnet" is enforced by the server, not requested by the
 *     client. A billed time entry or expense (matter arrays `time_entries` /
 *     `expenses`, or a standalone `time_entry` page) is part of an invoice's
 *     basis: generic writes may neither change nor remove it, and may not set
 *     or clear the billing state (`billed`, `invoice_number`). Billing state
 *     moves only through the dedicated routes — invoice creation
 *     (/api/invoices), mark-billed, unbill, draft delete and Storno — which
 *     talk to the engine directly and never pass through these guards.
 *
 * Pure functions — the routes do the I/O and fail closed when the current page
 * cannot be read.
 */

import {
  INVOICE_PROCESS_FIELDS,
  finalized,
  isFinalizedInvoice,
  isInvoicePage,
  type CurrentPageLike,
  type GuardRejection,
} from "@/lib/page-write-guards";
import { IMPORT_SOURCE } from "@/lib/kanzlei-import/plan";
import { isIssuingTransition } from "@/lib/invoice-issue";

/** Matter frontmatter arrays whose elements can be billed on an invoice. */
export const BILLING_ARRAY_FIELDS = new Set(["time_entries", "expenses"]);

/** Written only by the dedicated billing routes. */
export const BILLING_STATE_KEYS = ["billed", "invoice_number"] as const;

/** Engine skip guard: billed elements are never touched by a generic mutation. */
export const NOT_WHEN_BILLED = { eq: { billed: true } } as const;

type Scalar = string | number | boolean | null;
type UnlessGuard = { eq?: Record<string, unknown>; ne?: Record<string, unknown> };

export interface ArrayMutationLike {
  match: Array<string | number | boolean>;
  match_key?: string;
  set?: Record<string, unknown>;
  unset?: string[];
  remove?: boolean;
  unless?: UnlessGuard;
}

function billingProtected(detail: string): GuardRejection {
  return {
    status: 409,
    error: "billing_state_protected",
    message: `${detail} Der Abrechnungsstatus ändert sich nur über Rechnung erstellen, Abrechnung zurücknehmen, Entwurf löschen oder Storno.`,
  };
}

function entryBilled(detail: string): GuardRejection {
  return {
    status: 409,
    error: "entry_billed",
    message: `${detail} Der Eintrag ist bereits abgerechnet — zuerst die Rechnung stornieren bzw. den Entwurf löschen oder die Abrechnung zurücknehmen.`,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Order-independent structural equality for JSON-like values. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function isBilled(e: Record<string, unknown> | null | undefined): boolean {
  return e?.billed === true;
}

function invoiceNumberOf(e: Record<string, unknown> | null | undefined): string {
  const n = e?.invoice_number;
  return typeof n === "string" ? n : n == null ? "" : String(n);
}

function sameBillingState(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined
): boolean {
  return isBilled(a) === isBilled(b) && invoiceNumberOf(a) === invoiceNumberOf(b);
}

function entryKey(e: Record<string, unknown>): string {
  const id = e.id;
  if (typeof id === "string" || typeof id === "number") return `id:${String(id)}`;
  return `raw:${canonical(e)}`;
}

function entryLabel(e: Record<string, unknown>): string {
  const d = typeof e.description === "string" ? e.description.trim() : "";
  return d ? `„${d.slice(0, 80)}“` : typeof e.id === "string" ? `„${e.id}“` : "";
}

// ── 1. Invoice arrays ───────────────────────────────────────────────────

/**
 * Judge an atomic array write (append or mutate) on `field` of the page.
 * `null` = allowed. Only process fields such as `payments` may change on an
 * issued invoice.
 */
export function checkInvoiceArrayWrite(
  current: CurrentPageLike | null,
  field: string
): GuardRejection | null {
  if (!current || !isFinalizedInvoice(current)) return null;
  if (field !== "status" && INVOICE_PROCESS_FIELDS.has(field)) return null;
  return finalized(String(current.frontmatter?.status ?? ""), `Feld „${field}“`);
}

// ── 2a. Atomic array mutate on billing arrays ───────────────────────────

/** SQL `->>` text of a JSON value (null stays null). */
function textOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * JS mirror of the engine's `unless` evaluation (page_array_mutate): skip
 * when every eq pair equals AND every ne pair exists-and-differs.
 */
export function unlessMatches(element: unknown, unless: UnlessGuard | undefined): boolean {
  if (!unless || (!unless.eq && !unless.ne)) return false;
  if (!isRecord(element)) return false;
  for (const [k, v] of Object.entries(unless.eq ?? {})) {
    if (!(k in element)) return false;
    if (canonical(element[k]) !== canonical(v as Scalar)) return false;
  }
  for (const [k, v] of Object.entries(unless.ne ?? {})) {
    if (!(k in element)) return false;
    if (textOf(element[k]) === textOf(v)) return false;
  }
  return true;
}

function isServerGuard(unless: UnlessGuard | undefined): boolean {
  if (!unless) return true;
  const eq = unless.eq ?? {};
  const ne = unless.ne ?? {};
  return Object.keys(ne).length === 0 && Object.keys(eq).length === 1 && eq.billed === true;
}

export type BillingMutationGuard =
  | { reject: GuardRejection }
  | {
      /** Mutation to forward to the engine; null when nothing is left to do. */
      forward: ArrayMutationLike | null;
      /** Ids the client's own `unless` skips — report them as skipped. */
      preSkipped: string[];
    };

/**
 * Enforce the billed lock on a generic array mutation of `time_entries` /
 * `expenses`:
 *
 * - `set`/`unset` of `billed`/`invoice_number` is refused;
 * - the engine always gets `unless: {eq: {billed: true}}`, evaluated inside
 *   the same UPDATE — a concurrent billing run cannot overtake it;
 * - a client-supplied `unless` is an additional skip condition. The engine
 *   combines guards with AND only, so the client's condition is evaluated
 *   on the freshly read array and those ids are taken out of `match`.
 *
 * Other fields pass through unchanged.
 */
export function guardBillingArrayMutation(
  field: string,
  mutation: ArrayMutationLike,
  currentFrontmatter: Record<string, unknown> | null | undefined
): BillingMutationGuard {
  if (!BILLING_ARRAY_FIELDS.has(field)) return { forward: mutation, preSkipped: [] };

  const touched = [...Object.keys(mutation.set ?? {}), ...(mutation.unset ?? [])];
  const stateKey = touched.find((k) => (BILLING_STATE_KEYS as readonly string[]).includes(k));
  if (stateKey) {
    return { reject: billingProtected(`„${stateKey}“ kann hier nicht geändert werden.`) };
  }

  if (isServerGuard(mutation.unless)) {
    return { forward: { ...mutation, unless: { ...NOT_WHEN_BILLED } }, preSkipped: [] };
  }

  const matchKey = mutation.match_key ?? "id";
  const wanted = new Set(mutation.match.map((m) => String(m)));
  const list = Array.isArray(currentFrontmatter?.[field])
    ? (currentFrontmatter[field] as unknown[])
    : [];
  const preSkipped = new Set<string>();
  for (const el of list) {
    if (!isRecord(el)) continue;
    const key = textOf(el[matchKey]);
    if (key === null || !wanted.has(key)) continue;
    if (unlessMatches(el, mutation.unless)) preSkipped.add(key);
  }
  const remaining = mutation.match.filter((m) => !preSkipped.has(String(m)));
  return {
    forward:
      remaining.length > 0
        ? { ...mutation, match: remaining, unless: { ...NOT_WHEN_BILLED } }
        : null,
    preSkipped: [...preSkipped],
  };
}

// ── 2b. Atomic append on billing arrays ─────────────────────────────────

/**
 * New entries may arrive already marked billed (a legacy import from a
 * previous system), but never carrying an invoice number — attaching work to
 * an invoice is the invoice route's job.
 */
export function checkBillingArrayAppend(field: string, items: unknown[]): GuardRejection | null {
  if (!BILLING_ARRAY_FIELDS.has(field)) return null;
  for (const item of items) {
    if (isRecord(item) && invoiceNumberOf(item) !== "") {
      return billingProtected("Neue Einträge dürfen keiner Rechnung zugeordnet sein.");
    }
  }
  return null;
}

// ── 2b'. Taking back a data import ──────────────────────────────────────

export interface ImportRollbackPlan {
  /** Entries this import appended and no invoice of this system claims. */
  removable: string[];
  /** Entries left in place: not from this import, or on an invoice here. */
  kept: Array<{ id: string; reason: "not_from_this_import" | "invoiced" }>;
  notFound: string[];
}

/**
 * Which matter time entries a rollback of import `importProjectId` may
 * remove. The one narrow exception to the billed lock: an entry the import
 * itself appended may go even when it arrived marked billed (work billed in
 * the previous system) — provided it carries no invoice number, i.e. no
 * invoice of this system holds it. Everything else stays.
 */
export function planImportRollbackRemoval(
  storedEntries: unknown,
  ids: readonly string[],
  importProjectId: string
): ImportRollbackPlan {
  const list = Array.isArray(storedEntries) ? storedEntries.filter(isRecord) : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const e of list) {
    const id = textOf(e.id);
    if (id !== null && !byId.has(id)) byId.set(id, e);
  }
  const plan: ImportRollbackPlan = { removable: [], kept: [], notFound: [] };
  for (const id of new Set(ids)) {
    const e = byId.get(id);
    if (!e) plan.notFound.push(id);
    else if (e.source !== IMPORT_SOURCE || textOf(e.import_project_id) !== importProjectId)
      plan.kept.push({ id, reason: "not_from_this_import" });
    else if (invoiceNumberOf(e) !== "") plan.kept.push({ id, reason: "invoiced" });
    else plan.removable.push(id);
  }
  return plan;
}

/** Engine skip guard for the rollback: never remove an entry an invoice claims. */
export const NOT_WHEN_INVOICED = { ne: { invoice_number: "" } } as const;

// ── 2c. Generic page writes (whole arrays / standalone entries) ─────────

function isStandaloneTimeEntry(page: CurrentPageLike | null | undefined): boolean {
  if (!page) return false;
  return page.type === "time_entry" || page.frontmatter?.type === "time_entry";
}

/**
 * Judge a generic page write against the billed lock. `current` is the stored
 * page (null for a new page). `null` = allowed.
 *
 * Matter arrays: every stored billed entry must come back unchanged, and no
 * entry may change its billing state. A brand-new page is not judged (it
 * cannot hold billed work of an existing invoice).
 * Standalone `time_entry` page: a billed one is frozen (incl. delete); an
 * unbilled one may not become billed here.
 */
export function checkBilledEntriesWrite(
  current: CurrentPageLike | null,
  write: { mode: "merge" | "replace" | "delete"; frontmatter?: Record<string, unknown> }
): GuardRejection | null {
  if (!current) return null;
  const stored = (current.frontmatter ?? {}) as Record<string, unknown>;

  if (isStandaloneTimeEntry(current)) {
    if (isBilled(stored)) {
      if (write.mode === "delete") return entryBilled("Löschen nicht möglich.");
      const incoming = write.frontmatter ?? {};
      for (const [k, v] of Object.entries(incoming)) {
        if (k === "updated_at" || k === "updated_by" || k === "version") continue;
        if (canonical(v) !== canonical(stored[k])) {
          return entryBilled(`Feld „${k}“ kann nicht geändert werden.`);
        }
      }
      if (write.mode === "replace" && !sameBillingState(incoming, stored)) {
        return entryBilled("Überschreiben nicht möglich.");
      }
      return null;
    }
    const incoming = write.frontmatter;
    if (incoming) {
      const next = write.mode === "replace" ? incoming : { ...stored, ...incoming };
      if (!sameBillingState(next, stored)) {
        return billingProtected("Der Zeiteintrag kann hier nicht als abgerechnet markiert werden.");
      }
    }
    return null;
  }

  if (write.mode === "delete") return null;
  const incomingFm = write.frontmatter;
  if (!incomingFm) return null;

  for (const field of BILLING_ARRAY_FIELDS) {
    const storedList = Array.isArray(stored[field])
      ? (stored[field] as unknown[]).filter(isRecord)
      : [];
    // A merge that does not send the field leaves it untouched.
    if (!(field in incomingFm)) {
      if (write.mode === "merge") continue;
    }
    const incomingList = Array.isArray(incomingFm[field])
      ? (incomingFm[field] as unknown[]).filter(isRecord)
      : [];

    const storedByKey = new Map(storedList.map((e) => [entryKey(e), e]));
    const incomingByKey = new Map(incomingList.map((e) => [entryKey(e), e]));

    for (const e of storedList) {
      if (!isBilled(e)) continue;
      const next = incomingByKey.get(entryKey(e));
      if (!next) return entryBilled(`Eintrag ${entryLabel(e)} kann nicht entfernt werden.`);
      if (canonical(next) !== canonical(e)) {
        return entryBilled(`Eintrag ${entryLabel(e)} kann nicht geändert werden.`);
      }
    }
    for (const e of incomingList) {
      const prev = storedByKey.get(entryKey(e));
      if (prev ? !sameBillingState(e, prev) : isBilled(e) || invoiceNumberOf(e) !== "") {
        return billingProtected(
          `Eintrag ${entryLabel(e)} kann hier nicht als abgerechnet markiert oder freigegeben werden.`
        );
      }
    }
  }
  return null;
}

// ── 3. Invoices on the generic write paths ──────────────────────────────

/**
 * Invoices are created and issued only through their own routes: POST
 * /api/invoices allocates nothing twice and checks the sums; issuing
 * (draft → sent/paid/overdue) goes through /api/invoices/[slug], the e-mail
 * or the e-invoice dispatch, which check completeness and sums first. On the
 * generic page routes an invoice draft may still be edited, but not created,
 * not issued and not renumbered. `null` = allowed.
 */
export function checkInvoiceGenericWrite(
  current: CurrentPageLike | null,
  write: { type?: unknown; frontmatter?: Record<string, unknown> }
): GuardRejection | null {
  const incomingType =
    typeof write.type === "string" ? write.type : (write.frontmatter?.type as unknown);
  if (!isInvoicePage(current) && incomingType !== "invoice") return null;
  if (!current) {
    return {
      status: 409,
      error: "invoice_create_via_route",
      message:
        "Rechnungen werden nur über „Rechnung erstellen“ angelegt — dort vergibt der Server die Rechnungsnummer und prüft die Summen. Es wurde nichts gespeichert.",
    };
  }
  if (isFinalizedInvoice(current)) return null; // checkInvoiceWrite judges issued invoices
  const fm = write.frontmatter ?? {};
  if (
    "invoice_number" in fm &&
    String(fm.invoice_number ?? "") !== String(current.frontmatter?.invoice_number ?? "")
  ) {
    return {
      status: 409,
      error: "invoice_number_protected",
      message: "Die Rechnungsnummer vergibt der Server und kann nicht geändert werden.",
    };
  }
  if ("status" in fm && isIssuingTransition(current.frontmatter?.status, fm.status)) {
    return {
      status: 409,
      error: "invoice_issue_via_route",
      message:
        "Eine Rechnung wird über „Versenden“ bzw. den Rechnungsstatus ausgestellt — dort prüft der Server Summen und Pflichtangaben. Es wurde nichts gespeichert.",
    };
  }
  return null;
}
