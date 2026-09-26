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

/**
 * True when page `content` opens with a YAML frontmatter block. Page metadata
 * is sent only as `title`/`type`/`frontmatter`, where the write guards see
 * it; the engine refuses such content as well.
 */
export function hasLeadingFrontmatter(content: unknown): boolean {
  return typeof content === "string" && /^\uFEFF?---[ \t]*(?:\r?\n|$)/.test(content);
}

export const FRONTMATTER_IN_CONTENT_REJECTION: GuardRejection = {
  status: 400,
  error: "frontmatter_in_content",
  message: "Metadaten gehören in das Feld „frontmatter“, nicht als YAML-Block in den Seiteninhalt.",
};

/** A matter's access rules: changed only via /api/cases/access. */
export const ACCESS_RULE_FIELDS = ["permissions"] as const;

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

/** Flags that make a deadline a Notfrist. Once stored as true they are
 *  sticky for generic page writes — otherwise one write could drop the flag
 *  and the next could complete the deadline without a second check. */
const NOTFRIST_FLAGS = ["is_notfrist", "second_check_required"] as const;

/** Remove client-supplied second-check fields and put back the stored ones;
 *  keep a stored Notfrist a Notfrist. */
function withStoredSecondCheck(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  const next = { ...incoming };
  for (const key of SECOND_CHECK_FIELDS) {
    delete next[key];
    if (stored && stored[key] !== undefined && stored[key] !== null) next[key] = stored[key];
  }
  for (const flag of NOTFRIST_FLAGS) {
    if (stored?.[flag] === true) next[flag] = true;
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

export function finalized(status: string, detail: string): GuardRejection {
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

// ── Unterschriebene Dokumente ───────────────────────────────────────────

/** Documents a client signs in the portal; their text is bound to the signature. */
const SIGNABLE_DOCUMENT_TYPES = new Set(["signature_request", "power_of_attorney"]);
/** The signature evidence stored on the signed document. */
const SIGNED_EVIDENCE_FIELDS = ["signed_at", "signed_by", "signature_id", "signed_document_hash"];

function isSignedDocument(page: CurrentPageLike | null | undefined): boolean {
  if (!page) return false;
  const fmType = page.frontmatter?.type;
  const type = typeof page.type === "string" && page.type ? page.type : fmType;
  if (typeof type !== "string" || !SIGNABLE_DOCUMENT_TYPES.has(type)) return false;
  const fm = page.frontmatter ?? {};
  return fm.status === "signed" || typeof fm.signed_document_hash === "string";
}

/**
 * A signed signature request / power of attorney keeps the text that was
 * signed: its body and the signature evidence cannot be changed or replaced
 * (the signature records the text's hash). Status bookkeeping — e.g. revoking
 * a power of attorney — stays possible. `null` = allowed.
 */
export function checkSignedDocumentWrite(
  current: CurrentPageLike | null,
  write: {
    mode: "merge" | "replace";
    content?: unknown;
    frontmatter?: Record<string, unknown>;
  }
): GuardRejection | null {
  if (!current || !isSignedDocument(current)) return null;
  const reject = (detail: string): GuardRejection => ({
    status: 409,
    error: "document_signed",
    message: `Das Dokument ist unterschrieben und kann nicht mehr geändert werden (${detail}). Für eine neue Fassung bitte eine neue Signaturanfrage anlegen.`,
  });
  if (write.mode === "replace") return reject("Überschreiben");
  if (write.content !== undefined && !sameValue(write.content, current.content ?? "")) {
    return reject("Inhalt");
  }
  const fm = current.frontmatter ?? {};
  for (const key of SIGNED_EVIDENCE_FIELDS) {
    if (
      write.frontmatter &&
      key in write.frontmatter &&
      !sameValue(write.frontmatter[key], fm[key])
    ) {
      return reject(`Feld „${key}“`);
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

// ── Anlegen ersetzt nie still ───────────────────────────────────────────
//
// A non-merge POST replaces the stored page completely. For matters and
// invoices a create must never do that by accident:
//  - no stored page: the engine write is create-only (`if_absent`), so a
//    page created in the meantime is refused in the same statement;
//  - a stored page: refused unless the caller asks for the replacement on
//    purpose, with If-Match naming the stored version.

/** Page types whose create never replaces a stored page. */
export const CREATE_ONLY_TYPES: ReadonlySet<string> = new Set(["legal_case", "invoice"]);

function pageTypeOf(page: CurrentPageLike | null): string | undefined {
  if (!page) return undefined;
  const fmType = page.frontmatter?.type;
  return page.type ?? (typeof fmType === "string" ? fmType : undefined);
}

/** The stored page's version (frontmatter.version; 0 when never versioned). */
export function storedPageVersion(page: CurrentPageLike | null): number {
  const v = page?.frontmatter?.version;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export type CreateOverExistingVerdict =
  /** Not a protected create (merge, or another page type). */
  | { kind: "pass" }
  /** No stored page: write create-only. */
  | { kind: "create_only" }
  /** Deliberate replacement of the stored version; the write carries `version`. */
  | { kind: "replace"; version: number }
  | { kind: "reject"; reject: GuardRejection };

export function checkCreateOverExisting(
  current: CurrentPageLike | null,
  write: { merge: boolean; type?: unknown; ifMatch: string | null }
): CreateOverExistingVerdict {
  if (write.merge) return { kind: "pass" };
  const incomingType = typeof write.type === "string" ? write.type : undefined;
  const storedType = pageTypeOf(current);
  const protectedType =
    (incomingType !== undefined && CREATE_ONLY_TYPES.has(incomingType)) ||
    (storedType !== undefined && CREATE_ONLY_TYPES.has(storedType));
  if (!protectedType) return { kind: "pass" };
  if (!current) return { kind: "create_only" };

  if (write.ifMatch === null || write.ifMatch.trim() === "") {
    return {
      kind: "reject",
      reject: {
        status: 409,
        error: "page_exists",
        message:
          storedType === "invoice" || incomingType === "invoice"
            ? "Unter dieser Adresse gibt es bereits eine Rechnung. Es wurde nichts überschrieben."
            : "Unter dieser Adresse gibt es bereits eine Akte. Es wurde nichts überschrieben.",
      },
    };
  }
  const stored = storedPageVersion(current);
  const expected = Number(write.ifMatch.trim());
  if (!Number.isInteger(expected) || expected !== stored) {
    return {
      kind: "reject",
      reject: {
        status: 409,
        error: "version_conflict",
        message: "Die Seite wurde zwischenzeitlich von einem anderen Nutzer bearbeitet.",
      },
    };
  }
  return { kind: "replace", version: stored + 1 };
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

// ── Geschützte Seitentypen ──────────────────────────────────────────────
//
// Some records have their own route that enforces the domain rules (roles,
// validation, history, audit, locks). The generic page API must not become a
// side door around those routes:
//
//  - Kanzlei-Einstellungen (IBAN, 2FA-Pflicht, SMTP): only `settings.write`.
//  - Identitätsprüfungen (KYC, §§ 8a ff. RAO): only /api/kyc.
//  - Anderkonten (Treuhand-Journal): only /api/legal/trust-accounts.
//  - Freigabe-Aktionen (Vier-Augen): created as `pending`, decided only via
//    /api/approvals.
//  - Akten: Kollisionsstatus/Mandatsannahme and Legal Hold only via their
//    routes; archived matters are read-only; deleting/archiving only via the
//    delete route (role + Legal-Hold check there).
//
// Every rule is judged against the STORED page (a type sent with the request
// counts in addition, never instead), so a request cannot re-label a page to
// slip past a rule.

export interface WriteActor {
  email: string;
  /** `settings.write` (admin) — Kanzlei-Einstellungen. */
  canWriteSettings: boolean;
}

export type ProtectedWriteMode = "merge" | "replace" | "delete" | "array";

export const KANZLEI_SETTINGS_PAGE_SLUG = "legal/settings/kanzlei";

function storedType(page: CurrentPageLike | null | undefined): string {
  if (!page) return "";
  if (typeof page.type === "string" && page.type) return page.type;
  const fmType = page.frontmatter?.type;
  return typeof fmType === "string" ? fmType : "";
}

function pageTypes(
  slug: string,
  current: CurrentPageLike | null,
  incomingType: unknown,
  incomingFm: Record<string, unknown> | undefined
): Set<string> {
  const types = new Set<string>();
  const stored = storedType(current);
  if (stored) types.add(stored);
  if (typeof incomingType === "string" && incomingType) types.add(incomingType);
  if (typeof incomingFm?.type === "string" && incomingFm.type) types.add(incomingFm.type);
  if (slug === KANZLEI_SETTINGS_PAGE_SLUG) types.add("kanzlei_settings");
  if (slug.startsWith("legal/kyc/")) types.add("kyc_verification");
  if (slug.startsWith("trust-accounts/")) types.add("trust_account");
  if (slug.startsWith("settings/webhooks/")) types.add("webhook_config");
  return types;
}

export function isKanzleiSettingsTarget(
  slug: string,
  current: CurrentPageLike | null,
  incomingType?: unknown,
  incomingFm?: Record<string, unknown>
): boolean {
  return pageTypes(slug, current, incomingType, incomingFm).has("kanzlei_settings");
}

/** Kollisionsprüfung & Mandatsannahme: stamped only by the case-create and
 *  intake-convert flows, never changed by a generic update. */
export const CASE_CONFLICT_FIELDS = [
  "conflict_status",
  "conflict_waived_by",
  "conflict_waived_by_role",
  "conflict_waived_at",
  "mandate_acceptance",
] as const;

/** Written only by /api/cases/legal-hold. */
export const LEGAL_HOLD_FIELDS = [
  "legal_hold",
  "legal_hold_reason",
  "legal_hold_set_at",
  "legal_hold_set_by",
] as const;

/** Deletion/archive markers: written only by the delete route and the trash. */
export const DELETION_MARKER_FIELDS = [
  "tombstoned_at",
  "tombstoned_by",
  "tombstone_reason",
  "archived_at",
  "archived_by",
] as const;

/** Decision and execution of a Freigabe: only /api/approvals. */
export const APPROVAL_DECISION_FIELDS = [
  "status",
  "decided_at",
  "decided_by",
  "reject_reason",
  "execution_status",
  "execution_result",
  "executed_at",
  "executed_by",
  "execution_error",
  "submitted_by",
] as const;

function forbiddenPage(message: string): GuardRejection {
  return { status: 403, error: "protected_page", message };
}

function forbiddenFields(fields: string[], message: string): GuardRejection {
  return { status: 403, error: "protected_fields", message: `${message} (${fields.join(", ")}).` };
}

export const CASE_ARCHIVED_REJECTION: GuardRejection = {
  status: 403,
  error: "case_archived",
  message: "Akte ist archiviert — zuerst wiederherstellen, um Änderungen zu speichern.",
};

function isUnset(v: unknown): boolean {
  return v === null || v === undefined;
}

/** Keys of `fields` this write would change against the stored frontmatter. */
function changedKeys(
  fields: readonly string[],
  incoming: Record<string, unknown> | undefined,
  stored: Record<string, unknown>,
  mode: ProtectedWriteMode,
  arrayField: string | undefined
): string[] {
  if (mode === "array") return arrayField && fields.includes(arrayField) ? [arrayField] : [];
  const out: string[] = [];
  for (const key of fields) {
    if (incoming && Object.prototype.hasOwnProperty.call(incoming, key)) {
      const next = incoming[key];
      const prev = stored[key];
      if (isUnset(next) && isUnset(prev)) continue;
      if (!sameValue(next, prev)) out.push(key);
    } else if (mode === "replace" && !isUnset(stored[key])) {
      // A full replace without the key would wipe it.
      out.push(key);
    }
  }
  return out;
}

export function isArchivedCase(page: CurrentPageLike | null | undefined): boolean {
  return storedType(page) === "legal_case" && page?.frontmatter?.status === "archived";
}

/**
 * Judge a generic page write (POST /api/pages, PATCH/DELETE /api/pages/<slug>,
 * /api/pages/array-*) against the protected record types. Returns the
 * frontmatter to forward (possibly stamped) or a rejection. `current` null =
 * the page does not exist yet.
 *
 * `restore` is set only by the PATCH route for its own, role-checked restore
 * path: an archived matter may then be written back to an active status.
 */
export function guardProtectedPageWrite(input: {
  slug: string;
  current: CurrentPageLike | null;
  actor: WriteActor;
  mode: ProtectedWriteMode;
  type?: unknown;
  frontmatter?: Record<string, unknown>;
  /** Array ops: the top-level frontmatter field being mutated. */
  field?: string;
  restore?: boolean;
}): { frontmatter?: Record<string, unknown> } | { reject: GuardRejection } {
  const { slug, current, actor, mode, field } = input;
  const incoming = input.frontmatter;
  const stored = (current?.frontmatter ?? {}) as Record<string, unknown>;
  const types = pageTypes(slug, current, input.type, incoming);

  if (types.has("kanzlei_settings")) {
    if (mode === "delete" || mode === "array") {
      return {
        reject: forbiddenPage(
          "Die Kanzlei-Einstellungen können nur in den Einstellungen geändert werden."
        ),
      };
    }
    if (!actor.canWriteSettings) {
      return {
        reject: forbiddenPage("Nur Administratoren dürfen die Kanzlei-Einstellungen ändern."),
      };
    }
  }

  if (types.has("kyc_verification")) {
    return {
      reject: forbiddenPage(
        "Identitätsprüfungen werden nur über die Identitätsprüfung (KYC) angelegt und geändert."
      ),
    };
  }

  // Outgoing webhooks send firm data to external systems: registered and
  // removed only through /api/webhooks/outgoing (admin, address check, audit).
  if (types.has("webhook_config")) {
    return {
      reject: forbiddenPage(
        "Webhooks werden nur unter Einstellungen → Webhooks angelegt und geändert."
      ),
    };
  }

  if (types.has("trust_account")) {
    return {
      reject: forbiddenPage(
        "Anderkonten und Treuhandbuchungen werden nur über die Treuhandverwaltung geändert."
      ),
    };
  }

  if (types.has("agent_action")) {
    if (current) {
      // A decided action is the record of the four-eyes decision.
      if (mode !== "delete") {
        return {
          reject: forbiddenPage("Freigaben werden nur in der Freigabe-Übersicht entschieden."),
        };
      }
      if (String(stored.status ?? "pending") !== "pending") {
        return { reject: forbiddenPage("Eine entschiedene Freigabe kann nicht gelöscht werden.") };
      }
    } else if (mode === "merge" || mode === "replace") {
      const next = { ...(incoming ?? {}) };
      if (next.status !== undefined && next.status !== "pending") {
        return {
          reject: forbiddenPage("Eine Freigabe wird immer als offen (pending) eingereicht."),
        };
      }
      for (const key of APPROVAL_DECISION_FIELDS) delete next[key];
      next.status = "pending";
      // Server-stamped submitter: the four-eyes check compares against it.
      next.submitted_by = actor.email;
      return { frontmatter: next };
    }
  }

  // Walls, team, visibility and grants of a matter change only through the
  // matter-access route (role checks, audit). Sending them unchanged is fine;
  // a full replace that omits them keeps the stored rules (engine).
  if (mode !== "delete") {
    const access = changedKeys(
      ACCESS_RULE_FIELDS,
      incoming,
      stored,
      mode === "replace" ? "merge" : mode,
      field
    );
    if (access.length > 0) {
      return {
        reject: forbiddenFields(
          access,
          "Sichtbarkeit, Aktenteam, Chinese Walls und Freigaben werden nur über die Aktenrechte geändert"
        ),
      };
    }
  }

  if (current && mode !== "delete") {
    if (isArchivedCase(current) && !input.restore) return { reject: CASE_ARCHIVED_REJECTION };

    const isCase = types.has("legal_case");
    if (isCase) {
      const conflict = changedKeys(CASE_CONFLICT_FIELDS, incoming, stored, mode, field);
      if (conflict.length > 0) {
        return {
          reject: forbiddenFields(
            conflict,
            "Kollisionsstatus und Mandatsannahme werden nur über Kollisionsprüfung und Mandatsannahme gesetzt"
          ),
        };
      }
    }

    const hold = changedKeys(LEGAL_HOLD_FIELDS, incoming, stored, mode, field);
    if (hold.length > 0) {
      return {
        reject: forbiddenFields(
          hold,
          "Legal Hold wird nur über die Aufbewahrungssperre gesetzt oder aufgehoben"
        ),
      };
    }

    const markers = changedKeys(DELETION_MARKER_FIELDS, incoming, stored, mode, field);
    const nextStatus = mode === "array" ? undefined : incoming?.status;
    const deletingStatus =
      typeof nextStatus === "string" &&
      nextStatus !== stored.status &&
      (nextStatus === "tombstoned" || (isCase && nextStatus === "archived"));
    const deleting =
      markers.length > 0 || deletingStatus || (mode === "array" && field === "status");
    if (deleting && !input.restore) {
      return {
        reject: forbiddenPage(
          "Löschen und Archivieren nur über die Löschfunktion — dort gelten Rollen- und Legal-Hold-Prüfung."
        ),
      };
    }
  }

  return incoming ? { frontmatter: incoming } : {};
}

/**
 * Guard for the atomic array routes (/api/pages/array-append, -mutate): reads
 * the stored page (fail closed) and judges the mutated field like a write.
 * `null` = allowed.
 */
export async function checkProtectedArrayWrite(
  engineUrl: string,
  headers: Record<string, string>,
  slug: string,
  field: string,
  actor: WriteActor
): Promise<GuardRejection | null> {
  const read = await readCurrentPage(engineUrl, headers, slug);
  if (read.kind === "error") return GUARD_READ_FAILED;
  // A missing page: the engine op fails on its own; nothing to protect here.
  if (read.kind === "missing") return null;
  const verdict = guardProtectedPageWrite({
    slug,
    current: read.page,
    actor,
    mode: "array",
    field,
  });
  return "reject" in verdict ? verdict.reject : null;
}
