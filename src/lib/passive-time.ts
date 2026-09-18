/**
 * Passive Time Tracking (Passive Zeiterfassung)
 * ================================================
 * Collects user activity events and suggests time entries.
 * Activities are tracked passively (document edits, emails sent, calls, meetings)
 * and grouped into time suggestion blocks.
 */

export type ActivityType =
  | "document_edit"
  | "document_view"
  | "email_sent"
  | "email_received"
  | "call"
  | "meeting"
  | "research"
  | "drafting"
  | "review"
  | "chat"
  | "portal_message"
  | "bea_message";

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  user_email: string;
  case_slug?: string;
  description: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  metadata?: Record<string, unknown>;
}

export interface TimeSuggestion {
  id: string;
  user_email: string;
  case_slug?: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  description: string;
  activity_type: ActivityType;
  activity_ids: string[];
  rvg_area?: string;
  status: "suggested" | "accepted" | "rejected" | "modified";
  confidence: "high" | "medium" | "low";
  created_at: string;
}

const ACTIVITY_TYPE_LABELS: Record<ActivityType, { de: string; rvgArea?: string }> = {
  document_edit: { de: "Dokument bearbeitet", rvgArea: "Schreiben" },
  document_view: { de: "Dokument angesehen" },
  email_sent: { de: "E-Mail gesendet", rvgArea: "Korrespondenz" },
  email_received: { de: "E-Mail empfangen" },
  call: { de: "Telefonat", rvgArea: "Beratung" },
  meeting: { de: "Termin/Besprechung", rvgArea: "Beratung" },
  research: { de: "Recherche", rvgArea: "Recherche" },
  drafting: { de: "Entwurf erstellt", rvgArea: "Schreiben" },
  review: { de: "Prüfung/Review", rvgArea: "Prüfung" },
  chat: { de: "Chat/Anfrage" },
  portal_message: { de: "Portal-Nachricht", rvgArea: "Korrespondenz" },
  bea_message: { de: "beA-Nachricht", rvgArea: "Korrespondenz" },
};

export function getActivityLabel(type: ActivityType): string {
  return ACTIVITY_TYPE_LABELS[type]?.de ?? type;
}

export function getRvgAreaForActivity(type: ActivityType): string | undefined {
  return ACTIVITY_TYPE_LABELS[type]?.rvgArea;
}

export function createActivityEvent(input: {
  type: ActivityType;
  user_email: string;
  case_slug?: string;
  description: string;
  started_at: string;
  ended_at?: string;
  metadata?: Record<string, unknown>;
}): ActivityEvent {
  const start = new Date(input.started_at);
  const end = input.ended_at ? new Date(input.ended_at) : new Date();
  const duration = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));

  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    user_email: input.user_email,
    case_slug: input.case_slug,
    description: input.description,
    started_at: input.started_at,
    ended_at: input.ended_at ?? end.toISOString(),
    duration_seconds: duration,
    metadata: input.metadata,
  };
}

const VIENNA = "Europe/Vienna";
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIENNA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("de-AT", {
  timeZone: VIENNA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Minutes are billed in started tenths of an hour. */
export const BILLING_UNIT_MINUTES = 6;

/**
 * Groups activities into time suggestion blocks.
 *
 * Activities of the same matter that are no more than 15 minutes apart form
 * one block; different matters never share a block (each becomes its own time
 * entry). Dates and clock times are Austrian local time. The id comes from the
 * block's first activity, so running the job twice updates the same
 * suggestion instead of creating a copy.
 */
export function generateTimeSuggestions(
  activities: ActivityEvent[],
  userEmail: string
): TimeSuggestion[] {
  const byCase = new Map<string, ActivityEvent[]>();
  for (const a of activities) {
    if (a.user_email !== userEmail) continue;
    const key = a.case_slug ?? "";
    const list = byCase.get(key) ?? [];
    list.push(a);
    byCase.set(key, list);
  }

  const groups: ActivityEvent[][] = [];
  for (const list of byCase.values()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    let current: ActivityEvent[] = [];
    let lastEnd: Date | null = null;
    for (const activity of sorted) {
      const start = new Date(activity.started_at);
      if (lastEnd && start.getTime() - lastEnd.getTime() > 15 * 60 * 1000) {
        groups.push(current);
        current = [];
        lastEnd = null;
      }
      current.push(activity);
      const end = new Date(activity.ended_at);
      if (!lastEnd || end > lastEnd) lastEnd = end;
    }
    if (current.length > 0) groups.push(current);
  }

  return groups
    .map((group) => {
      const first = group[0]!;
      const start = new Date(first.started_at);
      const end = new Date(Math.max(...group.map((a) => new Date(a.ended_at).getTime())));
      const rawMinutes = Math.max(1, (end.getTime() - start.getTime()) / 60000);
      const durationMinutes = Math.ceil(rawMinutes / BILLING_UNIT_MINUTES) * BILLING_UNIT_MINUTES;

      const counts = new Map<ActivityType, number>();
      for (const a of group) counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
      const dominantType = [...counts.entries()].sort(([, a], [, b]) => b - a)[0]![0];

      const descriptions = [...new Set(group.map((a) => a.description).filter(Boolean))];
      const description =
        descriptions.length === 1
          ? descriptions[0]!
          : `${descriptions.length} Tätigkeiten: ${descriptions.slice(0, 3).join(", ")}${descriptions.length > 3 ? " …" : ""}`;

      return {
        id: `ts-${first.id}`,
        user_email: userEmail,
        case_slug: first.case_slug,
        date: dateFmt.format(start),
        start_time: timeFmt.format(start),
        end_time: timeFmt.format(end),
        duration_minutes: durationMinutes,
        description,
        activity_type: dominantType,
        activity_ids: group.map((a) => a.id),
        rvg_area: getRvgAreaForActivity(dominantType),
        status: "suggested" as const,
        confidence: (group.length > 3 ? "high" : group.length > 1 ? "medium" : "low") as
          | "high"
          | "medium"
          | "low",
        created_at: new Date().toISOString(),
      };
    })
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
