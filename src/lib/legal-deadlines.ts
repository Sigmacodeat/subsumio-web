import type { DeadlineAuditEntry, DeadlineEntry, TimelineEntry } from "@/lib/legal-types";

export type DeadlineStatus = "pending" | "warning" | "critical" | "overdue" | "done";

// ── Feiertags-Kalkulator (DE + AT + CH) ──────────────────────────────────
//
// Bundesland-Codes (ISO 3166-2:DE): BB BE BW BY HB HE HH MV NI NW RP SH SL SN ST TH
// Österreich: AT
// Schweizer Kantone (ISO 3166-2:CH): ZH BE LU UR SZ OW NW GL ZG FR SO BS BL SH AR AI SG GR AG TG TI VD VS NE GE JU
// Basis: § 222 Abs. 2 ZPO / § 193 BGB (DE/AT) bzw. Art. 66 ZPO (CH) — Fristende
// verschiebt sich auf nächsten Werktag, wenn es auf Samstag, Sonntag ODER einen
// gesetzlichen Feiertag fällt. Bundesland-/kantons-spezifische Feiertage nach
// jeweiligem Feiertagsgesetz (Stand 2025).

export type Bundesland =
  | "BB"
  | "BE"
  | "BW"
  | "BY"
  | "HB"
  | "HE"
  | "HH"
  | "MV"
  | "NI"
  | "NW"
  | "RP"
  | "SH"
  | "SL"
  | "SN"
  | "ST"
  | "TH"
  | "AT";

/**
 * Schweizer Kantone (ISO 3166-2:CH). Alle 26 Kantone werden unterstützt.
 * Bundesfeiertag (1. August) ist bundesweit; kantonale Feiertage variieren.
 * Quelle: Bundesgesetz über die Arbeit in Industrie, Gewerbe und Handel (ArG),
 * kantonale Feiertagsgesetze (Stand 2025).
 */
export type Canton =
  | "ZH"
  | "BE"
  | "LU"
  | "UR"
  | "SZ"
  | "OW"
  | "NW"
  | "GL"
  | "ZG"
  | "FR"
  | "SO"
  | "BS"
  | "BL"
  | "SH"
  | "AR"
  | "AI"
  | "SG"
  | "GR"
  | "AG"
  | "TG"
  | "TI"
  | "VD"
  | "VS"
  | "NE"
  | "GE"
  | "JU";

/** Ostersonntag nach gaussscher Osterformel. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function offsetDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const holidayCache = new Map<string, Map<string, string>>();

/**
 * Gibt die Menge der gesetzlichen Feiertage eines Jahres für ein Bundesland zurück.
 * Keys sind ISO-Datumstrings (YYYY-MM-DD), Values sind Feiertagsnamen.
 */
export function publicHolidays(
  year: number,
  state: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): Map<string, string> {
  const cacheKey = `${year}:${state}:${country ?? ""}`;
  const cached = holidayCache.get(cacheKey);
  if (cached) return cached;
  const h = new Map<string, string>();
  const add = (d: Date, name: string) => h.set(isoDate(d), name);
  const fixed = (m: number, day: number, name: string) =>
    add(new Date(Date.UTC(year, m - 1, day, 12)), name);

  // Determine if this is a Swiss canton. Explicit country param wins.
  // Without it, use heuristic: code in swissCantons AND NOT in Bundesland
  // (resolves ambiguity for BE, NW, SH in favor of DE backward compat).
  const swissCantons = new Set<string>([
    "ZH",
    "LU",
    "UR",
    "SZ",
    "OW",
    "NW",
    "GL",
    "ZG",
    "FR",
    "SO",
    "BS",
    "BL",
    "SH",
    "AR",
    "AI",
    "SG",
    "GR",
    "AG",
    "TG",
    "TI",
    "VD",
    "VS",
    "NE",
    "GE",
    "JU",
  ]);
  const bundeslaender = new Set<string>([
    "BB",
    "BE",
    "BW",
    "BY",
    "HB",
    "HE",
    "HH",
    "MV",
    "NI",
    "NW",
    "RP",
    "SH",
    "SL",
    "SN",
    "ST",
    "TH",
    "AT",
  ]);
  const isSwiss =
    country === "CH" || (!country && swissCantons.has(state) && !bundeslaender.has(state));
  if (isSwiss) {
    return swissHolidays(year, state as Canton, h, add, fixed, easterSunday(year));
  }

  // Bundesweit DE + AT
  fixed(1, 1, "Neujahr");
  fixed(12, 25, "1. Weihnachtstag");
  fixed(12, 26, "2. Weihnachtstag");

  const easter = easterSunday(year);
  add(offsetDays(easter, -2), "Karfreitag");
  add(offsetDays(easter, 1), "Ostermontag");
  add(offsetDays(easter, 39), "Christi Himmelfahrt");
  add(offsetDays(easter, 50), "Pfingstmontag");

  if (state === "AT") {
    // Österreich
    fixed(1, 6, "Heilige Drei Könige");
    fixed(5, 1, "Staatsfeiertag");
    fixed(8, 15, "Mariä Himmelfahrt");
    fixed(10, 26, "Nationalfeiertag");
    fixed(11, 1, "Allerheiligen");
    fixed(12, 8, "Mariä Empfängnis");
    add(offsetDays(easter, 60), "Fronleichnam");
    holidayCache.set(cacheKey, h);
    return h;
  }

  // Deutschland — alle Bundesländer
  fixed(5, 1, "Tag der Arbeit");
  fixed(10, 3, "Tag der Deutschen Einheit");

  // Heilige Drei Könige: BW BY ST
  if (["BW", "BY", "ST"].includes(state)) fixed(1, 6, "Heilige Drei Könige");

  // Frauentag: BE MV
  if (["BE", "MV"].includes(state)) fixed(3, 8, "Internationaler Frauentag");

  // Karfreitag in AT: oben; in DE bundesweit schon gesetzt.

  // Fronleichnam: BW BY HE NW RP SL SN TH (teilw. nur kath. Gemeinden, rechtlich überall wo gesetzl. Ft)
  if (["BW", "BY", "HE", "NW", "RP", "SL", "SN", "TH"].includes(state)) {
    add(offsetDays(easter, 60), "Fronleichnam");
  }

  // Mariä Himmelfahrt: BY SL
  if (["BY", "SL"].includes(state)) fixed(8, 15, "Mariä Himmelfahrt");

  // Weltkindertag: TH
  if (state === "TH") fixed(9, 20, "Weltkindertag");

  // Reformationstag: BB HB HH MV NI SH SN ST TH
  if (["BB", "HB", "HH", "MV", "NI", "SH", "SN", "ST", "TH"].includes(state)) {
    fixed(10, 31, "Reformationstag");
  }

  // Allerheiligen: BW BY NW RP SL
  if (["BW", "BY", "NW", "RP", "SL"].includes(state)) fixed(11, 1, "Allerheiligen");

  // Buß- und Bettag: SN
  if (state === "SN") {
    // Mittwoch vor dem 23. November
    const nov23 = new Date(Date.UTC(year, 10, 23, 12));
    const dow = nov23.getUTCDay();
    const daysToWed = dow >= 3 ? dow - 3 : dow + 4;
    add(offsetDays(nov23, -daysToWed), "Buß- und Bettag");
  }

  holidayCache.set(cacheKey, h);
  return h;
}

/**
 * Schweizer Feiertage — bundesweit + kantonal.
 *
 * Bundesweit (ArG Art. 20a Abs. 1): Neujahr, Berchtoldstag, Karfreitag,
 * Ostermontag, Auffahrt, Pfingstmontag, Bundesfeiertag, Weihnachten, Stephanstag.
 *
 * Kantonal variierend: Heilige Drei Könige, Josefstag, Fronleichnam,
 * Mariä Himmelfahrt, Allerheiligen, Mariä Empfängnis, plus lokale
 * Besonderheiten (Sechseläuten ZH, Näfelser Fahrt GL).
 */
function swissHolidays(
  year: number,
  canton: Canton,
  h: Map<string, string>,
  add: (d: Date, name: string) => void,
  fixed: (m: number, day: number, name: string) => void,
  easter: Date
): Map<string, string> {
  fixed(1, 1, "Neujahr");
  fixed(1, 2, "Berchtoldstag");
  add(offsetDays(easter, -2), "Karfreitag");
  add(offsetDays(easter, 1), "Ostermontag");
  add(offsetDays(easter, 39), "Auffahrt (Christi Himmelfahrt)");
  add(offsetDays(easter, 50), "Pfingstmontag");
  fixed(8, 1, "Bundesfeiertag");
  fixed(12, 25, "Weihnachten");
  fixed(12, 26, "Stephanstag");

  // Heilige Drei Könige (6. Jan): katholisch geprägte Kantone
  const epiphanyCantons = new Set(["UR", "SZ", "OW", "NW", "TI", "VS", "AI", "FR", "JU"]);
  if (epiphanyCantons.has(canton)) fixed(1, 6, "Heilige Drei Könige");

  // Josefstag (19. März): katholische Kantone
  const josefCantons = new Set(["UR", "SZ", "OW", "NW", "TI", "VS", "LU", "ZG", "FR", "AI"]);
  if (josefCantons.has(canton)) fixed(3, 19, "Josefstag");

  // Näfelser Fahrt (GL): erster Donnerstag im April
  if (canton === "GL") {
    const apr1 = new Date(Date.UTC(year, 3, 1, 12));
    const dow = apr1.getUTCDay();
    const daysToThu = dow <= 4 ? 4 - dow : 4 + 7 - dow;
    add(offsetDays(apr1, daysToThu), "Näfelser Fahrt");
  }

  // Sechseläuten (ZH): dritter Montag im April
  if (canton === "ZH") {
    const apr1 = new Date(Date.UTC(year, 3, 1, 12));
    const dow = apr1.getUTCDay();
    const daysToMon = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow + 1;
    const firstMon = offsetDays(apr1, daysToMon);
    add(offsetDays(firstMon, 14), "Sechseläuten");
  }

  // Fronleichnam (60 Tage nach Ostern): katholische Kantone
  const corpusChristiCantons = new Set([
    "UR",
    "SZ",
    "OW",
    "NW",
    "LU",
    "ZG",
    "FR",
    "SO",
    "TI",
    "VS",
    "AI",
    "SG",
    "AG",
    "TG",
    "GR",
    "BL",
    "SH",
  ]);
  if (corpusChristiCantons.has(canton)) {
    add(offsetDays(easter, 60), "Fronleichnam");
  }

  // Mariä Himmelfahrt (15. Aug): katholische Kantone
  const assumptionCantons = new Set([
    "UR",
    "SZ",
    "OW",
    "NW",
    "LU",
    "ZG",
    "FR",
    "SO",
    "TI",
    "VS",
    "AI",
    "SG",
    "AG",
    "TG",
    "GR",
    "JU",
  ]);
  if (assumptionCantons.has(canton)) fixed(8, 15, "Mariä Himmelfahrt");

  // Allerheiligen (1. Nov): katholische Kantone
  const allSaintsCantons = new Set([
    "UR",
    "SZ",
    "OW",
    "NW",
    "LU",
    "ZG",
    "FR",
    "SO",
    "TI",
    "VS",
    "AI",
    "SG",
    "AG",
    "TG",
    "GR",
    "BL",
    "JU",
  ]);
  if (allSaintsCantons.has(canton)) fixed(11, 1, "Allerheiligen");

  // Mariä Empfängnis (8. Dez): katholische Kantone
  const immaculateConceptionCantons = new Set([
    "UR",
    "SZ",
    "OW",
    "NW",
    "LU",
    "ZG",
    "FR",
    "SO",
    "TI",
    "VS",
    "AI",
    "SG",
    "AG",
    "TG",
    "GR",
    "BL",
    "JU",
  ]);
  if (immaculateConceptionCantons.has(canton)) fixed(12, 8, "Mariä Empfängnis");

  const cacheKey = `${year}:${canton}`;
  holidayCache.set(cacheKey, h);
  return h;
}

/**
 * Gibt true zurück wenn `date` ein gesetzlicher Feiertag im `state` ist.
 * Wenn kein Bundesland angegeben wird, wird nur Sa/So geprüft (Fallback).
 */
export function isPublicHoliday(
  date: Date,
  state?: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): boolean {
  if (!state) return false;
  const holidays = publicHolidays(date.getUTCFullYear(), state, country);
  return holidays.has(isoDate(date));
}

/**
 * Verschiebt `date` auf den nächsten Werktag, der kein Feiertag ist.
 * § 222 Abs. 2 ZPO / § 193 BGB: Sa, So und gesetzliche Feiertage verschieben.
 * Gibt zusätzlich zurück ob verschoben wurde und wenn ja von welchem Datum.
 */
export function nextWorkday(
  date: Date,
  state?: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): { date: Date; shifted: boolean; shiftedFrom?: string } {
  const original = isoDate(date);
  let d = new Date(date);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || isPublicHoliday(d, state, country)) {
    d = offsetDays(d, 1);
  }
  const shifted = isoDate(d) !== original;
  return { date: d, shifted, shiftedFrom: shifted ? original : undefined };
}

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
  /** Wenn true: kein Roll-Forward auf nächsten Werktag (für Verjährungsfristen, die am exakten Kalendertag enden). */
  noRoll?: boolean;
  description: string;
}

// Prozessuale Fristen sind KALENDERfristen (§ 222 ZPO i.V.m. §§ 187 ff. BGB;
// CH: Art. 64 ZPO), keine Werktagsfristen. Monatsfristen enden mit Ablauf des
// Tages des letzten Monats, der dem Ereignistag entspricht (§ 188 Abs. 2 BGB;
// CH: Art. 65 ZPO) — nicht nach 30 Tagen. Fällt das Fristende auf
// Samstag/Sonntag, verschiebt es sich auf den nächsten Werktag (§ 222 Abs. 2
// ZPO / § 193 BGB; CH: Art. 66 ZPO). Gesetzliche Feiertage sind
// bundesland-/kantons-abhängig und werden über den `state`-Parameter berechnet.
export const DEADLINE_RULES: DeadlineRule[] = [
  {
    key: "zpo-verteidigungsanzeige",
    label: "Verteidigungsanzeige",
    law: "§ 276 Abs. 1 S. 1 ZPO",
    days: 14,
    description: "Notfrist: 2 Wochen ab Zustellung der Klageschrift (schriftliches Vorverfahren)",
  },
  {
    key: "zpo-klageerwiderung",
    label: "Klageerwiderung",
    law: "§ 276 Abs. 1 S. 2 ZPO",
    days: 28,
    description:
      "2 Wochen Verteidigungsanzeige + mindestens 2 weitere Wochen; maßgeblich ist die gerichtlich gesetzte Frist",
  },
  {
    key: "zpo-einspruch-vu",
    label: "Einspruch gg. Versäumnisurteil",
    law: "§ 339 Abs. 1 ZPO",
    days: 14,
    description: "Notfrist: 2 Wochen ab Zustellung des Versäumnisurteils",
  },
  {
    key: "zpo-berufung",
    label: "Berufung",
    law: "§ 517 ZPO",
    months: 1,
    description:
      "Notfrist: 1 Monat ab Zustellung des Urteils (spätestens 5 Monate nach Verkündung)",
  },
  {
    key: "zpo-berufungsbegruendung",
    label: "Berufungsbegründung",
    law: "§ 520 Abs. 2 ZPO",
    months: 2,
    description: "2 Monate ab Zustellung des Urteils (verlängerbar)",
  },
  {
    key: "zpo-revision",
    label: "Revision",
    law: "§ 548 ZPO",
    months: 1,
    description: "Notfrist: 1 Monat ab Zustellung des Berufungsurteils",
  },
  {
    key: "zpo-beschwerde",
    label: "Sofortige Beschwerde",
    law: "§ 569 Abs. 1 ZPO",
    days: 14,
    description: "Notfrist: 2 Wochen ab Zustellung der Entscheidung",
  },
  {
    key: "stpo-revision-einlegung",
    label: "Revision (Straf) — Einlegung",
    law: "§ 341 Abs. 1 StPO",
    days: 7,
    description:
      "1 Woche ab Verkündung des Urteils (Begründung: 1 Monat ab Ablauf der Einlegungsfrist, § 345 StPO)",
  },
  {
    key: "zpo-vollziehung-ev",
    label: "Vollziehung einstw. Verfügung",
    law: "§§ 929 Abs. 2, 936 ZPO",
    months: 1,
    description: "Vollziehungsfrist: 1 Monat ab Verkündung/Zustellung an den Gläubiger",
  },
  {
    key: "vwgvg-beschwerde",
    label: "Bescheidbeschwerde (AT)",
    law: "§ 7 Abs. 4 VwGVG (AT)",
    days: 28,
    description: "4 Wochen ab Zustellung des Bescheids",
  },
  {
    key: "abgb-verjaehrung",
    label: "Verjährung Schadenersatz (AT)",
    law: "§ 1489 ABGB (AT)",
    years: 3,
    noRoll: true,
    description: "3 Jahre ab Kenntnis von Schaden und Schädiger",
  },
  // ── Österreichische Fristen (§ 5 JN, AT ZPO, AVG, BAO) ────────────────
  {
    key: "at-jn-berufung",
    label: "Berufung (AT § 5 JN)",
    law: "§ 5 Abs. 1 JN (AT)",
    days: 28,
    description: "4 Wochen ab Zustellung des Ersturteils (Jurisdiktionsnorm)",
  },
  {
    key: "at-jn-revision",
    label: "Revision (AT § 5 JN)",
    law: "§ 5 Abs. 1 JN iVm § 502 ZPO (AT)",
    days: 28,
    description: "4 Wochen ab Zustellung des Berufungsurteils (außerordentliches Rechtsmittel)",
  },
  {
    key: "at-avg-einwendung",
    label: "Einwendung (AT AVG)",
    law: "§ 43 Abs. 2 AVG (AT)",
    days: 14,
    description: "2 Wochen ab Zustellung des Bescheids (Verwaltungsverfahrensgesetz)",
  },
  {
    key: "at-bao-beschwerde",
    label: "Beschwerde (AT BAO)",
    law: "§ 245 BAO (AT)",
    days: 28,
    description: "4 Wochen ab Zustellung des Bescheids (Bundesabgabenordnung)",
  },
  {
    key: "at-eke-einspruch",
    label: "Einspruch Exekutionsbeschluss (AT)",
    law: "§ 39 EO (AT)",
    days: 14,
    description: "2 Wochen ab Zustellung des Exekutionsbeschlusses (Exekutionsordnung)",
  },
  // ── Schweizer Fristen (CH ZPO / OR / ZGB) ──────────────────────────────
  {
    key: "ch-zpo-berufung",
    label: "Berufung (CH)",
    law: "Art. 311 ZPO (CH)",
    days: 30,
    description: "30 Tage ab Zustellung des Urteils (kantonal abweichend möglich)",
  },
  {
    key: "ch-zpo-appellation",
    label: "Appellation (CH)",
    law: "Art. 378 ZPO (CH)",
    days: 30,
    description: "30 Tage ab Zustellung des Entscheids (vor kantonalen Obergerichten)",
  },
  {
    key: "ch-or-verjaehrung",
    label: "Verjährung (CH OR)",
    law: "Art. 127 OR (CH)",
    years: 10,
    noRoll: true,
    description:
      "10 Jahre (absolute Verjährung nach OR); relative Verjährung 5 Jahre (Art. 128 OR) für konkrete Ansprüche",
  },
  {
    key: "ch-zgb-erbklage",
    label: "Erbteilungsklage (CH)",
    law: "Art. 602 ZGB (CH)",
    years: 1,
    noRoll: true,
    description: "1 Jahr ab Kenntnis der Erbschaft (Erbteilungsklage nach Schweizer ZGB)",
  },
  {
    key: "ch-zpo-beschwerde",
    label: "Beschwerde (CH)",
    law: "Art. 319 ZPO (CH)",
    days: 30,
    description: "30 Tage ab Zustellung des Entscheids (kantonal abweichend möglich)",
  },
  {
    key: "ch-zpo-revision",
    label: "Revision (CH)",
    law: "Art. 328 ZPO (CH)",
    days: 30,
    description: "30 Tage ab Entdeckung des Revisionsgrunds (außerordentliches Rechtsmittel)",
  },
  {
    key: "ch-kant-einspruch",
    label: "Kantonale Einspruchsfrist (CH)",
    law: "Kantonales Prozessrecht (CH)",
    days: 10,
    description:
      "Kantonale Einspruchsfrist gegen Verfügungen/Vorentscheide (10 Tage Standard; kantonal abweichend, z.B. ZH 20 Tage, BE 10 Tage)",
  },
  {
    key: "ch-vvg-beschwerde",
    label: "Verwaltungsgerichtliche Beschwerde (CH)",
    law: "Art. 46 VwVG (CH)",
    days: 30,
    description: "30 Tage ab Zustellung des Verfügungsentscheids (Verwaltungsverfahrensgesetz)",
  },
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

/**
 * Hilfsfunktion für rein organisatorische (nicht-prozessuale) Werktagsfristen.
 * Berücksichtigt optional Feiertage (DE/AT/CH) wenn `state` übergeben wird.
 */
export function addBusinessDays(
  date: Date,
  days: number,
  state?: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): Date {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !isPublicHoliday(d, state, country)) added++;
  }
  return d;
}

export interface DueDateResult {
  /** Fristende als YYYY-MM-DD (nach Wochenend- und Feiertagsverschiebung). */
  dueDate: string;
  /** true, wenn das rechnerische Ende verschoben wurde (Sa/So oder Feiertag). */
  rolledForward: boolean;
  /** Name des Feiertags wenn das Ende auf einen Feiertag fiel, sonst undefined. */
  holidayName?: string;
  /** Menschlich lesbare Berechnungsnotiz inkl. Rechtsgrundlagen. */
  note: string;
}

/**
 * Fristende nach §§ 187 ff. BGB / § 222 ZPO (DE/AT) bzw. Art. 64–66 ZPO (CH)
 * inkl. Wochenend- und Feiertagsverschiebung. Optionaler `state`-Parameter
 * aktiviert die bundesland-/kantons-spezifische Feiertagsberechnung (DE + AT + CH).
 */
export function computeDueDate(
  rule: DeadlineRule,
  startDate: string,
  state?: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): DueDateResult {
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

  // § 222 Abs. 2 ZPO / § 193 BGB: Sa/So und gesetzliche Feiertage → nächster Werktag.
  // Ausnahme: Verjährungsfristen (noRoll=true) enden am exakten Kalendertag.
  const rawDueStr = toISODateString(due);
  let holidayName: string | undefined;
  if (state) {
    const holidays = publicHolidays(due.getUTCFullYear(), state, country);
    holidayName = holidays.get(rawDueStr);
  }
  let rolledForward = false;
  if (!rule.noRoll) {
    const { date: shifted, shifted: didShift } = nextWorkday(due, state, country);
    due = shifted;
    rolledForward = didShift;
  }

  const shiftReason = rolledForward
    ? holidayName
      ? `; Fristende (${holidayName}) auf nächsten Werktag verschoben (§ 222 Abs. 2 ZPO)`
      : "; Fristende auf nächsten Werktag verschoben (§ 222 Abs. 2 ZPO)"
    : "";

  const holidayNote = state
    ? ""
    : " Gesetzliche Feiertage manuell prüfen (kein Bundesland gesetzt).";

  const note = `${durationLabel} ab ${startDate} (${rule.law})${shiftReason}.${holidayNote}`;

  return { dueDate: toISODateString(due), rolledForward, holidayName, note };
}

export function calculateDeadline(
  rule: DeadlineRule,
  startDate: string,
  state?: Bundesland | Canton,
  country?: "DE" | "AT" | "CH"
): DeadlineEntry {
  const { dueDate, note } = computeDueDate(rule, startDate, state, country);
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
    audit_log: [...(deadline.audit_log ?? []), { at: now, action, actor, note }],
  };
}
