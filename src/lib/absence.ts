/**
 * Urlaubsvertretung (Vacation Delegation)
 * ========================================
 * Manages attorney absences and their delegates.
 * When a lawyer is absent:
 * - Fristen (deadlines) are forwarded to the delegate
 * - Rundown items are reassigned
 * - New intake items are auto-routed to the delegate
 */

export interface AbsenceRecord {
  id: string;
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
  const now = date ?? new Date();
  const start = new Date(absence.start_date);
  const end = new Date(absence.end_date);
  return now >= start && now <= end && absence.status !== "cancelled";
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

export interface DeadlineForwardResult {
  deadlineId: string;
  originalAssignee: string;
  newAssignee: string;
  forwardedAt: string;
  caseSlug?: string;
  dueDate?: string;
}

export function forwardDeadlines(
  absence: AbsenceRecord,
  deadlines: Array<{ id: string; assignee: string; case_slug?: string; due_date?: string }>
): DeadlineForwardResult[] {
  const now = new Date().toISOString();
  return deadlines
    .filter((d) => d.assignee === absence.user_email)
    .map((d) => ({
      deadlineId: d.id,
      originalAssignee: d.assignee,
      newAssignee: absence.delegate_email,
      forwardedAt: now,
      caseSlug: d.case_slug,
      dueDate: d.due_date,
    }));
}

export interface RundownReassignResult {
  jobId: string;
  originalAssignee: string;
  newAssignee: string;
  reassignedAt: string;
  jobTitle?: string;
}

export function reassignRundownItems(
  absence: AbsenceRecord,
  jobs: Array<{ id: string; assignee: string; title?: string }>
): RundownReassignResult[] {
  const now = new Date().toISOString();
  return jobs
    .filter((j) => j.assignee === absence.user_email)
    .map((j) => ({
      jobId: j.id,
      originalAssignee: j.assignee,
      newAssignee: absence.delegate_email,
      reassignedAt: now,
      jobTitle: j.title,
    }));
}

export function getActiveDelegate(userEmail: string, absences: AbsenceRecord[]): string | null {
  const active = absences.find((a) => a.user_email === userEmail && isAbsenceActive(a));
  return active?.delegate_email ?? null;
}

export function getUpcomingAbsences(userEmail: string, absences: AbsenceRecord[]): AbsenceRecord[] {
  const now = new Date();
  return absences.filter(
    (a) => a.user_email === userEmail && a.status === "planned" && new Date(a.start_date) > now
  );
}

export function getAbsenceStatusBadge(absence: AbsenceRecord): {
  label: string;
  className: string;
} {
  const styles: Record<AbsenceRecord["status"], { label: string; className: string }> = {
    planned: { label: "Geplant", className: "border-blue-500/20 bg-blue-500/10 text-blue-600" },
    active: { label: "Aktiv", className: "border-orange-500/20 bg-orange-500/10 text-orange-600" },
    completed: {
      label: "Abgeschlossen",
      className: "border-slate-500/20 bg-slate-500/10 text-slate-600",
    },
    cancelled: { label: "Storniert", className: "border-red-500/20 bg-red-500/10 text-red-600" },
  };
  return styles[absence.status];
}
