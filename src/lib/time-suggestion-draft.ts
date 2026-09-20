import type { TimeSuggestion } from "@/lib/passive-time";

/** What the lawyer books: the suggestion as proposed, or as corrected before booking. */
export interface TimeDraft {
  case_slug: string;
  minutes: string;
  description: string;
  billable: boolean;
}

export function draftFrom(s: TimeSuggestion): TimeDraft {
  return {
    case_slug: s.case_slug ?? "",
    minutes: String(s.duration_minutes),
    description: s.description,
    billable: true,
  };
}

/** Validation message for a draft, or null when it can be booked. */
export function draftError(d: TimeDraft): string | null {
  if (!d.case_slug) return "Bitte eine Akte wählen.";
  const minutes = Number(d.minutes);
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 24 * 60)
    return "Dauer in ganzen Minuten (1–1440).";
  if (!d.description.trim()) return "Bitte eine Tätigkeitsbeschreibung eingeben.";
  if (d.description.trim().length > 500) return "Beschreibung höchstens 500 Zeichen.";
  return null;
}
