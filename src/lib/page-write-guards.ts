/**
 * Server-side write guards shared by every generic page write path
 * (POST /api/pages, PATCH/DELETE /api/pages/[...slug], /api/invoices/[slug]).
 *
 * Two rules live here because they must hold no matter which route a client
 * picks:
 *
 *  1. Vier-Augen-Kontrolle für Notfristen. `second_check_*` is written ONLY by
 *     POST /api/legal/fristen/second-check, which stamps the authenticated
 *     user. Generic writes may neither set nor clear those fields, and may not
 *     move a Notfrist to `done` unless a server-stamped second check exists.
 *
 *  2. Unveränderbarkeit ausgestellter Rechnungen (§ 132 BAO, § 11 UStG).
 *     Once an invoice is sent/paid/overdue/cancelled its content is frozen.
 *     Only payment/delivery bookkeeping may change (mark paid, overdue,
 *     e-invoice delivery status). Corrections go through a Storno-Note
 *     (/api/invoices/[slug]/storno), which creates a new document.
 *
 * Pure functions — the routes do the I/O and fail closed when the current page
 * cannot be read.
 */

export type GuardRejection = { status: number; error: string; message: string };

export interface CurrentPageLike {
  slug?: string;
  type?: string;
  title?: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
}

// ── Vier-Augen-Kontrolle ────────────────────────────────────────────────

/** Written only by the second-check route; never accepted from a client. */
export const SECOND_CHECK_FIELDS = [
  "second_check_by",
  "second_check_at",
  "second_check_by_id",
  "second_check_by_email",
] as const;

export function isNotfrist(fm: Record<string, unknown> | undefined | null): boolean {
  if (!fm) return false;
  return fm.is_notfrist === true || fm.second_check_required === true;
}

/** A second check the server stamped (the only writer of these fields). */
export function hasServerSecondCheck(fm: Record<string, unknown> | undefined | null): boolean {
  if (!fm) return false;
  return (
    typeof fm.second_check_by === "string" &&
    fm.second_check_by.trim().length > 0 &&
    typeof fm.second_check_at === "string" &&
    fm.second_check_at.trim().length > 0
  );
}

function isDone(fm: Record<string, unknown> | undefined | null): boolean {
  return String(fm?.status ?? "") === "done";
}

/** Remove client-supplied second-check fields and put back the stored ones. */
function withStoredSecondCheck(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  const next = { ...incoming };
  for (const key of SECOND_CHECK_FIELDS) {
    delete next[key];
    if (stored && stored[key] !== undefined && stored[key] !== null) next[key] = stored[key];
  }
  return next;
}

/** Identity of a deadline inside a matter's `deadlines` array. */
export function embeddedDeadlineKey(d: Record<string, unknown>): string {
  if (typeof d.id === "string" && d.id) return `id:${d.id}`;
  return `t:${String(d.title ?? "")
    .trim()
    .toLowerCase()}|${String(d.due_date ?? d.date ?? "")}`;
}

function secondCheckMissing(title: unknown): GuardRejection {
  const name = typeof title === "string" && title.trim() ? `"${title.trim()}" ` : "";
  return {
    status: 403,
    error: "notfrist_second_check_required",
    message: `Notfrist ${name}erfordert Vier-Augen-Kontrolle — die Erledigung muss über die Zweitprüfung durch eine zweite Person bestätigt werden.`,
  };
}

/**
 * Sanitise a frontmatter write against the four-eyes rule.
 *
 * `current` is the stored frontmatter (null for a new page). Returns the
 * frontmatter to forward — second-check fields stripped and re-filled from
 * storage, also inside a matter's `deadlines` array — or a rejection when the
 * write would complete a Notfrist without a server-stamped second check.
 * A deadline that is already stored as done is not re-judged (no transition).
 */
export function guardSecondCheckWrite(
  incoming: Record<string, unknown>,
  current: Record<string, unknown> | null
): { frontmatter: Record<string, unknown> } | { reject: GuardRejection } {
  const fm = withStoredSecondCheck(incoming, current);

  if (isDone(fm) && !isDone(current) && !hasServerSecondCheck(current)) {
    if (isNotfrist(current) || isNotfrist(fm)) {
      return { reject: secondCheckMissing(fm.title ?? current?.title) };
    }
  }

  if (Array.isArray(incoming.deadlines)) {
    const stored = new Map<string, Record<string, unknown>>();
    const storedList = Array.isArray(current?.deadlines)
      ? (current.deadlines as Array<Record<string, unknown>>)
      : [];
    for (const d of storedList) {
      if (d && typeof d === "object") stored.set(embeddedDeadlineKey(d), d);
    }
    const next: Array<Record<string, unknown>> = [];
    for (const raw of incoming.deadlines as unknown[]) {
      if (!raw || typeof raw !== "object") {
        next.push(raw as Record<string, unknown>);
        continue;
      }
      const dl = raw as Record<string, unknown>;
      const prev = stored.get(embeddedDeadlineKey(dl)) ?? null;
      const clean = withStoredSecondCheck(dl, prev);
      if (
        isDone(clean) &&
        !isDone(prev) &&
        !hasServerSecondCheck(prev) &&
        (isNotfrist(clean) || isNotfrist(prev))
      ) {
        return { reject: secondCheckMissing(clean.title) };
      }
      next.push(clean);
    }
    fm.deadlines = next;
  }

  return { frontmatter: fm };
}

// ── Rechnungs-Unveränderbarkeit ─────────────────────────────────────────

/** Page types that hold an issued invoice (Storno-Noten are `invoice` too). */
export const INVOICE_PAGE_TYPES = new Set(["invoice"]);

/** From these statuses on, the invoice is an issued, immutable document. */
export const FINALIZED_INVOICE_STATUSES = new Set(["sent", "paid", "overdue", "cancelled"]);

/**
 * Payment and delivery bookkeeping — not part of the invoice document itself,
 * so it may still change on an issued invoice.
 */
export const INVOICE_PROCESS_FIELDS = new Set([
  "status",
  "paid_at",
  "paid_amount",
  "payment_date",
  "payment_method",
  "payment_reference",
  "payments",
  "sent_at",
  "email_sent_at",
  "email_sent_to",
  "email_attachment",
  "e_invoice_channel",
  "e_invoice_reference",
  "e_invoice_status",
  "reminder_count",
  "reminder_sent_at",
  "reminder_fee",
  "version",
  "updated_at",
  "updated_by",
]);

/** Allowed payment-status moves of an issued invoice (incl. undoing a mis-booked payment). */
const PAYMENT_TRANSITIONS: Record<string, Set<string>> = {
  sent: new Set(["sent", "paid", "overdue"]),
  overdue: new Set(["overdue", "paid", "sent"]),
  paid: new Set(["paid", "sent", "overdue"]),
  cancelled: new Set(["cancelled"]),
};

export function isInvoicePage(page: CurrentPageLike | null | undefined): boolean {
  if (!page) return false;
  const fmType = page.frontmatter?.type;
  return (
    (typeof page.type === "string" && INVOICE_PAGE_TYPES.has(page.type)) ||
    (typeof fmType === "string" && INVOICE_PAGE_TYPES.has(fmType))
  );
}

export function isFinalizedInvoice(page: CurrentPageLike | null | undefined): boolean {
  return (
    isInvoicePage(page) && FINALIZED_INVOICE_STATUSES.has(String(page?.frontmatter?.status ?? ""))
  );
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function finalized(status: string, detail: string): GuardRejection {
  const label =
    status === "paid"
      ? "bezahlt"
      : status === "cancelled"
        ? "storniert"
        : status === "overdue"
          ? "überfällig"
          : "versendet";
  return {
    status: 409,
    error: "invoice_finalized",
    message: `Rechnung ist bereits ${label} und kann nicht mehr geändert werden (${detail}). Für Korrekturen: Storno-Note verwenden.`,
  };
}

/**
 * Judge a write against an issued invoice. `null` = allowed.
 *
 * - `delete`: an issued invoice is never deleted.
 * - `replace` (a non-merge create over an existing slug): never.
 * - merge/patch: only process fields may change; everything else must be
 *   sent back unchanged, and status may only follow the payment transitions.
 */
export function checkInvoiceWrite(
  current: CurrentPageLike | null,
  write: {
    mode: "merge" | "replace" | "delete";
    title?: unknown;
    content?: unknown;
    type?: unknown;
    frontmatter?: Record<string, unknown>;
  }
): GuardRejection | null {
  if (!current || !isFinalizedInvoice(current)) return null;
  const fm = current.frontmatter ?? {};
  const status = String(fm.status ?? "");

  if (write.mode === "delete") return finalized(status, "Löschen");
  if (write.mode === "replace") return finalized(status, "Überschreiben");

  if (write.title !== undefined && !sameValue(write.title, current.title)) {
    return finalized(status, "Titel");
  }
  if (write.content !== undefined && !sameValue(write.content, current.content)) {
    return finalized(status, "Inhalt");
  }
  if (write.type !== undefined && !sameValue(write.type, current.type)) {
    return finalized(status, "Typ");
  }

  for (const [key, value] of Object.entries(write.frontmatter ?? {})) {
    if (key === "status") continue;
    if (INVOICE_PROCESS_FIELDS.has(key)) continue;
    // type/title are page columns; the engine may not mirror them into frontmatter.
    const stored =
      key === "type"
        ? (fm.type ?? current.type)
        : key === "title"
          ? (fm.title ?? current.title)
          : fm[key];
    if (!sameValue(value, stored)) return finalized(status, `Feld „${key}“`);
  }

  const next = write.frontmatter?.status;
  if (next !== undefined) {
    const allowed = PAYMENT_TRANSITIONS[status];
    if (!allowed || !allowed.has(String(next))) {
      return finalized(status, `Statuswechsel zu „${String(next)}“`);
    }
  }
  return null;
}

// ── Reading the current page (fail closed) ──────────────────────────────

export type CurrentPageRead =
  | { kind: "found"; page: CurrentPageLike }
  | { kind: "missing" }
  | { kind: "error" };

/**
 * Read a page for a guard decision. Anything other than 200/404 is an error —
 * the caller must refuse the write rather than skip the guard.
 */
export async function readCurrentPage(
  engineUrl: string,
  headers: Record<string, string>,
  slug: string,
  timeoutMs = 10_000
): Promise<CurrentPageRead> {
  const path = slug.split("/").map(encodeURIComponent).join("/");
  try {
    const res = await fetch(`${engineUrl}/api/pages/${path}`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "error" };
    const page = (await res.json()) as CurrentPageLike | null;
    if (!page || typeof page !== "object") return { kind: "error" };
    return { kind: "found", page };
  } catch {
    return { kind: "error" };
  }
}

export const GUARD_READ_FAILED: GuardRejection = {
  status: 503,
  error: "guard_unavailable",
  message:
    "Die Seite konnte vor dem Speichern nicht geprüft werden. Aus Sicherheitsgründen wurde nichts geändert — bitte erneut versuchen.",
};

export function rejectionResponse(r: GuardRejection): Response {
  return Response.json({ error: r.error, message: r.message }, { status: r.status });
}
