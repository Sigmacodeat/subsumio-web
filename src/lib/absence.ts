import type { DashboardKey } from "@/content/dashboard";
import { zonedDateString } from "@/lib/datetime";

/**
 * Urlaubsvertretung (Vacation Delegation)
 * ========================================
 * Manages attorney absences and their delegates.
 * Deadlines carry the matter's responsible lawyer, not an assignee of their
 * own — so nothing is "moved". Instead:
 * - `activeDelegateFor` annotates Fristen/reminders with the stand-in
 * - `deadlineSlugsCoveredByAbsence` records what the delegate covers in
 *   `forwarded_deadlines` when the absence is activated
 * - `auto_route_enabled === false` disables the stand-in annotation
 */

/** Art der Abwesenheit — entscheidet u. a., ob sie das Urlaubskonto belastet. */
export const ABSENCE_KINDS = ["urlaub", "krankheit", "fortbildung", "sonstiges"] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];

export interface AbsenceRecord {
  id: string;
  /** Pflicht bei neuen Einträgen; ältere Einträge haben nur `reason`. */
  kind?: AbsenceKind;
  user_email: string;
  user_name: string;
  delegate_email: string;
  delegate_name: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status: "planned" | "active" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  /** Rundown items to reassign */
  reassigned_rundown_items: string[];
  /** Deadline IDs that were forwarded */
  forwarded_deadlines: string[];
  /** Whether auto-routing of new items is enabled */
  auto_route_enabled: boolean;
  notes?: string;
}

export interface AbsenceCreateInput {
  user_email: string;
  user_name: string;
  delegate_email: string;
  delegate_name: string;
  start_date: string;
  end_date: string;
  kind?: AbsenceKind;
  reason?: string;
  auto_route_enabled?: boolean;
  notes?: string;
}

export function createAbsence(input: AbsenceCreateInput): AbsenceRecord {
  const now = new Date().toISOString();
  return {
    id: `absence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_email: input.user_email,
    user_name: input.user_name,
    delegate_email: input.delegate_email,
    delegate_name: input.delegate_name,
    start_date: input.start_date,
    end_date: input.end_date,
    ...(input.kind ? { kind: input.kind } : {}),
    reason: input.reason,
    status: "planned",
    created_at: now,
    updated_at: now,
    reassigned_rundown_items: [],
    forwarded_deadlines: [],
    auto_route_enabled: input.auto_route_enabled ?? true,
    notes: input.notes,
  };
}

export function isAbsenceActive(absence: AbsenceRecord, date?: Date): boolean {
  // Inclusive day comparison on the firm calendar: `end_date` is a calendar
  // day, and the last day counts (the UI states this explicitly). The old
  // `new Date(end_date)` comparison resolved to midnight UTC, so the whole
  // final day read as inactive — delegates stopped seeing the Vertretung on
  // the absence's last day.
  const day = zonedDateString(date ?? new Date());
  const start = absence.start_date.slice(0, 10);
  const end = absence.end_date.slice(0, 10);
  return day >= start && day <= end && absence.status !== "cancelled";
}

/**
 * What the absences page shows. The stored status is not advanced by date, so
 * the period decides between planned / active / completed — except that an
 * explicit completion (early return) or cancellation always wins: the
 * deadline lists stop naming the stand-in at that moment, and the page must
 * not keep saying "läuft gerade". Calendar days on the firm calendar
 * (Europe/Vienna), last day inclusive.
 */
export function absenceDisplayStatus(absence: AbsenceRecord, now?: Date): AbsenceRecord["status"] {
  if (absence.status === "cancelled" || absence.status === "completed") return absence.status;
  const day = zonedDateString(now ?? new Date());
  const start = absence.start_date.slice(0, 10);
  const end = absence.end_date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return absence.status;
  }
  if (day > end) return "completed";
  if (day >= start) return "active";
  return "planned";
}

/** Whether the absence period has begun (firm calendar day). */
export function absenceHasStarted(absence: AbsenceRecord, now?: Date): boolean {
  return zonedDateString(now ?? new Date()) >= absence.start_date.slice(0, 10);
}

export function activateAbsence(absence: AbsenceRecord): AbsenceRecord {
  return {
    ...absence,
    status: "active",
    updated_at: new Date().toISOString(),
  };
}

export function completeAbsence(absence: AbsenceRecord): AbsenceRecord {
  return {
    ...absence,
    status: "completed",
    updated_at: new Date().toISOString(),
  };
}

export function cancelAbsence(absence: AbsenceRecord): AbsenceRecord {
  return {
    ...absence,
    status: "cancelled",
    updated_at: new Date().toISOString(),
  };
}

const ABSENCE_CLOSED_STATUS =
  /^(done|erledigt|completed|abgeschlossen|cancelled|storniert|tombstoned)$/i;

/**
 * Slugs of open reminders whose matter's responsible lawyer is the absent
 * person and whose due date falls inside the absence window — i.e. the
 * items the delegate is covering. Filled into `forwarded_deadlines` when an
 * absence is activated so the record states honestly what is covered.
 * Accepts both `legal_deadline` (due_date) and `legal_follow_up` (date)
 * shapes via the shared `due_date` field name.
 */
export function deadlineSlugsCoveredByAbsence(
  absence: AbsenceRecord,
  deadlines: Array<{
    slug: string;
    case_slug?: string;
    due_date?: string;
    status?: string;
    review_status?: string;
    completed?: boolean;
  }>,
  responsibleByCase: Map<string, string>
): string[] {
  const emailNeedle = absence.user_email.trim().toLowerCase();
  const nameNeedle = absence.user_name.trim().toLowerCase();
  const start = absence.start_date.slice(0, 10);
  const end = absence.end_date.slice(0, 10);
  return deadlines
    .filter((d) => {
      if (!d.case_slug || !d.due_date) return false;
      if (d.completed) return false;
      if (ABSENCE_CLOSED_STATUS.test(d.status ?? "") || d.review_status === "rejected") {
        return false;
      }
      const lawyer = responsibleByCase.get(d.case_slug)?.trim().toLowerCase();
      if (!lawyer || (lawyer !== emailNeedle && lawyer !== nameNeedle)) return false;
      const due = d.due_date.slice(0, 10);
      return due >= start && due <= end;
    })
    .map((d) => d.slug);
}

/**
 * Who currently stands in for a person, matched by e-mail or by name.
 *
 * Deadlines carry the responsible lawyer of the matter, not an assignee of
 * their own, so nothing can be "moved" to a delegate. The lists instead show
 * who is standing in while the responsible lawyer is away — which is what a
 * firm needs to see on the deadline itself.
 */
export function activeDelegateFor(
  person: string | undefined,
  absences: AbsenceRecord[],
  now?: Date
): { name: string; email: string; until: string } | null {
  if (!person) return null;
  const needle = person.trim().toLowerCase();
  if (!needle) return null;
  const match = absences.find(
    (a) =>
      isAbsenceActive(a, now) &&
      a.status !== "completed" &&
      // auto_route_enabled === false means: record the absence but do not
      // annotate/route anything to the delegate.
      a.auto_route_enabled !== false &&
      (a.user_email.toLowerCase() === needle || a.user_name.trim().toLowerCase() === needle)
  );
  if (!match) return null;
  return { name: match.delegate_name, email: match.delegate_email, until: match.end_date };
}

export function getAbsenceStatusBadge(absence: AbsenceRecord): {
  labelKey: DashboardKey;
  className: string;
} {
  const styles: Record<AbsenceRecord["status"], { labelKey: DashboardKey; className: string }> = {
    planned: {
      labelKey: "absence.status_planned",
      className: "border-blue-500/20 bg-blue-500/10 text-blue-600",
    },
    active: {
      labelKey: "absence.status_active",
      className:
        "border-[color:var(--ds-attention-border)] bg-[color:var(--ds-attention-bg)] text-[color:var(--ds-attention-text)]",
    },
    completed: {
      labelKey: "absence.status_completed",
      className:
        "border-[color:var(--ds-neutral-border)] bg-[color:var(--ds-neutral-bg)] text-[color:var(--ds-neutral-text)]",
    },
    cancelled: {
      labelKey: "absence.status_cancelled",
      className: "border-red-500/20 bg-red-500/10 text-red-600",
    },
  };
  return styles[absence.status];
}
