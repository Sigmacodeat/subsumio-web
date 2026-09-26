/**
 * Builds the deadline agenda on the Übersicht: overdue items first, then every
 * deadline and Vorfrist in the look-ahead window, grouped by calendar day.
 *
 * Pure and clock-injectable so the grouping (which is what a lawyer relies on
 * when reading "Heute" / "Morgen") is unit-tested without a browser.
 */
import { daysUntil, parseDateValue } from "@/lib/utils";

export interface AgendaSourcePage {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

export interface AgendaCaseRef {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

export type AgendaKind = "deadline" | "vorfrist" | "hearing";

export interface AgendaEntry {
  key: string;
  slug: string;
  kind: AgendaKind;
  title: string;
  date: Date;
  days: number;
  time: string | null;
  notfrist: boolean;
  unreviewed: boolean;
  caseSlug: string | null;
  caseNumber: string | null;
  caseTitle: string | null;
  /**
   * A calendar appointment (hearing, meeting) — never a deadline: it is not
   * overdue once it has passed and is not counted as a Frist.
   */
  appointment?: boolean;
}

export interface AgendaDay {
  /** YYYY-MM-DD in local time */
  iso: string;
  date: Date;
  days: number;
  entries: AgendaEntry[];
}

export interface Agenda {
  overdue: AgendaEntry[];
  days: AgendaDay[];
  /** Entries in the window (not counting overdue). */
  upcomingCount: number;
  /** First entry after the window, when the window itself is empty. */
  nextAfterWindow: AgendaEntry | null;
  /** The next few entries after the window ("Danach"), so a quiet fortnight never hides what follows. */
  later: AgendaEntry[];
  /** Every open entry from today on, sorted — e.g. for "next deadline per matter". */
  upcoming: AgendaEntry[];
}

const DONE_STATUSES = new Set([
  "done",
  "completed",
  "erledigt",
  "cancelled",
  "canceled",
  "archived",
  "closed",
  "dismissed",
]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function localIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const HEARING_RE = /tagsatzung|verhandlung|termin|anhörung|einvernahme|besprechung/i;
const TIME_RE = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:uhr)?\b/i;

export function buildAgenda(
  deadlines: AgendaSourcePage[],
  cases: AgendaCaseRef[],
  opts: { now?: Date; windowDays?: number; laterLimit?: number } = {}
): Agenda {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 14;
  const caseBySlug = new Map(cases.map((c) => [c.slug, c]));

  const entries: AgendaEntry[] = [];
  for (const page of deadlines) {
    const fm = page.frontmatter ?? {};
    const status = String(fm.status ?? "").toLowerCase();
    if (DONE_STATUSES.has(status)) continue;
    const title = str(page.title) ?? str(fm.title) ?? str(fm.description) ?? "Frist";
    const caseSlug = str(fm.case_slug);
    const c = caseSlug ? caseBySlug.get(caseSlug) : undefined;
    const caseNumber = c ? str(c.frontmatter?.case_number) : null;
    const caseTitle = c ? (str(c.title) ?? null) : null;
    const notfrist = fm.is_notfrist === true || /notfrist/i.test(title);
    const unreviewed = String(fm.review_status ?? "") === "unreviewed";
    const isAppointment = fm.source_kind === "appointment";
    const eventType = String(fm.event_type ?? "").toLowerCase();
    const kind: AgendaKind =
      isAppointment ||
      eventType === "hearing" ||
      eventType === "appointment" ||
      HEARING_RE.test(title)
        ? "hearing"
        : "deadline";
    const time = str(fm.time) ?? title.match(TIME_RE)?.[0]?.replace(/\s*uhr/i, "") ?? null;

    const due = parseDateValue(str(fm.due_date) ?? str(fm.date));
    if (isAppointment) {
      // A past appointment is over, not overdue.
      const days = due ? (daysUntil(due, now) ?? 0) : -1;
      if (due && days >= 0) {
        entries.push({
          key: `${page.slug}#appointment`,
          slug: page.slug,
          kind: "hearing",
          title,
          date: due,
          days,
          time: str(fm.time),
          notfrist: false,
          unreviewed: false,
          caseSlug,
          caseNumber,
          caseTitle,
          appointment: true,
        });
      }
      continue;
    }
    if (due) {
      entries.push({
        key: `${page.slug}#due`,
        slug: page.slug,
        kind,
        title,
        date: due,
        days: daysUntil(due, now) ?? 0,
        time,
        notfrist,
        unreviewed,
        caseSlug,
        caseNumber,
        caseTitle,
      });
    }
    const vorfrist = parseDateValue(str(fm.vorfrist_date));
    if (vorfrist && (!due || vorfrist.getTime() < due.getTime())) {
      const days = daysUntil(vorfrist, now) ?? 0;
      // A Vorfrist that has passed is not a task of its own — the main deadline is.
      if (days >= 0) {
        entries.push({
          key: `${page.slug}#vorfrist`,
          slug: page.slug,
          kind: "vorfrist",
          title,
          date: vorfrist,
          days,
          time: null,
          notfrist,
          unreviewed,
          caseSlug,
          caseNumber,
          caseTitle,
        });
      }
    }
  }

  const rank = (e: AgendaEntry) => (e.kind === "hearing" ? 0 : e.kind === "deadline" ? 1 : 2);
  entries.sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      rank(a) - rank(b) ||
      (a.time ?? "99").localeCompare(b.time ?? "99") ||
      a.title.localeCompare(b.title, "de")
  );

  const overdue = entries.filter((e) => e.days < 0 && e.kind !== "vorfrist");
  const inWindow = entries.filter((e) => e.days >= 0 && e.days <= windowDays);
  const byDay = new Map<string, AgendaDay>();
  for (const e of inWindow) {
    const iso = localIso(e.date);
    let day = byDay.get(iso);
    if (!day) {
      day = { iso, date: e.date, days: e.days, entries: [] };
      byDay.set(iso, day);
    }
    day.entries.push(e);
  }

  const after = entries.filter((e) => e.days > windowDays && e.kind !== "vorfrist");
  return {
    overdue,
    days: [...byDay.values()],
    upcomingCount: inWindow.length,
    nextAfterWindow: inWindow.length === 0 ? (after[0] ?? null) : null,
    later: after.slice(0, Math.max(0, (opts.laterLimit ?? 5) - Math.min(inWindow.length, 5))),
    upcoming: entries.filter((e) => e.days >= 0),
  };
}

/** A row of the unified Fristen read model (GET /api/legal/fristen). */
export interface AgendaFristLike {
  id: string;
  title: string;
  due_date: string;
  status: string;
  type?: string;
  case_slug?: string;
  vorfrist_date?: string;
  is_notfrist?: boolean;
  review_status?: string;
}

/**
 * Maps the Fristen read model onto agenda source pages, so "Mein Tag" shows
 * the same deadlines as the Fristen view — including deadlines embedded in a
 * matter (`deadlines[]`) and the Fristenbuch calendar, not just the most
 * recently edited `legal_deadline` pages. The row id keeps entry keys unique
 * when one matter holds several deadlines.
 */
export function fristenToAgendaPages(fristen: AgendaFristLike[]): AgendaSourcePage[] {
  return fristen.map((f) => ({
    slug: f.id,
    title: f.title,
    frontmatter: {
      due_date: f.due_date,
      vorfrist_date: f.vorfrist_date,
      status: f.status,
      is_notfrist: f.is_notfrist === true,
      review_status: f.review_status,
      case_slug: f.case_slug,
      event_type: f.type === "hearing" || f.type === "event" ? "hearing" : f.type,
    },
  }));
}

/** Day heading: "Heute", "Morgen", else "Mittwoch, 23.09.". */
export function agendaDayLabel(day: { date: Date; days: number }): string {
  if (day.days === 0) return "Heute";
  if (day.days === 1) return "Morgen";
  return new Intl.DateTimeFormat("de-AT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(day.date);
}

/** An appointment page (`appointment`, Kanzleikalender) as the agenda reads it. */
export interface AgendaAppointmentPageLike {
  slug: string;
  title?: string;
  frontmatter?: Record<string, unknown>;
}

/** An Outlook appointment of the signed-in user (already de-duplicated). */
export interface AgendaOutlookItemLike {
  id: string;
  title: string;
  date: string;
  time?: string;
}

/**
 * Calendar appointments (hearings, meetings) for the Übersicht agenda: the
 * firm's own appointments plus the user's Outlook appointments. Cancelled
 * ones are left out; they are marked so the agenda never treats them as a
 * deadline.
 */
export function appointmentsToAgendaPages(
  appointments: AgendaAppointmentPageLike[],
  outlook: AgendaOutlookItemLike[] = []
): AgendaSourcePage[] {
  const out: AgendaSourcePage[] = [];
  for (const p of appointments) {
    const fm = p.frontmatter ?? {};
    const status = String(fm.status ?? "").toLowerCase();
    if (status === "cancelled" || status === "canceled" || status === "tombstoned") continue;
    const date = str(fm.date);
    if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    out.push({
      slug: p.slug,
      title: str(fm.title) ?? str(p.title) ?? "Termin",
      frontmatter: {
        source_kind: "appointment",
        date,
        time: str(fm.time) ?? undefined,
        case_slug: str(fm.case_slug) ?? undefined,
      },
    });
  }
  for (const o of outlook) {
    out.push({
      slug: o.id,
      title: o.title,
      frontmatter: { source_kind: "appointment", date: o.date, time: o.time },
    });
  }
  return out;
}
