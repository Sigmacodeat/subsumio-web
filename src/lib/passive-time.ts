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

/**
 * Groups activities into time suggestion blocks.
 * Activities within 15 minutes of each other for the same case are merged.
 */
export function generateTimeSuggestions(
  activities: ActivityEvent[],
  userEmail: string
): TimeSuggestion[] {
  const sorted = [...activities]
    .filter((a) => a.user_email === userEmail)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const groups: ActivityEvent[][] = [];
  let currentGroup: ActivityEvent[] = [];
  let lastEnd: Date | null = null;

  for (const activity of sorted) {
    const start = new Date(activity.started_at);
    if (lastEnd && start.getTime() - lastEnd.getTime() > 15 * 60 * 1000) {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [];
    }
    currentGroup.push(activity);
    const end = new Date(activity.ended_at);
    if (!lastEnd || end > lastEnd) lastEnd = end;
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  return groups.map((group) => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    const start = new Date(first.started_at);
    const end = new Date(last.ended_at);
    const durationMinutes = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));

    const primaryType = group.reduce<Record<ActivityType, number>>(
      (acc, a) => {
        acc[a.type] = (acc[a.type] ?? 0) + 1;
        return acc;
      },
      {} as Record<ActivityType, number>
    );

    const dominantType = Object.entries(primaryType).sort(
      ([, a], [, b]) => b - a
    )[0]?.[0] as ActivityType;

    const descriptions = group.map((a) => a.description).filter(Boolean);
    const description =
      descriptions.length === 1
        ? descriptions[0]!
        : `${descriptions.length} Aktivitäten: ${descriptions.slice(0, 3).join(", ")}${descriptions.length > 3 ? "..." : ""}`;

    const date = start.toISOString().split("T")[0] ?? "";
    const startTime = start.toTimeString().slice(0, 5);
    const endTime = end.toTimeString().slice(0, 5);

    return {
      id: `ts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_email: userEmail,
      case_slug: first.case_slug,
      date,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      description,
      activity_type: dominantType,
      activity_ids: group.map((a) => a.id),
      rvg_area: getRvgAreaForActivity(dominantType),
      status: "suggested",
      confidence: group.length > 3 ? "high" : group.length > 1 ? "medium" : "low",
      created_at: new Date().toISOString(),
    };
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}
