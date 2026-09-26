/**
 * Erinnerungsrhythmus für Unterlagen-Anforderungen — die Entscheidung, die
 * der tägliche Cron (src/app/api/cron/document-request-reminders/route.ts)
 * je Anforderung trifft: frühestens 7 Tage nach Versand bzw. nach der letzten
 * Erinnerung, höchstens 3 Erinnerungen, nur solange Unterlagen offen sind.
 */

export const REMINDER_INTERVAL_DAYS = 7;
export const MAX_REMINDERS = 3;

const DAY_MS = 1000 * 60 * 60 * 24;

export interface ReminderInput {
  status?: unknown;
  sent_at?: string;
  reminder_sent_at?: string;
  reminder_count?: number;
  items?: Array<{ received_document_slug?: string }>;
}

export type ReminderReason =
  | "ok"
  | "not_pending"
  | "no_sent_at"
  | "max_reminders_reached"
  | "too_soon_after_last_reminder"
  | "too_soon_after_sent"
  | "no_open_items";

export interface ReminderDecision {
  shouldRemind: boolean;
  reason: ReminderReason;
  /** Whole days since the request was sent (0 without a send date). */
  daysSinceSent: number;
  /** Items still missing. */
  openItemCount: number;
}

export function reminderDecision(input: ReminderInput, now: Date): ReminderDecision {
  const openItemCount = (input.items ?? []).filter((i) => !i.received_document_slug).length;
  const no = (reason: ReminderReason, daysSinceSent = 0): ReminderDecision => ({
    shouldRemind: false,
    reason,
    daysSinceSent,
    openItemCount,
  });
  if (input.status !== "sent" && input.status !== "partially_fulfilled") return no("not_pending");
  if (!input.sent_at) return no("no_sent_at");
  const daysSinceSent = Math.floor((now.getTime() - new Date(input.sent_at).getTime()) / DAY_MS);
  if ((input.reminder_count ?? 0) >= MAX_REMINDERS) {
    return no("max_reminders_reached", daysSinceSent);
  }
  if (input.reminder_sent_at) {
    const daysSinceReminder = Math.floor(
      (now.getTime() - new Date(input.reminder_sent_at).getTime()) / DAY_MS
    );
    if (daysSinceReminder < REMINDER_INTERVAL_DAYS) {
      return no("too_soon_after_last_reminder", daysSinceSent);
    }
  } else if (daysSinceSent < REMINDER_INTERVAL_DAYS) {
    return no("too_soon_after_sent", daysSinceSent);
  }
  if (openItemCount === 0) return no("no_open_items", daysSinceSent);
  return { shouldRemind: true, reason: "ok", daysSinceSent, openItemCount };
}
