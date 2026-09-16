// Time windows for the daily deadline control list (Fristenkontrolle).

export type TimeWindow = "all" | "today" | "7" | "14";

export interface WindowedDeadline {
  due_date: string;
  vorfrist_date?: string;
  status: string;
}

/** Whole days from today (UTC) until the date; negative when in the past. */
export function daysUntil(dateStr: string, now: Date = new Date()): number {
  const target = new Date(dateStr);
  const today = new Date(now);
  target.setUTCHours(0, 0, 0, 0);
  today.setUTCHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * A deadline belongs on the control list for a window when its main date or
 * its pre-deadline falls inside the window. Open overdue deadlines are always
 * included; completed deadlines only show up on their own due date range.
 */
export function inTimeWindow(
  deadline: WindowedDeadline,
  range: TimeWindow,
  now: Date = new Date()
): boolean {
  if (range === "all") return true;
  const horizon = range === "today" ? 0 : Number(range);
  const open = deadline.status !== "done";
  const due = daysUntil(deadline.due_date, now);
  if (open && due < 0) return true;
  if (due >= 0 && due <= horizon) return true;
  if (open && deadline.vorfrist_date) {
    const pre = daysUntil(deadline.vorfrist_date, now);
    if (pre >= 0 && pre <= horizon) return true;
  }
  return false;
}
