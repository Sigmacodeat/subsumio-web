// Which deadline reminders are due today, across both places a deadline lives:
// the `deadlines` list of a matter and standalone `legal_deadline` records
// (created from the deadline list, the import, document analysis or quick create).
// Staged escalation 7 → 3 → 1 → 0 days before; the Vorfrist once when reached.

import { isVorfristReached } from "@/lib/legal/vorfrist";
import { isUnreviewedAiSuggestion } from "@/lib/deadline-alerts";
import { activeDelegateFor, type AbsenceRecord } from "@/lib/absence";

export const REMINDER_STAGES_DAYS = [7, 3, 1, 0] as const;

/**
 * Parses a firm-configured reminder-stage list ("7,3,1,0" or number[]) into a
 * sane descending list of day offsets. Anything unreadable falls back to the
 * statutory-safe default — a typo in settings must never silence reminders.
 */
export function parseReminderStages(input: unknown): readonly number[] {
  const raw: unknown[] = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/[,\s;]+/)
      : [];
  const stages = [
    ...new Set(
      raw
        .map((v) => (typeof v === "number" ? v : parseInt(String(v), 10)))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365)
    ),
  ].sort((a, b) => b - a);
  return stages.length > 0 ? stages : REMINDER_STAGES_DAYS;
}

/**
 * Shown next to an AI-proposed deadline nobody confirmed yet, on every channel.
 * Every AI result needs human verification (ÖRAK KI-Leitfaden 2025); changed
 * deadlines must stay recognisable (BGH XII ZB 338/24).
 */
export const UNCONFIRMED_AI_NOTICE = "Unbestätigte KI-Frist – bitte prüfen";

export interface ReminderDeadline {
  id?: string;
  title?: string;
  description?: string;
  due_date?: string;
  date?: string;
  status?: string;
  review_status?: string;
  reminder_sent_at?: string;
  reminder_stages_sent?: number[];
  vorfrist_date?: string;
  vorfrist_reminder_sent_at?: string;
  is_notfrist?: boolean;
  erv_zustelldatum?: string;
  /** Origin marks of an AI-proposed deadline (see isUnreviewedAiSuggestion). */
  source?: string;
  ai_confidence?: string;
  ai_generated?: boolean;
  matched_rule?: string;
  /**
   * Optional per-item owner — deadlines normally inherit the matter's
   * own_lawyer_name, but a page may carry its own `responsible`/`assignee`
   * (e.g. a task-derived follow-up). Wins over the case-level person in
   * annotateDelegations.
   */
  responsible?: string;
  assignee?: string;
}

export interface ReminderPage {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

export type ReminderRef =
  | { kind: "case"; caseSlug: string; id?: string; title?: string; dueDate: string }
  | { kind: "page"; slug: string };

export interface ReminderDelegation {
  /** Responsible lawyer of the matter (own_lawyer_name), currently absent. */
  responsible: string;
  delegateName: string;
  delegateEmail: string;
  until: string;
}

export interface DueReminder {
  ref: ReminderRef;
  title: string;
  dueDate: string;
  daysRemaining: number;
  /** Escalation stage to send now; undefined when only the Vorfrist is due. */
  stage?: number;
  vorfristReached: boolean;
  isNotfrist: boolean;
  ervZustelldatum?: string;
  /** legal_follow_up instead of a real deadline — the reminder says "Wiedervorlage". */
  isFollowUp?: boolean;
  /** Per-item owner from the deadline frontmatter, if any. */
  responsible?: string;
  /** Set when this item's owner is absent — names the stand-in. */
  delegation?: ReminderDelegation;
  /**
   * An AI-proposed deadline nobody confirmed yet. It still reminds on every
   * channel — a missed real Frist weighs more than a false alarm — but the
   * reminder says so, so nobody mistakes it for a confirmed entry.
   */
  unreviewedAi: boolean;
}

export interface ReminderGroup {
  caseSlug?: string;
  caseLabel: string;
  caseTitle?: string;
  items: DueReminder[];
  /** Set when the responsible lawyer is absent — names the stand-in. */
  delegation?: ReminderDelegation;
}

const CLOSED_STATUS =
  /^(done|erledigt|completed|abgeschlossen|cancelled|canceled|storniert|tombstoned)$/i;
const DISCARDED_STATUS = /^(cancelled|canceled|storniert|tombstoned)$/i;

type DeadlineStatusLike = { status?: unknown; review_status?: unknown };

/** Done, cancelled, rejected or deleted deadlines never remind. */
export function isClosedDeadline(d: DeadlineStatusLike): boolean {
  return CLOSED_STATUS.test(String(d.status ?? "")) || d.review_status === "rejected";
}

/**
 * The part of `isClosedDeadline` that means "this deadline does not exist
 * (any more)": cancelled, deleted, or a discarded AI suggestion. Such entries
 * are left out of every list; the rest of the closed set is "erledigt".
 */
export function isDiscardedDeadline(d: DeadlineStatusLike): boolean {
  return DISCARDED_STATUS.test(String(d.status ?? "")) || d.review_status === "rejected";
}

export function daysUntil(dateStr: string, now: Date): number {
  const target = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

/** Lowest escalation stage reached and not yet sent. */
export function nextDueStage(
  d: ReminderDeadline,
  dueDate: string,
  now: Date,
  stages: readonly number[] = REMINDER_STAGES_DAYS
): number | undefined {
  const remaining = daysUntil(dueDate, now);
  if (remaining < 0) return undefined;
  const sent = new Set(d.reminder_stages_sent ?? []);
  const due = stages.filter((stage) => remaining <= stage && !sent.has(stage));
  return due.length > 0 ? Math.min(...due) : undefined;
}

function dueReminder(
  d: ReminderDeadline,
  ref: ReminderRef,
  title: string,
  now: Date,
  stages: readonly number[] = REMINDER_STAGES_DAYS
): DueReminder | null {
  const dueDate = String(d.due_date ?? d.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || isClosedDeadline(d)) return null;
  const daysRemaining = daysUntil(dueDate, now);
  if (daysRemaining < 0) return null; // overdue: the daily digest reports it
  const stage = nextDueStage(d, dueDate, now, stages);
  const vorfristReached = Boolean(
    d.vorfrist_date &&
    !d.vorfrist_reminder_sent_at &&
    isVorfristReached(d.vorfrist_date, now.toISOString().slice(0, 10))
  );
  if (stage === undefined && !vorfristReached) return null;
  return {
    ref,
    title,
    dueDate,
    daysRemaining,
    stage,
    vorfristReached,
    isNotfrist: d.is_notfrist === true,
    ervZustelldatum: d.erv_zustelldatum,
    responsible: str(d.responsible) ?? str(d.assignee),
    unreviewedAi: isUnreviewedAiSuggestion(d),
  };
}

function norm(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Due reminders grouped by matter. Standalone records are the source of truth
 * for themselves: a copy of one inside a matter's list (id "page:<slug>", or the
 * same date and title) is not reminded twice. Archived matters are skipped.
 */
export function collectDueReminders(
  cases: ReminderPage[],
  deadlinePages: ReminderPage[],
  now: Date,
  followUpPages: ReminderPage[] = [],
  stages: readonly number[] = REMINDER_STAGES_DAYS
): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup>();
  const caseBySlug = new Map(cases.map((c) => [c.slug, c]));
  const archived = (c: ReminderPage | undefined) => c?.frontmatter?.status === "archived";
  const groupFor = (caseSlug: string | undefined): ReminderGroup => {
    const key = caseSlug ?? "";
    let g = groups.get(key);
    if (!g) {
      const c = caseSlug ? caseBySlug.get(caseSlug) : undefined;
      g = {
        caseSlug,
        caseLabel: str(c?.frontmatter?.case_number) ?? c?.title ?? caseSlug ?? "Ohne Akte",
        caseTitle: c?.title,
        items: [],
      };
      groups.set(key, g);
    }
    return g;
  };

  const pageKeys = new Set<string>();
  for (const page of deadlinePages) {
    const fm = (page.frontmatter ?? {}) as ReminderDeadline & Record<string, unknown>;
    if (fm.status === "tombstoned") continue;
    const caseSlug = str(fm.case_slug);
    const due = String(fm.due_date ?? fm.date ?? "").slice(0, 10);
    pageKeys.add(`${caseSlug ?? ""}|${due}|${norm(page.title ?? fm.title)}`);
    if (caseSlug && archived(caseBySlug.get(caseSlug))) continue;
    const title = page.title ?? str(fm.title) ?? str(fm.description) ?? "Frist";
    const item = dueReminder(fm, { kind: "page", slug: page.slug }, title, now, stages);
    if (item) groupFor(caseSlug).items.push(item);
  }

  // Wiedervorlagen remind like deadlines — a follow-up nobody is reminded
  // of is forgotten. `completed` maps to a closed status so done items never
  // fire. The same reminder_stages_sent write-back marks the page, so a WV
  // escalates 7 → 3 → 1 → 0 like a Frist.
  for (const page of followUpPages) {
    const fm = (page.frontmatter ?? {}) as Record<string, unknown> & {
      date?: string;
      completed?: boolean;
      case_slug?: string;
      reminder_stages_sent?: number[];
    };
    if (fm.completed) continue;
    const caseSlug = str(fm.case_slug);
    if (caseSlug && archived(caseBySlug.get(caseSlug))) continue;
    const title = page.title ?? "Wiedervorlage";
    const item = dueReminder(
      fm as ReminderDeadline,
      { kind: "page", slug: page.slug },
      title,
      now,
      stages
    );
    if (item) groupFor(caseSlug).items.push({ ...item, isFollowUp: true });
  }

  for (const c of cases) {
    if (archived(c)) continue;
    const list = Array.isArray(c.frontmatter?.deadlines)
      ? (c.frontmatter.deadlines as ReminderDeadline[])
      : [];
    for (const d of list) {
      if (String(d.id ?? "").startsWith("page:")) continue;
      const due = String(d.due_date ?? d.date ?? "").slice(0, 10);
      if (pageKeys.has(`${c.slug}|${due}|${norm(d.title)}`)) continue;
      const item = dueReminder(
        d,
        { kind: "case", caseSlug: c.slug, id: d.id, title: d.title, dueDate: due },
        d.title ?? "Frist",
        now,
        stages
      );
      if (item) groupFor(c.slug).items.push(item);
    }
  }

  return [...groups.values()].filter((g) => g.items.length > 0);
}

/**
 * Frontmatter fields that record a sent reminder. Every stage already passed is
 * recorded, not just the one sent: a deadline first seen three days before must
 * not send the seven-day reminder the next day.
 */
export function sentFields(
  d: ReminderDeadline,
  item: Pick<DueReminder, "stage" | "vorfristReached" | "daysRemaining">,
  nowIso: string,
  stages: readonly number[] = REMINDER_STAGES_DAYS
): Partial<ReminderDeadline> {
  const out: Partial<ReminderDeadline> = {};
  if (item.stage !== undefined) {
    const passed = stages.filter((stage) => stage >= item.daysRemaining);
    out.reminder_sent_at = nowIso;
    out.reminder_stages_sent = [...new Set([...(d.reminder_stages_sent ?? []), ...passed])].sort(
      (a, b) => b - a
    );
  }
  if (item.vorfristReached) out.vorfrist_reminder_sent_at = nowIso;
  return out;
}

/**
 * Applies sent marks to a freshly read matter list. Entries are matched by id,
 * else by title and date, so edits made since the reminder run are kept.
 */
/**
 * Annotates each group whose responsible lawyer (the matter's
 * own_lawyer_name) is currently absent with the stand-in's details.
 * Reminders already reach every firm member — this makes visible WHO is
 * covering, so the delegate knows the item is theirs to act on.
 */
export function annotateDelegations(
  groups: ReminderGroup[],
  responsibleByCase: Map<string, string>,
  absences: AbsenceRecord[],
  now: Date
): void {
  for (const group of groups) {
    const caseResponsible = group.caseSlug ? responsibleByCase.get(group.caseSlug) : undefined;
    const caseDelegate = activeDelegateFor(caseResponsible, absences, now);
    if (caseResponsible && caseDelegate) {
      group.delegation = {
        responsible: caseResponsible,
        delegateName: caseDelegate.name,
        delegateEmail: caseDelegate.email,
        until: caseDelegate.until,
      };
    }
    // Per-item override: a deadline page carrying its own `responsible` /
    // `assignee` is annotated against that person, not the matter's lawyer —
    // in a multi-lawyer file the stand-in may differ per item.
    for (const item of group.items) {
      if (!item.responsible || item.responsible === caseResponsible) continue;
      const delegate = activeDelegateFor(item.responsible, absences, now);
      if (delegate) {
        item.delegation = {
          responsible: item.responsible,
          delegateName: delegate.name,
          delegateEmail: delegate.email,
          until: delegate.until,
        };
      }
    }
  }
}

export function markCaseDeadlines(
  current: ReminderDeadline[],
  items: DueReminder[],
  nowIso: string,
  stages: readonly number[] = REMINDER_STAGES_DAYS
): { deadlines: ReminderDeadline[]; changed: boolean } {
  let changed = false;
  const deadlines = current.map((d) => {
    const due = String(d.due_date ?? d.date ?? "").slice(0, 10);
    const item = items.find((i) => {
      if (i.ref.kind !== "case") return false;
      if (i.ref.id) return i.ref.id === d.id;
      return i.ref.dueDate === due && norm(i.ref.title) === norm(d.title);
    });
    if (!item) return d;
    changed = true;
    return { ...d, ...sentFields(d, item, nowIso, stages) };
  });
  return { deadlines, changed };
}
