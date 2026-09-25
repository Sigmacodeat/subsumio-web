/**
 * Deadline warnings for the topbar bell, derived from the unified Fristen read
 * model (GET /api/legal/fristen). The read model already drops cancelled
 * deadlines and rejected AI suggestions and only lists entries that carry a
 * due date — so a warning here never comes from a cancelled Frist or from the
 * record's creation date.
 */
import { zonedDateString } from "@/lib/datetime";

export interface TopbarFrist {
  id: string;
  title: string;
  due_date: string;
  status: string;
  case_slug?: string;
  case_title?: string;
}

export interface TopbarDeadlineWarning {
  /** Stable key per deadline (read-model id). */
  id: string;
  title: string;
  /** Matter the deadline belongs to — the link target. */
  caseSlug?: string;
  caseTitle: string;
  deadlineDate: string;
  daysRemaining: number;
  isOverdue: boolean;
}

/** Warn this many calendar days ahead (and for everything overdue). */
export const TOPBAR_WARNING_DAYS = 3;

/** Calendar days between two YYYY-MM-DD dates (firm-local, no UTC drift). */
function dayDiff(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function topbarDeadlineWarnings(
  fristen: readonly TopbarFrist[],
  today: string = zonedDateString(new Date())
): TopbarDeadlineWarning[] {
  const out: TopbarDeadlineWarning[] = [];
  for (const f of fristen) {
    if (f.status === "done") continue;
    if (!/^\d{4}-\d{2}-\d{2}/.test(f.due_date ?? "")) continue;
    const days = dayDiff(today, f.due_date);
    if (days > TOPBAR_WARNING_DAYS) continue;
    out.push({
      id: f.id,
      title: f.title,
      caseSlug: f.case_slug || undefined,
      caseTitle: f.case_title || f.title,
      deadlineDate: f.due_date.slice(0, 10),
      daysRemaining: days,
      isOverdue: days < 0,
    });
  }
  return out;
}
