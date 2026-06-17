import type { DeadlineAuditEntry, DeadlineEntry, TimelineEntry } from "@/lib/legal-types";

export type DeadlineStatus = "pending" | "warning" | "critical" | "overdue" | "done";

export interface DeadlineRule {
  key: string;
  label: string;
  law: string;
  /** Kalendertage (Ereignisfrist: der Ereignistag zählt nicht mit, § 187 Abs. 1 BGB). */
  days?: number;
  /** Monatsfrist nach § 188 Abs. 2 BGB / § 222 ZPO (NICHT 30 Tage!). */
  months?: number;
  /** Jahresfrist nach § 188 Abs. 2 BGB. */
  years?: number;
  description: string;
}

// Prozessuale Fristen sind KALENDERfristen (§ 222 ZPO i.V.m. §§ 187 ff. BGB),
// keine Werktagsfristen. Monatsfristen enden mit Ablauf des Tages des letzten
// Monats, der dem Ereignistag entspricht (§ 188 Abs. 2 BGB) — nicht nach 30
// Tagen. Fällt das Fristende auf Samstag/Sonntag, verschiebt es sich auf den
// nächsten Werktag (§ 222 Abs. 2 ZPO / § 193 BGB). Gesetzliche Feiertage sind
// bundesland-/bundesabhängig und werden hier NICHT berechnet — manuell prüfen.
export const DEADLINE_RULES: DeadlineRule[] = [
  { key: "zpo-verteidigungsanzeige", label: "Verteidigungsanzeige", law: "§ 276 Abs. 1 S. 1 ZPO", days: 14, description: "Notfrist: 2 Wochen ab Zustellung der Klageschrift (schriftliches Vorverfahren)" },
  { key: "zpo-klageerwiderung", label: "Klageerwiderung", law: "§ 276 Abs. 1 S. 2 ZPO", days: 28, description: "2 Wochen Verteidigungsanzeige + mindestens 2 weitere Wochen; maßgeblich ist die gerichtlich gesetzte Frist" },
  { key: "zpo-einspruch-vu", label: "Einspruch gg. Versäumnisurteil", law: "§ 339 Abs. 1 ZPO", days: 14, description: "Notfrist: 2 Wochen ab Zustellung des Versäumnisurteils" },
  { key: "zpo-berufung", label: "Berufung", law: "§ 517 ZPO", months: 1, description: "Notfrist: 1 Monat ab Zustellung des Urteils (spätestens 5 Monate nach Verkündung)" },
  { key: "zpo-berufungsbegruendung", label: "Berufungsbegründung", law: "§ 520 Abs. 2 ZPO", months: 2, description: "2 Monate ab Zustellung des Urteils (verlängerbar)" },
  { key: "zpo-revision", label: "Revision", law: "§ 548 ZPO", months: 1, description: "Notfrist: 1 Monat ab Zustellung des Berufungsurteils" },
  { key: "zpo-beschwerde", label: "Sofortige Beschwerde", law: "§ 569 Abs. 1 ZPO", days: 14, description: "Notfrist: 2 Wochen ab Zustellung der Entscheidung" },
  { key: "stpo-revision-einlegung", label: "Revision (Straf) — Einlegung", law: "§ 341 Abs. 1 StPO", days: 7, description: "1 Woche ab Verkündung des Urteils (Begründung: 1 Monat ab Ablauf der Einlegungsfrist, § 345 StPO)" },
  { key: "zpo-vollziehung-ev", label: "Vollziehung einstw. Verfügung", law: "§§ 929 Abs. 2, 936 ZPO", months: 1, description: "Vollziehungsfrist: 1 Monat ab Verkündung/Zustellung an den Gläubiger" },
  { key: "vwgvg-beschwerde", label: "Bescheidbeschwerde (AT)", law: "§ 7 Abs. 4 VwGVG (AT)", days: 28, description: "4 Wochen ab Zustellung des Bescheids" },
  { key: "abgb-verjaehrung", label: "Verjährung Schadenersatz (AT)", law: "§ 1489 ABGB (AT)", years: 3, description: "3 Jahre ab Kenntnis von Schaden und Schädiger" },
];

/** Parse "YYYY-MM-DD" als UTC-Mittag — immun gegen Zeitzonen-/DST-Versatz. */
function parseISODate(dateStr: string): Date {
  return new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
}

function toISODateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Monatsfrist nach § 188 Abs. 2 BGB: Fristende ist der Tag des Zielmonats,
 * der dem Ereignistag durch seine Zahl entspricht. Fehlt dieser Tag (z. B.
 * 31.01. + 1 Monat), endet die Frist mit dem letzten Tag des Monats
 * (§ 188 Abs. 3 BGB).
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDayOfTarget), 12));
}

/** Hilfsfunktion für rein organisatorische (nicht-prozessuale) Werktagsfristen. */
export function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

export interface DueDateResult {
  /** Fristende als YYYY-MM-DD (nach Wochenend-Verschiebung). */
  dueDate: string;
  /** true, wenn das rechnerische Ende auf Sa/So fiel und verschoben wurde. */
  rolledForward: boolean;
  /** Menschlich lesbare Berechnungsnotiz inkl. Rechtsgrundlagen. */
  note: string;
}

/** Fristende nach §§ 187 ff. BGB / § 222 ZPO inkl. Wochenend-Verschiebung. */
export function computeDueDate(rule: DeadlineRule, startDate: string): DueDateResult {
  const start = parseISODate(startDate);
  let due: Date;
  let durationLabel: string;
  if (rule.years || rule.months) {
    const months = (rule.years ?? 0) * 12 + (rule.months ?? 0);
    due = addMonthsClamped(start, months);
    durationLabel = rule.years
      ? `${rule.years} Jahr${rule.years === 1 ? "" : "e"}`
      : `${rule.months} Monat${rule.months === 1 ? "" : "e"} (§ 188 Abs. 2 BGB)`;
  } else {
    due = addDays(start, rule.days ?? 0);
    durationLabel = `${rule.days ?? 0} Kalendertage`;
  }

  // § 222 Abs. 2 ZPO / § 193 BGB: Sa/So → nächster Werktag.
  let rolledForward = false;
  while (due.getUTCDay() === 0 || due.getUTCDay() === 6) {
    due = addDays(due, 1);
    rolledForward = true;
  }

  const note =
    `${durationLabel} ab ${startDate} (${rule.law})` +
    (rolledForward ? "; Fristende auf nächsten Werktag verschoben (§ 222 Abs. 2 ZPO)" : "") +
    ". Gesetzliche Feiertage manuell prüfen.";

  return { dueDate: toISODateString(due), rolledForward, note };
}

export function calculateDeadline(rule: DeadlineRule, startDate: string): DeadlineEntry {
  const { dueDate, note } = computeDueDate(rule, startDate);
  const now = new Date().toISOString();
  return {
    id: `dl-${Date.now()}`,
    title: rule.label,
    description: rule.description,
    date: dueDate,
    due_date: dueDate,
    type: "deadline",
    status: computeDeadlineStatus(dueDate),
    start_date: startDate,
    rule_key: rule.key,
    law: rule.law,
    calculation_note: note,
    review_status: "unreviewed",
    created_at: now,
    updated_at: now,
    audit_log: [{ at: now, action: "created", note: `Berechnet nach ${rule.law}` }],
  };
}

export function computeDeadlineStatus(dateStr: string, existingStatus?: string): DeadlineStatus {
  if (existingStatus === "done") return "done";
  // Normalize both to midnight UTC to avoid DST / timezone skew.
  const target = new Date(dateStr);
  target.setUTCHours(0, 0, 0, 0);
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return "overdue";
  if (days <= 3) return "critical";
  if (days <= 7) return "warning";
  return "pending";
}

export function timelineToDeadline(entry: TimelineEntry, source?: string): DeadlineEntry {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    date: entry.date,
    due_date: entry.date,
    type: entry.type === "event" ? "meeting" : entry.type,
    status: entry.status,
    source,
    review_status: "unreviewed",
  };
}

export function withDeadlineAudit(
  deadline: DeadlineEntry,
  action: DeadlineAuditEntry["action"],
  note?: string,
  actor = "kanzlei-os"
): DeadlineEntry {
  const now = new Date().toISOString();
  return {
    ...deadline,
    updated_at: now,
    audit_log: [
      ...(deadline.audit_log ?? []),
      { at: now, action, actor, note },
    ],
  };
}
