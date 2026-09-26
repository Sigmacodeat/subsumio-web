/**
 * Vier-Augen-Kontrolle für Notfristen — the engine-side backstop.
 *
 * The web app stamps the second check (`second_check_by`, `second_check_at`)
 * only in its second-check route and strips those fields from every other
 * write. Every other writer — generic page routes, Copilot, beA, WhatsApp,
 * automations, MCP — therefore cannot produce them. This gate refuses any
 * write that moves a Notfrist to `done` without them, whichever path the
 * write took, so a new write path cannot complete a Notfrist on its own.
 *
 * A Notfrist is a deadline with `is_notfrist: true` or
 * `second_check_required: true` (stored or incoming). Covered shapes: a
 * standalone deadline page (the whole frontmatter) and the entries of a
 * matter's `deadlines` array. A deadline that is already stored as done is
 * not re-judged. Pure functions — the operations do the I/O.
 */

export const NOTFRIST_GATE_CODE = "notfrist_second_check_required";

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function isNotfristRecord(fm: Rec | null | undefined): boolean {
  if (!fm) return false;
  return fm.is_notfrist === true || fm.second_check_required === true;
}

function isDone(fm: Rec | null | undefined): boolean {
  return String(fm?.status ?? "") === "done";
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function hasSecondCheckStamp(fm: Rec | null | undefined): boolean {
  return !!fm && nonEmpty(fm.second_check_by) && nonEmpty(fm.second_check_at);
}

/** Same identity as the web app's embeddedDeadlineKey. */
function entryKey(d: Rec): string {
  if (typeof d.id === "string" && d.id) return `id:${d.id}`;
  return `t:${String(d.title ?? "")
    .trim()
    .toLowerCase()}|${String(d.due_date ?? d.date ?? "")}`;
}

function completesWithoutCheck(next: Rec, prev: Rec | null): boolean {
  if (!isDone(next) || isDone(prev)) return false;
  if (!isNotfristRecord(next) && !isNotfristRecord(prev)) return false;
  return !hasSecondCheckStamp(next);
}

function label(d: Rec | null | undefined): string {
  const t = d?.title ?? d?.description;
  return typeof t === "string" && t.trim() ? t.trim() : "Notfrist";
}

/**
 * The title of the first Notfrist this write would complete without a second
 * check, or null when the write is fine. `prev` is the stored frontmatter
 * (null for a new page), `next` the frontmatter that would be stored.
 */
export function notfristCompletionViolation(prev: Rec | null, next: Rec): string | null {
  if (completesWithoutCheck(next, prev)) {
    return nonEmpty(next.title) || nonEmpty(next.description) ? label(next) : label(prev);
  }

  if (Array.isArray(next.deadlines)) {
    const stored = new Map<string, Rec>();
    for (const d of Array.isArray(prev?.deadlines) ? (prev!.deadlines as unknown[]) : []) {
      if (isRec(d)) stored.set(entryKey(d), d);
    }
    for (const d of next.deadlines as unknown[]) {
      if (!isRec(d)) continue;
      if (completesWithoutCheck(d, stored.get(entryKey(d)) ?? null)) return label(d);
    }
  }
  return null;
}

/**
 * page_array_append on `deadlines`: a new entry may not arrive as a completed
 * Notfrist without a second check.
 */
export function notfristAppendViolation(field: string, items: unknown[]): string | null {
  if (field !== "deadlines") return null;
  for (const d of items) {
    if (isRec(d) && completesWithoutCheck(d, null)) return label(d);
  }
  return null;
}

/**
 * page_array_mutate on `deadlines`: simulate the patch on each matched stored
 * entry (same selection rule: match_key compared as text; `unless` only ever
 * skips entries, so ignoring it can only make the check stricter).
 */
export function notfristMutateViolation(
  field: string,
  storedList: unknown,
  mutation: {
    matchKey: string;
    matchValues: string[];
    set?: Rec;
    unset?: string[];
    remove?: boolean;
  }
): string | null {
  if (field !== "deadlines" || mutation.remove) return null;
  const wanted = new Set(mutation.matchValues);
  for (const raw of Array.isArray(storedList) ? storedList : []) {
    if (!isRec(raw)) continue;
    const key = raw[mutation.matchKey];
    if (key === undefined || key === null || !wanted.has(String(key))) continue;
    const next: Rec = { ...raw, ...(mutation.set ?? {}) };
    for (const k of mutation.unset ?? []) delete next[k];
    if (completesWithoutCheck(next, raw)) return label(raw);
  }
  return null;
}

export function notfristGateMessage(title: string): string {
  return `Notfrist „${title}“ erfordert Vier-Augen-Kontrolle — die Erledigung muss über die Zweitprüfung durch eine zweite Person bestätigt werden.`;
}
