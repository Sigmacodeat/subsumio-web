/**
 * Mobile time tracking: the same entry the desktop books (POST /api/time —
 * matter slug, minutes, billable), the firm's local date, and a timer that
 * counts wall-clock time so an app in the background loses nothing.
 */
import { zonedDateString } from "@/lib/datetime";

/** Wall-clock timer: running time is derived from timestamps, not ticks. */
export interface TimerState {
  /** Time accumulated in finished running phases (ms). */
  accumulatedMs: number;
  /** Start of the current running phase (epoch ms), null when paused/stopped. */
  runningSince: number | null;
}

export const IDLE_TIMER: TimerState = { accumulatedMs: 0, runningSince: null };

export function startTimer(state: TimerState, now: number): TimerState {
  return state.runningSince !== null ? state : { ...state, runningSince: now };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.runningSince === null) return state;
  return {
    accumulatedMs: state.accumulatedMs + Math.max(0, now - state.runningSince),
    runningSince: null,
  };
}

export function timerElapsedSeconds(state: TimerState, now: number): number {
  const running = state.runningSince !== null ? Math.max(0, now - state.runningSince) : 0;
  return Math.floor((state.accumulatedMs + running) / 1000);
}

/** Body of POST /api/time — identical to the desktop quick entry. */
export interface TimeEntryBody {
  case_slug: string;
  description: string;
  minutes: number;
  date: string;
  billable: boolean;
  activity_type: "other";
}

export function buildMobileTimeEntry(input: {
  caseSlug: string;
  description: string;
  durationSecs: number;
  /** When the work was done (timer start or now); booked on the firm's local date. */
  at: Date;
  billable: boolean;
}): { ok: true; body: TimeEntryBody } | { ok: false; error: string } {
  const caseSlug = input.caseSlug.trim();
  if (!caseSlug) return { ok: false, error: "Bitte eine Akte wählen." };
  if (!(input.durationSecs > 0)) return { ok: false, error: "Keine Dauer erfasst." };
  const minutes = Math.max(1, Math.round(input.durationSecs / 60));
  if (minutes > 24 * 60) return { ok: false, error: "Mehr als 24 Stunden je Eintrag." };
  return {
    ok: true,
    body: {
      case_slug: caseSlug,
      description: input.description.trim() || "Zeiteintrag",
      minutes,
      date: zonedDateString(input.at),
      billable: input.billable,
      activity_type: "other",
    },
  };
}
