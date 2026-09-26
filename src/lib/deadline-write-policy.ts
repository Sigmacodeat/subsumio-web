/**
 * deadline-write-policy.ts — server-side rules for every write that creates or
 * changes a Frist, no matter which route the client picks (POST /api/pages,
 * PATCH/DELETE /api/pages/[...slug], /api/pages/array-append|array-mutate).
 *
 *  1. Identity (Vier-Augen-Kontrolle). Who created, approved and completed a
 *     deadline is stamped here from the session — `created_by*`,
 *     `reviewed_by_id`, `completed_by_id` are never taken from the client.
 *     The second-check route compares the checker against these ids.
 *
 *  2. Notfristen. Cancelling, rejecting, moving or clearing the due date of a stored
 *     Notfrist needs the role admin/lawyer AND a written reason
 *     (`change_reason`); removing it from a matter or deleting its page is
 *     refused — it must be cancelled with a reason instead, so it stays
 *     traceable.
 *
 *  3. Revisionssichere Änderungshistorie. Each change is described with
 *     before/after values (due date, status, review) and the acting user; the
 *     entry's `audit_log` is rebuilt from the STORED log plus the server entry
 *     (client-sent history is discarded), and the route writes the same events
 *     to the tamper-evident audit table.
 *
 * Pure functions — the routes read the stored page, call these and do the I/O.
 */

import {
  type GuardRejection,
  embeddedDeadlineKey,
  guardSecondCheckWrite,
  isNotfrist,
} from "@/lib/page-write-guards";

export interface PolicyUser {
  id?: string;
  email?: string;
  name?: string;
  role?: string;
}

/** Fields only the server writes; client values are dropped. */
export const DEADLINE_IDENTITY_FIELDS = [
  "created_by",
  "created_by_id",
  "created_by_email",
  "reviewed_by_id",
  "completed_by_id",
] as const;

/** Client-supplied reason for a Notfrist change; consumed, not stored as-is. */
export const CHANGE_REASON_FIELD = "change_reason";

/** Service identities of createHandler — not a person for the four-eyes rule. */
const NON_PERSON_IDS = new Set(["internal", "custom", "anonymous", "system", ""]);

/** Roles allowed to cancel, reject or move a Notfrist (with a reason). */
const NOTFRIST_CHANGE_ROLES = new Set(["admin", "lawyer"]);

const MIN_REASON_LENGTH = 5;

export type DeadlineChangeKind = "create" | "update" | "cancel" | "reject" | "complete" | "delete";

export interface DeadlineChangeEvent {
  kind: DeadlineChangeKind;
  /** Page slug (standalone) or `<matter slug>#<entry id>`. */
  deadline_id: string;
  title?: string;
  is_notfrist: boolean;
  due_date_before?: string | null;
  due_date_after?: string | null;
  status_before?: string | null;
  status_after?: string | null;
  review_status_before?: string | null;
  review_status_after?: string | null;
  reason?: string;
}

export function isPersonUser(user: PolicyUser | undefined | null): boolean {
  const id = typeof user?.id === "string" ? user.id.trim() : "";
  return !NON_PERSON_IDS.has(id);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function dueOf(fm: Record<string, unknown> | null | undefined): string | null {
  return str(fm?.due_date) ?? str(fm?.date);
}

const CANCELLED = new Set(["cancelled", "storniert"]);

function notfristRejection(title: unknown, what: string, message: string): GuardRejection {
  const name = typeof title === "string" && title.trim() ? `„${title.trim()}“ ` : "";
  return {
    status: 403,
    error: "notfrist_change_forbidden",
    message: `Notfrist ${name}— ${what}: ${message}`,
  };
}

function readReason(incoming: Record<string, unknown>): string {
  const r = incoming[CHANGE_REASON_FIELD];
  return typeof r === "string" ? r.trim() : "";
}

/**
 * The protected transitions of a stored Notfrist. Returns the change kind that
 * needs authorisation (or null when nothing protected happens).
 */
function protectedNotfristChange(
  next: Record<string, unknown>,
  prev: Record<string, unknown>
): "cancel" | "reject" | "due_date" | null {
  const statusNext = String(next.status ?? "");
  const statusPrev = String(prev.status ?? "");
  if (CANCELLED.has(statusNext) && !CANCELLED.has(statusPrev)) return "cancel";
  if (next.review_status === "rejected" && prev.review_status !== "rejected") return "reject";
  // Clearing the due date counts as changing it: a Notfrist without an end
  // date drops out of reminders, the Fristenbuch and the calendar.
  const duePrev = dueOf(prev);
  if (duePrev && dueOf(next) !== duePrev) return "due_date";
  for (const field of ["due_date", "date"] as const) {
    const before = str(prev[field]);
    if (before && str(next[field]) !== before) return "due_date";
  }
  return null;
}

const CHANGE_LABEL: Record<"cancel" | "reject" | "due_date", string> = {
  cancel: "Stornieren",
  reject: "Verwerfen",
  due_date: "Fristende ändern",
};

function authoriseNotfristChange(
  change: "cancel" | "reject" | "due_date",
  title: unknown,
  reason: string,
  user: PolicyUser
): GuardRejection | null {
  if (!NOTFRIST_CHANGE_ROLES.has(String(user.role ?? ""))) {
    return notfristRejection(
      title,
      CHANGE_LABEL[change],
      "nur Anwältinnen/Anwälte oder Administratoren dürfen das."
    );
  }
  if (reason.length < MIN_REASON_LENGTH) {
    return {
      status: 422,
      error: "notfrist_change_reason_required",
      message: `Notfrist ${typeof title === "string" && title.trim() ? `„${title.trim()}“ ` : ""}— ${CHANGE_LABEL[change]}: bitte eine Begründung angeben.`,
    };
  }
  return null;
}

function eventKind(
  next: Record<string, unknown>,
  prev: Record<string, unknown> | null
): DeadlineChangeKind {
  if (!prev) return "create";
  const statusNext = String(next.status ?? "");
  const statusPrev = String(prev.status ?? "");
  if (CANCELLED.has(statusNext) && !CANCELLED.has(statusPrev)) return "cancel";
  if (next.review_status === "rejected" && prev.review_status !== "rejected") return "reject";
  if (statusNext === "done" && statusPrev !== "done") return "complete";
  return "update";
}

function changed(next: Record<string, unknown>, prev: Record<string, unknown> | null): boolean {
  if (!prev) return true;
  return (
    dueOf(next) !== dueOf(prev) ||
    String(next.status ?? "") !== String(prev.status ?? "") ||
    String(next.review_status ?? "") !== String(prev.review_status ?? "") ||
    String(next.title ?? next.description ?? "") !== String(prev.title ?? prev.description ?? "") ||
    Boolean(next.is_notfrist) !== Boolean(prev.is_notfrist)
  );
}

function actorLabel(user: PolicyUser): string {
  return user.name || user.email || user.id || "unbekannt";
}

/**
 * Apply identity stamping, Notfrist protection and the audit trail to ONE
 * deadline (a standalone page's frontmatter or one entry of `deadlines[]`).
 *
 * `prev` is the stored state (null = new deadline). `id` names the deadline
 * in the audit event.
 */
export function applyDeadlineEntryPolicy(
  incoming: Record<string, unknown>,
  prev: Record<string, unknown> | null,
  user: PolicyUser,
  id: string,
  now: string = new Date().toISOString()
):
  | { entry: Record<string, unknown>; event: DeadlineChangeEvent | null }
  | { reject: GuardRejection } {
  const reason = readReason(incoming);
  const next: Record<string, unknown> = { ...incoming };
  delete next[CHANGE_REASON_FIELD];

  // 1 — identity: drop client values, keep the stored ones.
  for (const key of DEADLINE_IDENTITY_FIELDS) {
    delete next[key];
    if (prev && prev[key] !== undefined && prev[key] !== null) next[key] = prev[key];
  }
  const person = isPersonUser(user);
  if (!prev && person) {
    next.created_by = user.email || user.name || user.id;
    next.created_by_id = user.id;
    if (user.email) next.created_by_email = user.email;
  }
  if (next.review_status === "approved" && prev?.review_status !== "approved" && person) {
    next.reviewed_by_id = user.id;
    next.reviewed_by = actorLabel(user);
  }
  if (String(next.status ?? "") === "done" && String(prev?.status ?? "") !== "done" && person) {
    next.completed_by_id = user.id;
  }

  // 2 — Notfrist protection (only for deadlines already stored as Notfrist:
  // a new or ordinary deadline has nothing to protect yet).
  if (prev && isNotfrist(prev)) {
    const change = protectedNotfristChange(next, prev);
    if (change) {
      const rejection = authoriseNotfristChange(change, next.title ?? prev.title, reason, user);
      if (rejection) return { reject: rejection };
    }
  }

  // 3 — audit trail: rebuild from the stored log, never from the client.
  const storedLog = Array.isArray(prev?.audit_log) ? (prev!.audit_log as unknown[]) : [];
  if (prev) next.audit_log = storedLog;
  else delete next.audit_log;

  if (!changed(next, prev)) return { entry: next, event: null };

  const kind = eventKind(next, prev);
  const event: DeadlineChangeEvent = {
    kind,
    deadline_id: id,
    title: String(next.title ?? next.description ?? prev?.title ?? ""),
    is_notfrist: isNotfrist(next) || isNotfrist(prev),
    due_date_before: prev ? dueOf(prev) : null,
    due_date_after: dueOf(next),
    status_before: prev ? str(prev.status) : null,
    status_after: str(next.status),
    review_status_before: prev ? str(prev.review_status) : null,
    review_status_after: str(next.review_status),
    ...(reason ? { reason } : {}),
  };
  next.audit_log = [
    ...storedLog,
    {
      at: now,
      action: kind === "create" ? "created" : kind,
      actor: actorLabel(user),
      actor_id: user.id,
      due_date_before: event.due_date_before,
      due_date_after: event.due_date_after,
      status_before: event.status_before,
      status_after: event.status_after,
      ...(reason ? { reason } : {}),
      server: true,
    },
  ];
  return { entry: next, event };
}

/** Stable entry id for audit + atomic writes; legacy entries fall back to title|date. */
function entryAuditId(scopeSlug: string, d: Record<string, unknown>): string {
  return `${scopeSlug}#${typeof d.id === "string" && d.id ? d.id : embeddedDeadlineKey(d)}`;
}

function newEntryId(): string {
  return `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Apply the policy to a matter's `deadlines[]` write (full replacement array).
 * Entries without an id get one, so later writes can address them atomically.
 * A stored Notfrist missing from the new array is refused (it must be
 * cancelled with a reason, not silently dropped).
 */
export function applyDeadlineArrayPolicy(
  incoming: unknown[],
  storedList: unknown,
  user: PolicyUser,
  scopeSlug: string,
  now: string = new Date().toISOString()
): { deadlines: unknown[]; events: DeadlineChangeEvent[] } | { reject: GuardRejection } {
  const stored = new Map<string, Record<string, unknown>>();
  // Secondary index by title + date: matches an entry the client sends
  // without the id the server assigned (or with a fresh one) to its stored row.
  const byTitleDate = new Map<string, string>();
  const titleDateKey = (d: Record<string, unknown>) =>
    embeddedDeadlineKey({ title: d.title, due_date: d.due_date ?? d.date });
  for (const d of Array.isArray(storedList) ? storedList : []) {
    if (d && typeof d === "object") {
      const rec = d as Record<string, unknown>;
      const key = embeddedDeadlineKey(rec);
      stored.set(key, rec);
      const td = titleDateKey(rec);
      if (!byTitleDate.has(td)) byTitleDate.set(td, key);
    }
  }
  const seen = new Set<string>();
  const out: unknown[] = [];
  const events: DeadlineChangeEvent[] = [];
  for (const raw of incoming) {
    if (!raw || typeof raw !== "object") {
      out.push(raw);
      continue;
    }
    const dl = raw as Record<string, unknown>;
    let key = embeddedDeadlineKey(dl);
    let prev = stored.get(key) ?? null;
    const hasId = typeof dl.id === "string" && dl.id;
    if (!prev) {
      // Same title + date as a stored row: a legacy row without id that the
      // client now sends with one, or a row whose server-assigned id the
      // client does not know yet (sent without id).
      const candidate = byTitleDate.get(titleDateKey(dl));
      const legacy = candidate ? stored.get(candidate) : undefined;
      const legacyHasId = typeof legacy?.id === "string" && !!legacy.id;
      if (legacy && candidate && !seen.has(candidate) && (!hasId || !legacyHasId)) {
        key = candidate;
        prev = legacy;
      }
    }
    if (prev) seen.add(key);
    const withId: Record<string, unknown> = hasId
      ? dl
      : { ...dl, id: typeof prev?.id === "string" && prev.id ? prev.id : newEntryId() };
    const res = applyDeadlineEntryPolicy(withId, prev, user, entryAuditId(scopeSlug, withId), now);
    if ("reject" in res) return res;
    out.push(res.entry);
    if (res.event) events.push(res.event);
  }
  for (const [key, prev] of stored) {
    if (seen.has(key)) continue;
    if (isNotfrist(prev) && !CANCELLED.has(String(prev.status ?? ""))) {
      return {
        reject: notfristRejection(
          prev.title,
          "Entfernen",
          "eine Notfrist wird nicht gelöscht, sondern mit Begründung storniert."
        ),
      };
    }
    events.push({
      kind: "delete",
      deadline_id: entryAuditId(scopeSlug, prev),
      title: String(prev.title ?? ""),
      is_notfrist: isNotfrist(prev),
      due_date_before: dueOf(prev),
      due_date_after: null,
      status_before: str(prev.status),
      status_after: null,
    });
  }
  return { deadlines: out, events };
}

/** DELETE of a standalone deadline page: a live Notfrist is never deleted. */
export function checkDeadlinePageDelete(
  fm: Record<string, unknown> | null | undefined,
  title?: unknown
): GuardRejection | null {
  if (!fm || !isNotfrist(fm)) return null;
  if (CANCELLED.has(String(fm.status ?? ""))) return null;
  return notfristRejection(
    fm.title ?? title,
    "Löschen",
    "eine Notfrist wird nicht gelöscht, sondern mit Begründung storniert."
  );
}

/** Page types / slugs that hold one standalone deadline. */
export function isDeadlinePage(type: unknown, fmType: unknown, slug: string | undefined): boolean {
  return (
    type === "legal_deadline" ||
    fmType === "legal_deadline" ||
    type === "deadline" ||
    (typeof slug === "string" && slug.startsWith("legal/deadlines/"))
  );
}

/**
 * Entry point for the generic page routes: applies the entry policy to a
 * standalone deadline page and the array policy to a matter's `deadlines[]`.
 * Other pages pass through unchanged.
 */
export function applyDeadlineWritePolicy(args: {
  slug: string;
  type?: unknown;
  incoming: Record<string, unknown>;
  current: { type?: unknown; frontmatter?: Record<string, unknown> } | null;
  user: PolicyUser;
  now?: string;
}):
  | { frontmatter: Record<string, unknown>; events: DeadlineChangeEvent[] }
  | { reject: GuardRejection } {
  const now = args.now ?? new Date().toISOString();
  // A stored page without frontmatter is still an existing page (update, not create).
  const curFm = args.current ? (args.current.frontmatter ?? {}) : null;
  let fm = { ...args.incoming };
  const events: DeadlineChangeEvent[] = [];

  if (isDeadlinePage(args.type ?? args.current?.type, fm.type ?? curFm?.type, args.slug)) {
    // A merge only carries the changed keys: judge the merged result.
    const merged = curFm ? { ...curFm, ...fm } : fm;
    const res = applyDeadlineEntryPolicy(merged, curFm, args.user, args.slug, now);
    if ("reject" in res) return res;
    // Forward only what the client sent plus what the policy owns.
    const out: Record<string, unknown> = { ...fm };
    delete out[CHANGE_REASON_FIELD];
    for (const key of DEADLINE_IDENTITY_FIELDS) {
      delete out[key];
      if (res.entry[key] !== undefined) out[key] = res.entry[key];
    }
    if (res.entry.reviewed_by !== undefined && out.review_status === "approved") {
      out.reviewed_by = res.entry.reviewed_by;
    }
    // The history is server-owned: a new entry is written with the event; a
    // client-sent history is replaced by the stored one.
    if (res.event) out.audit_log = res.entry.audit_log;
    else if ("audit_log" in out) {
      const storedLog = curFm?.audit_log;
      if (Array.isArray(storedLog)) out.audit_log = storedLog;
      else delete out.audit_log;
    }
    fm = out;
    if (res.event) events.push(res.event);
  }

  if (Array.isArray(fm.deadlines)) {
    const res = applyDeadlineArrayPolicy(fm.deadlines, curFm?.deadlines, args.user, args.slug, now);
    if ("reject" in res) return res;
    fm.deadlines = res.deadlines;
    events.push(...res.events);
  }

  return { frontmatter: fm, events };
}

// ── Atomic array ops on `deadlines` ─────────────────────────────────────

export interface ArrayMutation {
  match: Array<string | number | boolean>;
  match_key?: string;
  set?: Record<string, unknown>;
  unset?: string[];
  remove?: boolean;
  unless?: {
    eq?: Record<string, string | number | boolean | null>;
    ne?: Record<string, string | number | boolean | null>;
  };
}

/** Same element selection as the engine's page_array_mutate (text compare + unless). */
export function mutationTargets(list: unknown, m: ArrayMutation): Array<Record<string, unknown>> {
  const key = m.match_key ?? "id";
  const wanted = new Set(m.match.map((v) => String(v)));
  const out: Array<Record<string, unknown>> = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object") continue;
    const el = raw as Record<string, unknown>;
    if (el[key] === undefined || el[key] === null || !wanted.has(String(el[key]))) continue;
    const eq = m.unless?.eq;
    const ne = m.unless?.ne;
    const eqHit = !eq || Object.entries(eq).every(([k, v]) => el[k] === v);
    const neHit =
      !ne ||
      Object.entries(ne).every(
        ([k, v]) => el[k] !== undefined && el[k] !== null && String(el[k]) !== String(v)
      );
    if ((eq || ne) && eqHit && neHit) continue; // skipped by `unless`
    out.push(el);
  }
  return out;
}

/**
 * Judge an atomic mutation of `deadlines[]`. Returns one engine mutation PER
 * matched entry (matched by its id), carrying the policy's stamps and audit
 * entry, plus the audit events — or a rejection.
 */
export function planDeadlineArrayMutation(
  storedList: unknown,
  m: ArrayMutation,
  user: PolicyUser,
  scopeSlug: string,
  now: string = new Date().toISOString()
):
  | {
      perEntry: Array<{
        id: string;
        set?: Record<string, unknown>;
        unset?: string[];
        remove?: boolean;
      }>;
      events: DeadlineChangeEvent[];
    }
  | { reject: GuardRejection } {
  const targets = mutationTargets(storedList, m);
  const perEntry: Array<{
    id: string;
    set?: Record<string, unknown>;
    unset?: string[];
    remove?: boolean;
  }> = [];
  const events: DeadlineChangeEvent[] = [];
  for (const prev of targets) {
    const id = typeof prev.id === "string" && prev.id ? prev.id : null;
    if (!id) {
      return {
        reject: {
          status: 409,
          error: "deadline_without_id",
          message:
            "Diese Frist hat noch keine eindeutige Kennung. Bitte die Akte einmal öffnen und speichern, dann erneut versuchen.",
        },
      };
    }
    if (m.remove) {
      if (isNotfrist(prev) && !CANCELLED.has(String(prev.status ?? ""))) {
        return {
          reject: notfristRejection(
            prev.title,
            "Entfernen",
            "eine Notfrist wird nicht gelöscht, sondern mit Begründung storniert."
          ),
        };
      }
      perEntry.push({ id, remove: true });
      events.push({
        kind: "delete",
        deadline_id: `${scopeSlug}#${id}`,
        title: String(prev.title ?? ""),
        is_notfrist: isNotfrist(prev),
        due_date_before: dueOf(prev),
        due_date_after: null,
        status_before: str(prev.status),
        status_after: null,
      });
      continue;
    }
    const merged: Record<string, unknown> = { ...prev, ...(m.set ?? {}) };
    for (const k of m.unset ?? []) delete merged[k];
    const res = applyDeadlineEntryPolicy(merged, prev, user, `${scopeSlug}#${id}`, now);
    if ("reject" in res) return res;
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(res.entry)) {
      if (k === "id") continue;
      if (JSON.stringify(v) !== JSON.stringify(prev[k])) set[k] = v;
    }
    const unset = Object.keys(prev).filter((k) => k !== "id" && !(k in res.entry));
    perEntry.push({
      id,
      ...(Object.keys(set).length ? { set } : {}),
      ...(unset.length ? { unset } : {}),
    });
    if (res.event) events.push(res.event);
  }
  return { perEntry, events };
}

/** New items appended to `deadlines[]`: stamped like a create. */
export function planDeadlineArrayAppend(
  items: unknown[],
  user: PolicyUser,
  scopeSlug: string,
  now: string = new Date().toISOString()
): { items: unknown[]; events: DeadlineChangeEvent[] } | { reject: GuardRejection } {
  const out: unknown[] = [];
  const events: DeadlineChangeEvent[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      out.push(raw);
      continue;
    }
    const dl = raw as Record<string, unknown>;
    const withId = typeof dl.id === "string" && dl.id ? dl : { ...dl, id: newEntryId() };
    const res = applyDeadlineEntryPolicy(
      withId,
      null,
      user,
      `${scopeSlug}#${String(withId.id)}`,
      now
    );
    if ("reject" in res) return res;
    out.push(res.entry);
    if (res.event) events.push(res.event);
  }
  return { items: out, events };
}

/** Audit action for a change event. */
export function auditActionFor(
  kind: DeadlineChangeKind
): "deadline.create" | "deadline.update" | "deadline.delete" {
  if (kind === "create") return "deadline.create";
  if (kind === "delete") return "deadline.delete";
  return "deadline.update";
}

// ── One entry point for every deadline write ────────────────────────────

/**
 * The complete rule set for a write that may touch a Frist — the four-eyes
 * rule for Notfristen (second-check fields are server-owned; no `done`
 * without the stamped second check) plus identity stamping, Notfrist change
 * protection and the audit trail. The generic page routes apply the same two
 * steps; every other writer (Copilot, beA, WhatsApp, automations) calls this
 * so it cannot skip one of them.
 */
export function guardDeadlineWrite(args: {
  slug: string;
  type?: unknown;
  incoming: Record<string, unknown>;
  current: { type?: unknown; frontmatter?: Record<string, unknown> } | null;
  user: PolicyUser;
  now?: string;
}):
  | { frontmatter: Record<string, unknown>; events: DeadlineChangeEvent[] }
  | { reject: GuardRejection } {
  const guarded = guardSecondCheckWrite(args.incoming, args.current?.frontmatter ?? null);
  if ("reject" in guarded) return guarded;
  return applyDeadlineWritePolicy({ ...args, incoming: guarded.frontmatter });
}
