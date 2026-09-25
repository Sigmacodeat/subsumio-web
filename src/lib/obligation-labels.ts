/** German labels for the obligation extractor's raw values (never shown raw). */

const URGENCY: Record<string, string> = {
  low: "gering",
  medium: "mittel",
  high: "hoch",
  critical: "kritisch",
};

const TYPE: Record<string, string> = {
  payment: "Zahlung",
  notice: "Mitteilung",
  delivery: "Lieferung",
  performance: "Leistung",
  compliance: "Compliance",
  renewal: "Verlängerung",
  termination: "Kündigung",
  other: "Sonstiges",
};

const RECURRING: Record<string, string> = {
  "one-time": "einmalig",
  daily: "täglich",
  weekly: "wöchentlich",
  monthly: "monatlich",
  quarterly: "vierteljährlich",
  annually: "jährlich",
  yearly: "jährlich",
};

export const urgencyLabel = (v: string) => URGENCY[v] ?? v;
export const obligationTypeLabel = (v: string) => TYPE[v] ?? v;
export const recurringLabel = (v: string) => RECURRING[v] ?? v;

/**
 * "2026-10-12" → "12.10.2026". A pure date is formatted from its parts —
 * never parsed as UTC midnight, which can shift the day in Vienna. Anything
 * that is not an ISO date is returned unchanged.
 */
export function formatObligationDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value.trim());
  if (!m) return value;
  return `${m[3]}.${m[2]}.${m[1]}`;
}
