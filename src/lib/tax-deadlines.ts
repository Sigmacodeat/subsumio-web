/**
 * Tax deadline engine — calculates recurring tax deadlines for German tax advisors.
 * Analog zu legal-deadlines.ts, aber für Steuerfristen (AO, EStG, UStG).
 */

import type { TaxDeadlineEntry, TaxReturn, TaxAssessment, TaxAudit } from "@/lib/tax-types";
import type { BrainPage } from "@/lib/types";

// German federal holidays (same as legal-deadlines but kept independent for tax domain)
const GERMAN_HOLIDAYS_2025: Set<string> = new Set([
  "2025-01-01", // Neujahr
  "2025-04-18", // Karfreitag
  "2025-04-21", // Ostermontag
  "2025-05-01", // Tag der Arbeit
  "2025-05-29", // Christi Himmelfahrt
  "2025-06-09", // Pfingstmontag
  "2025-10-03", // Tag der Deutschen Einheit
  "2025-12-25", // 1. Weihnachtstag
  "2025-12-26", // 2. Weihnachtstag
]);

const GERMAN_HOLIDAYS_2026: Set<string> = new Set([
  "2026-01-01",
  "2026-04-03",
  "2026-04-06",
  "2026-05-01",
  "2026-05-14",
  "2026-05-25",
  "2026-06-05",
  "2026-10-03",
  "2026-12-25",
  "2026-12-26",
]);

function holidaysForYear(year: number): Set<string> {
  if (year === 2025) return GERMAN_HOLIDAYS_2025;
  if (year === 2026) return GERMAN_HOLIDAYS_2026;
  return new Set();
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isHoliday(date: Date, holidays: Set<string>): boolean {
  const iso = date.toISOString().split("T")[0];
  return holidays.has(iso);
}

/**
 * Shift a deadline to the next working day if it falls on a weekend or holiday.
 */
export function shiftToWorkingDay(date: Date): Date {
  const holidays = holidaysForYear(date.getFullYear());
  let result = new Date(date);
  while (isWeekend(result) || isHoliday(result, holidays)) {
    result = new Date(result.getTime() + 24 * 60 * 60 * 1000);
  }
  return result;
}

/**
 * Add days to a date, then shift to the next working day.
 */
export function addDaysAndShift(date: Date, days: number): Date {
  const result = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  return shiftToWorkingDay(result);
}

/**
 * Calculate the last day of a month.
 */
export function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/**
 * Monthly tax deadlines: UStVA, LStA due 10th of following month.
 * Quarterly: ZM due 25th of following month after quarter end.
 * Annual: ESt, USt, GewSt due 31st July (§ 149 AO).
 */

export interface RecurringDeadlineConfig {
  type: TaxDeadlineEntry["type"];
  recurring: "monthly" | "quarterly" | "annually" | "none";
  dayOfMonth: number;
  monthsOffset: number; // months after reference period
  label: string;
}

export const RECURRING_DEADLINES: RecurringDeadlineConfig[] = [
  {
    type: "UStVA",
    recurring: "monthly",
    dayOfMonth: 10,
    monthsOffset: 1,
    label: "Umsatzsteuer-Voranmeldung",
  },
  {
    type: "LStA",
    recurring: "monthly",
    dayOfMonth: 10,
    monthsOffset: 1,
    label: "Lohnsteuer-Anmeldung",
  },
  {
    type: "ZM",
    recurring: "quarterly",
    dayOfMonth: 25,
    monthsOffset: 1,
    label: "Zusammenfassende Meldung",
  },
  {
    type: "ESt",
    recurring: "annually",
    dayOfMonth: 31,
    monthsOffset: 7,
    label: "Einkommensteuer-Erklärung",
  },
  {
    type: "USt",
    recurring: "annually",
    dayOfMonth: 31,
    monthsOffset: 7,
    label: "Umsatzsteuer-Jahreserklärung",
  },
  {
    type: "GewSt",
    recurring: "annually",
    dayOfMonth: 31,
    monthsOffset: 7,
    label: "Gewerbesteuer-Erklärung",
  },
  {
    type: "KSt",
    recurring: "annually",
    dayOfMonth: 31,
    monthsOffset: 7,
    label: "Körperschaftsteuer-Erklärung",
  },
];

/**
 * Generate upcoming tax deadlines for the next N days.
 */
export function upcomingTaxDeadlines(
  fromDate: Date = new Date(),
  daysAhead: number = 90,
  clients: Array<{ id: string; name: string }> = []
): TaxDeadlineEntry[] {
  const entries: TaxDeadlineEntry[] = [];
  const now = fromDate;
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  for (const config of RECURRING_DEADLINES) {
    if (config.recurring === "monthly") {
      let refMonth = now.getMonth();
      const refYear = now.getFullYear();
      for (let i = 0; i < daysAhead / 30 + 2; i++) {
        const targetMonth = refMonth + config.monthsOffset;
        const targetYear = refYear + Math.floor(targetMonth / 12);
        const targetMonthAdjusted = ((targetMonth % 12) + 12) % 12;
        let dueDate = new Date(targetYear, targetMonthAdjusted, config.dayOfMonth);
        dueDate = shiftToWorkingDay(dueDate);
        if (dueDate >= now && dueDate <= future) {
          entries.push(makeEntry(config, dueDate, now, clients));
        }
        refMonth++;
      }
    } else if (config.recurring === "quarterly") {
      for (let q = 0; q < 4; q++) {
        const quarterEndMonth = q * 3 + 2;
        const targetMonth = quarterEndMonth + config.monthsOffset;
        const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
        const targetMonthAdjusted = ((targetMonth % 12) + 12) % 12;
        let dueDate = new Date(targetYear, targetMonthAdjusted, config.dayOfMonth);
        dueDate = shiftToWorkingDay(dueDate);
        if (dueDate >= now && dueDate <= future) {
          entries.push(makeEntry(config, dueDate, now, clients));
        }
      }
    } else if (config.recurring === "annually") {
      const refYear = now.getFullYear();
      let dueDate = new Date(refYear, config.monthsOffset, config.dayOfMonth);
      dueDate = shiftToWorkingDay(dueDate);
      if (dueDate >= now && dueDate <= future) {
        entries.push(makeEntry(config, dueDate, now, clients));
      }
      // Also check next year
      dueDate = new Date(refYear + 1, config.monthsOffset, config.dayOfMonth);
      dueDate = shiftToWorkingDay(dueDate);
      if (dueDate >= now && dueDate <= future) {
        entries.push(makeEntry(config, dueDate, now, clients));
      }
    }
  }

  return entries.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function makeEntry(
  config: RecurringDeadlineConfig,
  dueDate: Date,
  now: Date,
  clients: Array<{ id: string; name: string }>
): TaxDeadlineEntry {
  const dueIso = dueDate.toISOString().split("T")[0];
  const nowIso = now.toISOString().split("T")[0];
  const diffMs = dueDate.getTime() - new Date(nowIso).getTime();
  const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  return {
    id: `${config.type}-${dueIso}`,
    type: config.type,
    label: config.label,
    dueDate: dueIso,
    recurring: config.recurring,
    daysRemaining,
    isOverdue: daysRemaining < 0,
    isUrgent: daysRemaining >= 0 && daysRemaining <= 7,
    clientId: clients[0]?.id,
    clientName: clients[0]?.name,
  };
}

/**
 * AO § 109 Einspruchfrist: 1 Monat nach Zustellung des Bescheids.
 */
export function einspruchDeadline(zustellungsdatum: string): Date {
  const d = new Date(zustellungsdatum);
  d.setMonth(d.getMonth() + 1);
  return shiftToWorkingDay(d);
}

/**
 * AO § 110 Schadensersatzfrist: 1 Monat (analog Einspruch).
 */
export function schadensersatzDeadline(zustellungsdatum: string): Date {
  return einspruchDeadline(zustellungsdatum);
}

/**
 * AO § 477 Festsetzungsverjährung: 4 Jahre (10 Jahre bei Steuerhinterziehung).
 */
export function festsetzungsverjaehrung(jahr: number, hinterziehung: boolean = false): Date {
  const years = hinterziehung ? 10 : 4;
  return new Date(jahr + years, 11, 31);
}

/**
 * AO § 355 Abs. 1: Einspruchsbegründung — 1 Monat nach Einlegung des Einspruchs.
 */
export function einspruchsbegruendungDeadline(einspruchDatum: string): Date {
  const d = new Date(einspruchDatum);
  d.setMonth(d.getMonth() + 1);
  return shiftToWorkingDay(d);
}

/**
 * AO § 226 Abs. 3: Zahlungsfrist — 1 Monat nach Bekanntgabe des Vorauszahlungsbescheids.
 */
export function zahlungsfristDeadline(bekanntgabeDatum: string): Date {
  const d = new Date(bekanntgabeDatum);
  d.setMonth(d.getMonth() + 1);
  return shiftToWorkingDay(d);
}

/**
 * AO § 234 Abs. 1: Verspätungszuschlag — ab dem Tag nach Fristablauf.
 */
export function verspaetungszuschlagDatum(fristDatum: string): Date {
  const d = new Date(fristDatum);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * AO § 152 Abs. 2: Verspätungszuschlag bei verspäteter Erklärung.
 * Wird fällig, wenn die Erklärung nicht bis zum Ablauf der gesetzlichen Frist eingereicht wurde.
 */
export function verspaetungszuschlagErklaerung(fristDatum: string): Date {
  return verspaetungszuschlagDatum(fristDatum);
}

/**
 * AO § 153 Abs. 1: Berichtigungspflicht bei unrichtiger/unvollständiger Angabe.
 * Frist: unverzüglich nach Bekanntwerden (keine feste Frist, aber 1 Monat als Richtwert).
 */
export function berichtigungsfrist(bekanntwerdenDatum: string): Date {
  const d = new Date(bekanntwerdenDatum);
  d.setMonth(d.getMonth() + 1);
  return shiftToWorkingDay(d);
}

/**
 * AO § 367 Abs. 2: Außenprüfung — Festsetzungsfrist beträgt 4 Jahre ab Entstehung des Anspruchs.
 * Bei Steuerhinterziehung 10 Jahre, bei leichtfertiger Steuerverkürzung 5 Jahre.
 */
export function aussenpruefungVerjaehrung(
  jahr: number,
  type: "normal" | "hinterziehung" | "leichtfertig" = "normal"
): Date {
  const years = type === "hinterziehung" ? 10 : type === "leichtfertig" ? 5 : 4;
  return new Date(jahr + years, 11, 31);
}

/**
 * AO § 149 Abs. 3: Antragsverjährung für Steuererstattungen — 4 Jahre ab Entstehung des Anspruchs.
 */
export function antragsverjaehrung(jahr: number): Date {
  return new Date(jahr + 4, 11, 31);
}

/**
 * EStG § 56: Vorauszahlungstermine (vierteljährlich) — 10. März, 10. Juni, 10. September, 10. Dezember.
 */
export function vorauszahlungstermine(year: number): Array<{ quarter: number; dueDate: string }> {
  const months = [2, 5, 8, 11]; // March, June, September, December (0-indexed)
  return months.map((month, idx) => {
    let d = new Date(year, month, 10);
    d = shiftToWorkingDay(d);
    return {
      quarter: idx + 1,
      dueDate: d.toISOString().split("T")[0],
    };
  });
}

/**
 * AO § 168: elektronische Übermittlung — verlängerte Frist bei ELSTER (1 Monat länger als Papier).
 */
export function elsterFristverlaengerung(papierFrist: string): Date {
  const d = new Date(papierFrist);
  d.setMonth(d.getMonth() + 1);
  return shiftToWorkingDay(d);
}

/**
 * GewStG § 9: Gewerbesteuer-Vorauszahlungen — quartalsweise zum 15. des Monats nach Quartalsende.
 */
export function gewerbesteuerVorauszahlungen(
  year: number
): Array<{ quarter: number; dueDate: string }> {
  const quarterEndMonths = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec
  return quarterEndMonths.map((month, idx) => {
    let d = new Date(year, month + 1, 15); // 15th of next month
    d = shiftToWorkingDay(d);
    return {
      quarter: idx + 1,
      dueDate: d.toISOString().split("T")[0],
    };
  });
}

interface TaxDataForDeadlines {
  returns: TaxReturn[];
  assessments: TaxAssessment[];
  audits: TaxAudit[];
}

function makeClientEntry(
  config: {
    type: TaxDeadlineEntry["type"];
    label: string;
    recurring: TaxDeadlineEntry["recurring"];
  },
  dueDate: Date,
  now: Date,
  clientId?: string,
  clientName?: string,
  notes?: string
): TaxDeadlineEntry {
  const dueIso = dueDate.toISOString().split("T")[0];
  const nowIso = now.toISOString().split("T")[0];
  const diffMs = dueDate.getTime() - new Date(nowIso).getTime();
  const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return {
    id: `${config.type}-${clientId ?? "general"}-${dueIso}`,
    type: config.type,
    label: config.label,
    dueDate: dueIso,
    recurring: config.recurring,
    daysRemaining,
    isOverdue: daysRemaining < 0,
    isUrgent: daysRemaining >= 0 && daysRemaining <= 7,
    clientId,
    clientName,
    notes,
  };
}

function frontmatterString(page: BrainPage, key: string): string | undefined {
  const fm = page.frontmatter as Record<string, unknown> | undefined;
  const v = fm?.[key];
  return v === undefined ? undefined : String(v);
}

function frontmatterBool(page: BrainPage, key: string): boolean | undefined {
  const fm = page.frontmatter as Record<string, unknown> | undefined;
  const v = fm?.[key];
  if (v === undefined) return undefined;
  return v === true || v === "true" || v === "yes" || v === 1;
}

/**
 * Convert BrainPage arrays from the tax APIs into the typed TaxDataForDeadlines format.
 */
export function brainPagesToTaxData(pages: {
  returns?: BrainPage[];
  assessments?: BrainPage[];
  audits?: BrainPage[];
}): TaxDataForDeadlines {
  const returns: TaxReturn[] = (pages.returns ?? []).map((page) => ({
    id: page.slug,
    clientId: frontmatterString(page, "client_id") ?? "",
    clientName: frontmatterString(page, "client_name") ?? "",
    type: (frontmatterString(page, "tax_type") as TaxReturn["type"]) ?? "other",
    year: Number(frontmatterString(page, "year") ?? new Date().getFullYear()),
    status: (frontmatterString(page, "status") as TaxReturn["status"]) ?? "draft",
    dueDate: frontmatterString(page, "due_date"),
    submittedDate: frontmatterString(page, "submitted_date"),
    assessedDate: frontmatterString(page, "assessed_date"),
    taxAmount: Number(frontmatterString(page, "tax_amount") ?? 0) || undefined,
    refundAmount: Number(frontmatterString(page, "refund_amount") ?? 0) || undefined,
    notes: frontmatterString(page, "notes"),
    createdAt: page.created_at,
    updatedAt: page.updated_at,
  }));

  const assessments: TaxAssessment[] = (pages.assessments ?? []).map((page) => ({
    id: page.slug,
    clientId: frontmatterString(page, "client_id") ?? "",
    clientName: frontmatterString(page, "client_name") ?? "",
    type: (frontmatterString(page, "assessment_type") as TaxAssessment["type"]) ?? "Festsetzung",
    taxType: (frontmatterString(page, "tax_type") as TaxAssessment["taxType"]) ?? "other",
    year: Number(frontmatterString(page, "year") ?? new Date().getFullYear()),
    noticeNumber: frontmatterString(page, "notice_number"),
    noticeDate: frontmatterString(page, "notice_date") ?? page.created_at,
    dueDate: frontmatterString(page, "due_date"),
    amount: Number(frontmatterString(page, "amount") ?? 0),
    paidDate: frontmatterString(page, "paid_date"),
    contested: frontmatterBool(page, "contested") ?? false,
    contestDeadline: frontmatterString(page, "contest_deadline"),
    notes: frontmatterString(page, "notes"),
    createdAt: page.created_at,
    updatedAt: page.updated_at,
  }));

  const audits: TaxAudit[] = (pages.audits ?? []).map((page) => ({
    id: page.slug,
    clientId: frontmatterString(page, "client_id") ?? "",
    clientName: frontmatterString(page, "client_name") ?? "",
    type: (frontmatterString(page, "audit_type") as TaxAudit["type"]) ?? "Betriebspruefung",
    year: Number(frontmatterString(page, "year") ?? new Date().getFullYear()),
    phase: (frontmatterString(page, "phase") as TaxAudit["phase"]) ?? "vorbereitung",
    auditor: frontmatterString(page, "auditor"),
    startDate: frontmatterString(page, "start_date"),
    endDate: frontmatterString(page, "end_date"),
    totalAdditionalTax: Number(frontmatterString(page, "total_additional_tax") ?? 0) || undefined,
    notes: frontmatterString(page, "notes"),
    createdAt: page.created_at,
    updatedAt: page.updated_at,
  }));

  return { returns, assessments, audits };
}

/**
 * Generate client-specific deadlines from actual tax data.
 * Includes submission deadlines, Einspruchsfristen, Zahlungsfristen, and Verjährung.
 */
export function taxDeadlinesFromData(
  data: TaxDataForDeadlines,
  fromDate: Date = new Date(),
  daysAhead: number = 90
): TaxDeadlineEntry[] {
  const entries: TaxDeadlineEntry[] = [];
  const now = fromDate;
  const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  for (const r of data.returns) {
    if (r.dueDate) {
      let d = new Date(r.dueDate);
      d = shiftToWorkingDay(d);
      if (d >= now && d <= future) {
        entries.push(
          makeClientEntry(
            { type: r.type, label: `${r.type}-Erklärung ${r.year}`, recurring: "annually" },
            d,
            now,
            r.clientId,
            r.clientName,
            `Abgabe ${r.type} ${r.year}`
          )
        );
      }
    }
    if (r.submittedDate && r.assessedDate === undefined && r.status === "submitted") {
      // ELSTER extension: annual declarations via ELSTER get +1 month
      const d = elsterFristverlaengerung(r.dueDate ?? r.submittedDate);
      if (d >= now && d <= future) {
        entries.push(
          makeClientEntry(
            { type: r.type, label: `ELSTER-Abgabe ${r.type} ${r.year}`, recurring: "none" },
            d,
            now,
            r.clientId,
            r.clientName,
            "Verlängerte Frist bei ELSTER-Übermittlung (§ 168 AO)"
          )
        );
      }
    }
  }

  for (const a of data.assessments) {
    if (a.noticeDate) {
      const einspruch = einspruchDeadline(a.noticeDate);
      if (einspruch >= now && einspruch <= future) {
        entries.push(
          makeClientEntry(
            { type: "other", label: `Einspruchsfrist ${a.taxType} ${a.year}`, recurring: "none" },
            einspruch,
            now,
            a.clientId,
            a.clientName,
            `AO § 109 — 1 Monat nach Zustellung des Bescheids ${a.noticeNumber ?? ""}`
          )
        );
      }
      const zahlung = zahlungsfristDeadline(a.noticeDate);
      if (zahlung >= now && zahlung <= future) {
        entries.push(
          makeClientEntry(
            { type: "other", label: `Zahlungsfrist ${a.taxType} ${a.year}`, recurring: "none" },
            zahlung,
            now,
            a.clientId,
            a.clientName,
            `AO § 226 — 1 Monat nach Bekanntgabe des Vorauszahlungsbescheids`
          )
        );
      }
      if (a.contested && a.contestDeadline) {
        const begruendung = einspruchsbegruendungDeadline(a.contestDeadline);
        if (begruendung >= now && begruendung <= future) {
          entries.push(
            makeClientEntry(
              {
                type: "other",
                label: `Einspruchsbegründung ${a.taxType} ${a.year}`,
                recurring: "none",
              },
              begruendung,
              now,
              a.clientId,
              a.clientName,
              `AO § 355 Abs. 1 — 1 Monat nach Einlegung des Einspruchs`
            )
          );
        }
      }
      const verjaehrung = festsetzungsverjaehrung(new Date(a.noticeDate).getFullYear());
      if (verjaehrung >= now && verjaehrung <= future) {
        entries.push(
          makeClientEntry(
            {
              type: "other",
              label: `Festsetzungsverjährung ${a.taxType} ${a.year}`,
              recurring: "none",
            },
            verjaehrung,
            now,
            a.clientId,
            a.clientName,
            `AO § 477 — 4 Jahre nach Entstehung des Anspruchs`
          )
        );
      }
    }
  }

  for (const a of data.audits) {
    if (a.startDate) {
      const verjaehrung = aussenpruefungVerjaehrung(new Date(a.startDate).getFullYear());
      if (verjaehrung >= now && verjaehrung <= future) {
        entries.push(
          makeClientEntry(
            { type: "other", label: `Außenprüfungsverjährung ${a.year}`, recurring: "none" },
            verjaehrung,
            now,
            a.clientId,
            a.clientName,
            `AO § 367 — Festsetzungsfrist nach Außenprüfung`
          )
        );
      }
    }
  }

  return entries.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
