import type { BrainPage } from "@/lib/types";

/**
 * Deadline rows for the widget dashboard / cockpit views, built from the
 * Fristen read model (GET /api/legal/fristen) — the same source as the Fristen
 * view and "Mein Tag": Fristenbuch, deadline pages and deadlines embedded in
 * matters, fully paged, with the central closed/discarded status set applied.
 */

export interface CockpitFristLike {
  id: string;
  title: string;
  due_date: string;
  status: string;
  type?: string;
  case_slug?: string;
  source_slug?: string;
  review_status?: string;
  is_notfrist?: boolean;
  vorfrist_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CockpitDeadlineItem {
  page: BrainPage & { frontmatter?: Record<string, unknown> };
  due: Date;
  daysLeft: number;
  overdue: boolean;
  critical: boolean;
}

function calendarDaysUntil(due: Date, now: Date): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(due);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/** Open deadlines from the read model as cockpit rows, soonest first. */
export function deadlineItemsFromFristen(
  fristen: CockpitFristLike[],
  now: Date = new Date()
): CockpitDeadlineItem[] {
  return fristen
    .filter((f) => f.status !== "done")
    .map((f) => {
      const due = new Date(`${f.due_date.slice(0, 10)}T00:00:00`);
      if (Number.isNaN(due.getTime())) return null;
      const item: CockpitDeadlineItem = {
        page: {
          slug: f.source_slug ?? f.id,
          title: f.title,
          content: "",
          type: "legal_deadline",
          created_at: f.created_at ?? "",
          updated_at: f.updated_at ?? "",
          frontmatter: {
            due_date: f.due_date,
            status: f.status,
            case_slug: f.case_slug,
            review_status: f.review_status,
            is_notfrist: f.is_notfrist === true,
            vorfrist_date: f.vorfrist_date,
          },
        },
        due,
        daysLeft: calendarDaysUntil(due, now),
        // The read model already classified the deadline (firm calendar day).
        overdue: f.status === "overdue",
        critical: f.status === "critical",
      };
      return item;
    })
    .filter((item): item is CockpitDeadlineItem => item !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

type PeriodItem = {
  due?: Date;
  created_at?: string;
  frontmatter?: Record<string, unknown>;
  overdue?: boolean;
};

/**
 * Period filter ("today" / "week") for cockpit lists. An overdue open
 * deadline is always relevant — a filter must never hide a missed Frist,
 * however long ago it fell due.
 */
export function isInPeriod(
  item: PeriodItem,
  period: "today" | "week",
  now: Date = new Date()
): boolean {
  if (item.overdue === true) return true;
  const windowMs = period === "today" ? 86_400_000 : 7 * 86_400_000;
  const raw = item.frontmatter?.due_date ?? item.frontmatter?.date ?? item.created_at ?? item.due;
  const time = raw ? new Date(raw instanceof Date ? raw : String(raw)).getTime() : NaN;
  return Number.isFinite(time) && Math.abs(time - now.getTime()) <= windowMs;
}
