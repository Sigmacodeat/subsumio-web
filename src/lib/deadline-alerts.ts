/**
 * Live deadline alerts — the signal that appears in the open dashboard and
 * goes out as a `deadline.critical` webhook.
 *
 * Distinct from the reminders in `deadline-reminders.ts`: those write e-mail,
 * WhatsApp and push once per stage. An alert is the short, repeated-safe
 * signal on the screen.
 *
 * Two faults this module exists to prevent, both found on 2026-09-20:
 *  - the job read the "system" brain and found no firm's deadlines at all;
 *  - it had no memory, so every 30-minute run resent the same alert.
 * Each stage therefore fires exactly once per deadline and is recorded in the
 * deadline's own frontmatter.
 */

export type AlertUrgency = "urgent" | "warning" | "normal";

/** Hours before the deadline at which each stage fires. */
export const ALERT_STAGES: Array<{ urgency: AlertUrgency; hours: number }> = [
  { urgency: "urgent", hours: 24 },
  { urgency: "warning", hours: 72 },
  { urgency: "normal", hours: 168 },
];

export interface AlertDeadline {
  id?: string;
  title?: string;
  description?: string;
  due_date?: string;
  date?: string;
  status?: string;
  case_slug?: string;
  /** Stages already signalled — the dedup memory. */
  alert_stages_sent?: AlertUrgency[];
  alert_sent_at?: string;
}

export interface AlertPage {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

export type AlertRef =
  | { kind: "page"; slug: string }
  | { kind: "case"; caseSlug: string; id?: string; title?: string; dueDate: string };

export interface DueAlert {
  ref: AlertRef;
  caseSlug?: string;
  title: string;
  dueDate: string;
  urgency: AlertUrgency;
  /** Hours left, negative when overdue. */
  hoursRemaining: number;
}

const CLOSED = new Set(["completed", "done", "erledigt", "cancelled", "tombstoned"]);

export function isClosedAlertDeadline(d: AlertDeadline): boolean {
  return CLOSED.has(String(d.status ?? "").toLowerCase());
}

export function hoursUntil(dateStr: string, now: Date): number {
  const due = new Date(dateStr.length === 10 ? `${dateStr}T23:59:59` : dateStr);
  if (Number.isNaN(due.getTime())) return Number.NaN;
  return (due.getTime() - now.getTime()) / 3_600_000;
}

/**
 * The stage due now, or undefined. An overdue deadline stays "urgent" — a
 * missed deadline is the one a lawyer most needs on screen.
 */
export function alertStageFor(hoursRemaining: number): AlertUrgency | undefined {
  if (Number.isNaN(hoursRemaining)) return undefined;
  for (const stage of ALERT_STAGES) {
    if (hoursRemaining <= stage.hours) return stage.urgency;
  }
  return undefined;
}

/** Stages at or below the one reached — recorded together, so a deadline first
 *  seen one day out never sends the seven-day alert the next run. */
export function stagesPassed(urgency: AlertUrgency): AlertUrgency[] {
  const index = ALERT_STAGES.findIndex((s) => s.urgency === urgency);
  return ALERT_STAGES.slice(index).map((s) => s.urgency);
}

function due(d: AlertDeadline): string {
  return String(d.due_date ?? d.date ?? "").slice(0, 19);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function pending(d: AlertDeadline, ref: AlertRef, title: string, now: Date): DueAlert | undefined {
  if (isClosedAlertDeadline(d)) return undefined;
  const dueAt = due(d);
  if (!dueAt) return undefined;
  const hoursRemaining = hoursUntil(dueAt, now);
  const urgency = alertStageFor(hoursRemaining);
  if (!urgency) return undefined;
  if ((d.alert_stages_sent ?? []).includes(urgency)) return undefined;
  return {
    ref,
    caseSlug: str(d.case_slug) ?? (ref.kind === "case" ? ref.caseSlug : undefined),
    title,
    dueDate: dueAt.slice(0, 10),
    urgency,
    hoursRemaining,
  };
}

/**
 * Deadlines that need an alert now: standalone deadline pages plus the ones
 * inside a matter. A deadline present in both places is counted once, and
 * deadlines of an archived matter are left out.
 */
export function collectDueAlerts(
  cases: AlertPage[],
  deadlinePages: AlertPage[],
  now: Date
): DueAlert[] {
  const out: DueAlert[] = [];
  const caseBySlug = new Map(cases.map((c) => [c.slug, c]));
  const archived = (slug?: string) =>
    slug ? caseBySlug.get(slug)?.frontmatter?.status === "archived" : false;
  const seen = new Set<string>();

  for (const page of deadlinePages) {
    const fm = (page.frontmatter ?? {}) as AlertDeadline;
    const caseSlug = str(fm.case_slug);
    if (archived(caseSlug)) continue;
    const title = page.title ?? fm.title ?? fm.description ?? "Frist";
    seen.add(`${caseSlug ?? ""}|${due(fm).slice(0, 10)}|${title.toLowerCase().trim()}`);
    const item = pending(fm, { kind: "page", slug: page.slug }, title, now);
    if (item) out.push(item);
  }

  for (const c of cases) {
    if (c.frontmatter?.status === "archived") continue;
    const list = Array.isArray(c.frontmatter?.deadlines)
      ? (c.frontmatter.deadlines as AlertDeadline[])
      : [];
    for (const d of list) {
      const title = d.title ?? d.description ?? "Frist";
      const key = `${c.slug}|${due(d).slice(0, 10)}|${title.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = pending(
        d,
        { kind: "case", caseSlug: c.slug, id: d.id, title: d.title, dueDate: due(d).slice(0, 10) },
        title,
        now
      );
      if (item) out.push(item);
    }
  }

  return out;
}

/** The frontmatter fields that record a sent alert. */
export function alertSentFields(
  d: AlertDeadline,
  urgency: AlertUrgency,
  nowIso: string
): Partial<AlertDeadline> {
  const merged = new Set<AlertUrgency>([...(d.alert_stages_sent ?? []), ...stagesPassed(urgency)]);
  return {
    alert_sent_at: nowIso,
    alert_stages_sent: ALERT_STAGES.map((s) => s.urgency).filter((u) => merged.has(u)),
  };
}

/** Apply the sent marks to a matter's deadline list, leaving everything else alone. */
export function markCaseAlerts(
  deadlines: AlertDeadline[],
  items: DueAlert[],
  nowIso: string
): { deadlines: AlertDeadline[]; changed: boolean } {
  let changed = false;
  const next = deadlines.map((d) => {
    const match = items.find(
      (item) =>
        item.ref.kind === "case" &&
        (item.ref.id !== undefined ? item.ref.id === d.id : item.title === (d.title ?? "Frist")) &&
        item.ref.dueDate === due(d).slice(0, 10)
    );
    if (!match) return d;
    changed = true;
    return { ...d, ...alertSentFields(d, match.urgency, nowIso) };
  });
  return { deadlines: next, changed };
}
