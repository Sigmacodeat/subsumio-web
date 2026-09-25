/**
 * When is an appointment reminder due? Pure scheduling for
 * /api/cron/appointment-reminders.
 *
 * Every appointment gets a reminder, not only those created via WhatsApp
 * (which store an explicit `reminder_at`): calendar-created appointments
 * store `reminder_minutes` (editor field "Erinnerung"), and anything without
 * either falls back to 24 h before the start. Hearings (Verhandlungen) also
 * get an early reminder 7 days ahead.
 *
 * `date` + `time` are firm-local wall time (Europe/Vienna) and are resolved
 * in that zone — the server runs in UTC.
 */
import { FIRM_TIMEZONE, zonedWallTimeToUtc } from "@/lib/datetime";

export const DEFAULT_REMINDER_MINUTES = 24 * 60;
export const HEARING_EARLY_REMINDER_MINUTES = 7 * 24 * 60;
const DEFAULT_START_TIME = "09:00";

export type ReminderStage = "main" | "early";

export interface DueReminder {
  stage: ReminderStage;
  /** Start of the appointment (UTC instant). */
  start: Date;
  /** Identifies the appointment time the reminder was sent for. */
  sentFor: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Start instant of an appointment, or null when it has no usable date. */
export function appointmentStart(
  fm: Record<string, unknown>,
  timeZone: string = FIRM_TIMEZONE
): Date | null {
  const date = str(fm.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rawTime = str(fm.time).slice(0, 5);
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : DEFAULT_START_TIME;
  const start = zonedWallTimeToUtc(date, time, timeZone);
  return Number.isNaN(start.getTime()) ? null : start;
}

function isHearing(fm: Record<string, unknown>): boolean {
  return fm.appointment_type === "hearing" || fm.type === "hearing";
}

/**
 * Reminders due at `now` for one appointment page's frontmatter. A stage is
 * due once its time has come and the appointment has not started yet; a
 * stage already sent for the current date/time is not repeated, but moving
 * the appointment re-arms it.
 */
export function dueAppointmentReminders(
  fm: Record<string, unknown>,
  now: Date,
  timeZone: string = FIRM_TIMEZONE
): DueReminder[] {
  const status = str(fm.status);
  if (["cancelled", "completed", "tombstoned", "storniert"].includes(status)) return [];
  const start = appointmentStart(fm, timeZone);
  if (!start || start.getTime() <= now.getTime()) return [];
  const sentFor = `${str(fm.date).slice(0, 10)}T${str(fm.time).slice(0, 5)}`;

  // reminder_minutes: 0 = the user switched reminders off.
  const explicitMinutes =
    typeof fm.reminder_minutes === "number" && Number.isFinite(fm.reminder_minutes)
      ? fm.reminder_minutes
      : null;
  if (explicitMinutes === 0) return [];

  let mainAt: Date;
  if (explicitMinutes !== null) {
    mainAt = new Date(start.getTime() - explicitMinutes * 60_000);
  } else {
    const legacy = str(fm.reminder_at) ? new Date(str(fm.reminder_at)) : null;
    mainAt =
      legacy && !Number.isNaN(legacy.getTime())
        ? legacy
        : new Date(start.getTime() - DEFAULT_REMINDER_MINUTES * 60_000);
  }

  // Sent for this very date/time? (Legacy pages carry only the flag.)
  const mainSent =
    fm.reminder_sent === true &&
    (typeof fm.reminder_sent_for !== "string" || fm.reminder_sent_for === sentFor);
  const earlySent = str(fm.reminder_early_sent_for) === sentFor;

  const due: DueReminder[] = [];
  if (!mainSent && now.getTime() >= mainAt.getTime()) {
    due.push({ stage: "main", start, sentFor });
  }
  if (isHearing(fm) && !earlySent) {
    const earlyAt = new Date(start.getTime() - HEARING_EARLY_REMINDER_MINUTES * 60_000);
    // Only while it is still "early" — within the main window the main
    // reminder is the one that goes out.
    if (now.getTime() >= earlyAt.getTime() && now.getTime() < mainAt.getTime()) {
      due.push({ stage: "early", start, sentFor });
    }
  }
  return due;
}

/** Frontmatter recording that `stage` went out for `sentFor`. */
export function reminderSentFields(
  stage: ReminderStage,
  sentFor: string,
  now: Date
): Record<string, unknown> {
  return stage === "main"
    ? { reminder_sent: true, reminder_sent_at: now.toISOString(), reminder_sent_for: sentFor }
    : { reminder_early_sent_at: now.toISOString(), reminder_early_sent_for: sentFor };
}
