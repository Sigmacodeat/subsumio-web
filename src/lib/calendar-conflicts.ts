/**
 * Terminkollisionen im Kanzleikalender.
 *
 * Reine Funktionen ohne Seiteneffekte: erkennen (a) Termine, die sich zeitlich
 * überschneiden, und (b) Fristen, die auf einen Verhandlungstag fallen. Datumswerte
 * sind Kalendertage im Format `YYYY-MM-DD` (Ortszeit), Uhrzeiten `HH:MM`.
 */

export type CalendarEntryKind = "deadline" | "appointment";

export interface CalendarEntry {
  id: string;
  title: string;
  /** Kalendertag `YYYY-MM-DD`. */
  date: string;
  /** Beginn `HH:MM`; ohne Uhrzeit gilt der Eintrag als ganztägig. */
  time?: string;
  /** Dauer in Minuten (Standard: 60). */
  durationMin?: number;
  kind: CalendarEntryKind;
  /** Termin ist eine Verhandlung / Tagsatzung. */
  isHearing?: boolean;
  /** Erledigte Fristen und abgesagte Termine lösen keine Kollision aus. */
  done?: boolean;
}

export type CalendarConflictKind = "overlap" | "deadline_on_hearing_day";

export interface CalendarConflict {
  kind: CalendarConflictKind;
  date: string;
  /** Bei `deadline_on_hearing_day`: die Frist. Bei `overlap`: der früher beginnende Termin. */
  a: CalendarEntry;
  /** Bei `deadline_on_hearing_day`: die Verhandlung. Bei `overlap`: der zweite Termin. */
  b: CalendarEntry;
}

const DEFAULT_DURATION_MIN = 60;

/** `YYYY-MM-DD` eines Datums in Ortszeit (nicht UTC — `toISOString` verschiebt den Tag). */
export function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Minuten seit Mitternacht für `HH:MM`, sonst `null`. */
export function parseTimeToMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** `HH:MM` aus Minuten seit Mitternacht (über Mitternacht hinaus wird abgeschnitten). */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function normTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Derselbe Termin aus zwei Quellen (z. B. Kanzleikalender und Outlook-Spiegelung)
 * ist keine Kollision: gleicher Titel, gleicher Tag, gleiche Uhrzeit.
 */
function isSameEvent(a: CalendarEntry, b: CalendarEntry): boolean {
  return (
    a.date === b.date &&
    (a.time ?? "") === (b.time ?? "") &&
    normTitle(a.title) === normTitle(b.title)
  );
}

/** Alle Kollisionen, sortiert nach Datum. Jedes Paar erscheint genau einmal. */
export function findCalendarConflicts(
  entries: CalendarEntry[],
  opts: { defaultDurationMin?: number } = {}
): CalendarConflict[] {
  const defaultDuration = opts.defaultDurationMin ?? DEFAULT_DURATION_MIN;
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (e.done || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  const conflicts: CalendarConflict[] = [];
  for (const [date, list] of byDate) {
    const appointments = list.filter((e) => e.kind === "appointment");
    const deadlines = list.filter((e) => e.kind === "deadline");

    // (a) Zeitliche Überschneidung zweier Termine mit Uhrzeit.
    const timed = appointments
      .map((e) => ({ e, start: parseTimeToMinutes(e.time) }))
      .filter((x): x is { e: CalendarEntry; start: number } => x.start !== null)
      .sort((x, y) => x.start - y.start);
    for (let i = 0; i < timed.length; i++) {
      const endI = timed[i].start + (timed[i].e.durationMin ?? defaultDuration);
      for (let j = i + 1; j < timed.length; j++) {
        if (timed[j].start >= endI) break;
        if (isSameEvent(timed[i].e, timed[j].e)) continue;
        conflicts.push({ kind: "overlap", date, a: timed[i].e, b: timed[j].e });
      }
    }

    // (b) Frist fällt auf einen Verhandlungstag.
    const hearings = appointments.filter((e) => e.isHearing);
    for (const d of deadlines) {
      for (const h of hearings) {
        conflicts.push({ kind: "deadline_on_hearing_day", date, a: d, b: h });
      }
    }
  }

  return conflicts.sort((x, y) => x.date.localeCompare(y.date));
}

/** Kollisionen, die einen bestimmten (noch nicht gespeicherten) Eintrag betreffen. */
export function conflictsForEntry(
  draft: CalendarEntry,
  existing: CalendarEntry[],
  opts: { defaultDurationMin?: number } = {}
): CalendarConflict[] {
  const others = existing.filter((e) => e.id !== draft.id);
  return findCalendarConflicts([...others, draft], opts).filter(
    (c) => c.a.id === draft.id || c.b.id === draft.id
  );
}

/** Sentence for the conflict notice — shared by the calendar and the Handbuch. */
export function describeCalendarConflict(c: CalendarConflict): string {
  if (c.kind === "deadline_on_hearing_day") {
    return `Frist „${c.a.title}“ endet am Verhandlungstag „${c.b.title}“${c.b.time ? ` (${c.b.time} Uhr)` : ""}.`;
  }
  const endA = (parseTimeToMinutes(c.a.time) ?? 0) + (c.a.durationMin ?? 60);
  return `„${c.a.title}“ (${c.a.time}–${minutesToTime(endA)} Uhr) überschneidet sich mit „${c.b.title}“ (ab ${c.b.time} Uhr).`;
}
