/**
 * frist-engine.ts — Deterministic Austrian deadline calculator (Gap A).
 *
 * Pure TypeScript, no LLM, no I/O. Every rule cites its statutory basis.
 * The legal pipeline extracts deadlines VERBATIM (anti-hallucination rule);
 * this engine COMPUTES the legally correct end date, the Vorfrist, and the
 * escalation classification. The deadline-validator LLM layer becomes a
 * plausibility reviewer on top of these deterministic results — never the
 * calculator of record.
 *
 * Covered rules:
 *   - Austrian public holidays (fixed + Easter-derived via Gauss/Butcher)
 *   - Fristbeginn und -ende nach §§ 124–126 ZPO (Tages-/Wochen-/Monatsfristen,
 *     Ende an Samstag/Sonntag/Feiertag → nächster Werktag)
 *   - § 32 f. AVG für Verwaltungsverfahren (inkl. Karfreitag + 24.12. als
 *     fristhemmende End-Tage nach § 33 Abs 2 AVG)
 *   - Verhandlungsfreie Zeit § 222 ZPO (15.7.–17.8., 24.12.–6.1.) mit
 *     Hemmungs-Mechanik nach Abs 1 Satz 2 und Ferialsachen-Ausnahme
 *   - Zustellfiktionen: § 89a GOG (ERV — folgender Werktag, Samstag zählt
 *     nicht), § 17 Abs 3 ZustG (Hinterlegung — erster Tag der Abholfrist),
 *     § 26 Abs 2 ZustG (Zustellung ohne Zustellnachweis — dritter Werktag)
 *   - Materiellrechtliche Fristen (Verjährung § 1489 ABGB): KEINE
 *     End-Tag-Verschiebung (§§ 902 f. ABGB)
 *   - Fristarten-Registry (ZPO / StPO / AVG / VwGG / VfGG) mit Notfrist-
 *     und Hemmungs-Flags
 *   - Vorfrist-Berechnung (Kanzlei-Standard: 1 Woche, auf den davorliegenden
 *     Werktag gezogen) und Ampel-Klassifikation für das Fristenbuch
 *
 * All dates are ISO `YYYY-MM-DD` strings; internal math uses UTC to avoid
 * DST edge cases. Deterministic and fully unit-testable.
 */

// ── ISO date helpers (UTC-only) ─────────────────────────────

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseISODate(iso: string): Date {
  const m = ISO_RE.exec(iso);
  if (!m) throw new Error(`frist-engine: invalid ISO date "${iso}" (expected YYYY-MM-DD)`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (
    d.getUTCFullYear() !== Number(m[1]) ||
    d.getUTCMonth() !== Number(m[2]) - 1 ||
    d.getUTCDate() !== Number(m[3])
  ) {
    throw new Error(`frist-engine: non-existent calendar date "${iso}"`);
  }
  return d;
}

export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Difference in whole days (b − a). */
export function daysBetween(aIso: string, bIso: string): number {
  const a = parseISODate(aIso).getTime();
  const b = parseISODate(bIso).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday (UTC). */
function weekday(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

// ── Austrian public holidays ────────────────────────────────

/** Easter Sunday via the anonymous Gregorian (Gauss/Butcher) computus. */
export function osterSonntag(jahr: number): string {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
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
  return `${jahr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface Feiertag {
  datum: string;
  name: string;
}

/** Gesetzliche Feiertage in Österreich (§ 7 ARG) für ein Kalenderjahr. */
export function feiertageAT(jahr: number): Feiertag[] {
  const ostern = osterSonntag(jahr);
  const fix = (mmdd: string, name: string): Feiertag => ({ datum: `${jahr}-${mmdd}`, name });
  return [
    fix("01-01", "Neujahr"),
    fix("01-06", "Heilige Drei Könige"),
    { datum: addDays(ostern, 1), name: "Ostermontag" },
    fix("05-01", "Staatsfeiertag"),
    { datum: addDays(ostern, 39), name: "Christi Himmelfahrt" },
    { datum: addDays(ostern, 50), name: "Pfingstmontag" },
    { datum: addDays(ostern, 60), name: "Fronleichnam" },
    fix("08-15", "Mariä Himmelfahrt"),
    fix("10-26", "Nationalfeiertag"),
    fix("11-01", "Allerheiligen"),
    fix("12-08", "Mariä Empfängnis"),
    fix("12-25", "Christtag"),
    fix("12-26", "Stefanitag"),
  ];
}

const feiertagCache = new Map<number, Set<string>>();

function feiertagSet(jahr: number): Set<string> {
  let s = feiertagCache.get(jahr);
  if (!s) {
    s = new Set(feiertageAT(jahr).map((f) => f.datum));
    feiertagCache.set(jahr, s);
  }
  return s;
}

export function istFeiertag(iso: string): boolean {
  return feiertagSet(parseISODate(iso).getUTCFullYear()).has(iso);
}

/** Karfreitag (seit 2019 kein gesetzlicher Feiertag; § 33 Abs 2 AVG zählt ihn dennoch). */
export function istKarfreitag(iso: string): boolean {
  return iso === addDays(osterSonntag(parseISODate(iso).getUTCFullYear()), -2);
}

/** Werktag = Montag–Freitag, kein gesetzlicher Feiertag. (Samstag ist NIE
 *  Werktag i.S.d. § 89a GOG bzw. § 26 Abs 2 ZustG.) */
export function istWerktag(iso: string): boolean {
  const wd = weekday(iso);
  return wd >= 1 && wd <= 5 && !istFeiertag(iso);
}

export function naechsterWerktag(iso: string): string {
  let d = addDays(iso, 1);
  while (!istWerktag(d)) d = addDays(d, 1);
  return d;
}

export function vorigerWerktag(iso: string): string {
  let d = addDays(iso, -1);
  while (!istWerktag(d)) d = addDays(d, -1);
  return d;
}

// ── Zustellfiktionen ────────────────────────────────────────

/**
 * § 89a Abs 2 GOG — elektronische Zustellung im ERV:
 * gilt als zugestellt am auf das Einlangen in den elektronischen
 * Verfügungsbereich folgenden Werktag; Samstag gilt dabei nicht als Werktag.
 */
export function zustellungERV(einlangenIso: string): string {
  return naechsterWerktag(einlangenIso);
}

/**
 * § 17 Abs 3 ZustG — Hinterlegung: das Dokument gilt mit dem ersten Tag
 * der Abholfrist als zugestellt.
 */
export function zustellungHinterlegung(ersterTagAbholfristIso: string): string {
  return ersterTagAbholfristIso;
}

/**
 * § 26 Abs 2 ZustG — Zustellung ohne Zustellnachweis: gilt am dritten
 * Werktag nach der Übergabe an das Zustellorgan als bewirkt.
 */
export function zustellungOhneNachweis(uebergabeIso: string): string {
  let d = uebergabeIso;
  for (let i = 0; i < 3; i++) d = naechsterWerktag(d);
  return d;
}

// ── Verhandlungsfreie Zeit (§ 222 ZPO) ──────────────────────

export interface VhfzZeitraum {
  start: string;
  ende: string;
}

/** Die beiden verhandlungsfreien Zeiträume eines Jahres (§ 222 Abs 1 ZPO):
 *  15.7.–17.8. und 24.12.–6.1. (des Folgejahres). */
export function verhandlungsfreieZeitraeume(jahr: number): VhfzZeitraum[] {
  return [
    { start: `${jahr}-07-15`, ende: `${jahr}-08-17` },
    { start: `${jahr}-12-24`, ende: `${jahr + 1}-01-06` },
    // Der Jahreswechsel-Zeitraum des VORJAHRES ragt in dieses Jahr hinein:
    { start: `${jahr - 1}-12-24`, ende: `${jahr}-01-06` },
  ];
}

function vhfzZeitraumAm(iso: string): VhfzZeitraum | null {
  const jahr = parseISODate(iso).getUTCFullYear();
  for (const z of verhandlungsfreieZeitraeume(jahr)) {
    if (iso >= z.start && iso <= z.ende) return z;
  }
  return null;
}

/** Ganze Dauer eines vhfZ-Zeitraums in Tagen (beide Grenztage inklusive). */
function vhfzDauer(z: VhfzZeitraum): number {
  return daysBetween(z.start, z.ende) + 1;
}

// ── Fristberechnung ─────────────────────────────────────────

export type FristRegime = "zpo" | "avg" | "stpo" | "materiell";

export interface FristDauer {
  tage?: number;
  wochen?: number;
  monate?: number;
  jahre?: number;
}

export interface BerechneFristOpts {
  /** Fristauslösendes Ereignis (idR Zustellung), ISO-Datum. */
  ausloeser: string;
  dauer: FristDauer;
  regime: FristRegime;
  /** Notfrist im Rechtsmittelverfahren → § 222 ZPO Hemmung anwendbar. */
  gehemmtInVhfz?: boolean;
  /** Ferialsache (§ 222 Abs 2 ZPO / § 39 ASGG): Hemmung ausgeschaltet. */
  ferialsache?: boolean;
  /** Vorfrist in Tagen vor dem Fristende (Default 7). */
  vorfristTage?: number;
}

export interface FristErgebnis {
  /** Tag des fristauslösenden Ereignisses (zählt selbst nicht mit, § 125 Abs 1 ZPO). */
  fristbeginn: string;
  /** Rechnerisches Fristende VOR End-Tag-Verschiebung. */
  fristendeRoh: string;
  /** Maßgebliches Fristende (nach Verschiebung + Hemmung). */
  fristende: string;
  /** Kanzlei-Vorfrist (auf den davorliegenden Werktag gezogen). */
  vorfrist: string;
  /** Kalendertage zwischen Auslöser und Fristende. */
  kalendertage: number;
  /** Angewendete Regeln, nachvollziehbar für das Fristenbuch. */
  hinweise: string[];
}

/**
 * Wochen-/Monats-/Jahresfristen enden mit Ablauf desjenigen Tages der letzten
 * Woche bzw. des letzten Monats, der durch Benennung oder Zahl dem Tag des
 * fristauslösenden Ereignisses entspricht (§ 125 Abs 2 ZPO, § 32 Abs 2 AVG).
 * Fehlt dieser Tag im letzten Monat, entscheidet der letzte Tag des Monats.
 */
function fristendeRoh(ausloeser: string, dauer: FristDauer): string {
  let d = ausloeser;
  const tage = (dauer.tage ?? 0) + (dauer.wochen ?? 0) * 7;
  if (tage > 0) {
    // § 125 Abs 1 ZPO: Tag des Ereignisses wird nicht mitgerechnet;
    // die Frist endet mit Ablauf des letzten Tages.
    d = addDays(d, tage);
  }
  const monate = (dauer.monate ?? 0) + (dauer.jahre ?? 0) * 12;
  if (monate > 0) {
    const base = parseISODate(d);
    const targetMonth = base.getUTCMonth() + monate;
    const targetYear = base.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normMonth = ((targetMonth % 12) + 12) % 12;
    const lastDayOfTarget = new Date(Date.UTC(targetYear, normMonth + 1, 0)).getUTCDate();
    const day = Math.min(base.getUTCDate(), lastDayOfTarget);
    d = toISODate(new Date(Date.UTC(targetYear, normMonth, day)));
  }
  return d;
}

/** End-Tag-Verschiebung: Fällt das Fristende auf Sa/So/Feiertag (§ 126 Abs 2
 *  ZPO) — im AVG-Regime zusätzlich Karfreitag und 24.12. (§ 33 Abs 2 AVG) —
 *  endet die Frist erst mit dem nächsten Werktag. */
function schiebeEndTag(iso: string, regime: FristRegime, hinweise: string[]): string {
  if (regime === "materiell") return iso; // §§ 902 f. ABGB: keine Verschiebung
  let d = iso;
  const istDiesNon = (x: string): boolean => {
    if (!istWerktag(x)) return true;
    if (regime === "avg" && (istKarfreitag(x) || x.endsWith("-12-24"))) return true;
    return false;
  };
  while (istDiesNon(d)) {
    d = addDays(d, 1);
  }
  if (d !== iso) {
    hinweise.push(
      regime === "avg"
        ? `Fristende ${iso} fällt auf Sa/So/Feiertag/Karfreitag/24.12. — verschoben auf ${d} (§ 33 Abs 2 AVG)`
        : `Fristende ${iso} fällt auf Sa/So/Feiertag — verschoben auf ${d} (§ 126 Abs 2 ZPO)`
    );
  }
  return d;
}

/**
 * Kernfunktion: berechnet das maßgebliche Fristende.
 *
 * § 222 Abs 1 ZPO Hemmungs-Mechanik (nur wenn `gehemmtInVhfz` und keine
 * Ferialsache):
 *   - Beginnt der Fristenlauf INNERHALB der verhandlungsfreien Zeit, wird die
 *     Notfrist um den bei ihrem Beginn noch übrigen Teil des Zeitraums
 *     verlängert (klassisches Ergebnis: Zustellung eines Urteils während der
 *     Sommer-vhfZ → 4-wöchige Berufungsfrist endet am 14.9.).
 *   - Fällt der ANFANG des Zeitraums in den Lauf der Notfrist, wird sie um
 *     die GANZE Dauer des Zeitraums verlängert.
 */
export function berechneFrist(opts: BerechneFristOpts): FristErgebnis {
  const hinweise: string[] = [];
  const ausloeser = opts.ausloeser;
  parseISODate(ausloeser); // validate

  let roh = fristendeRoh(ausloeser, opts.dauer);
  if (roh === ausloeser) {
    throw new Error("frist-engine: dauer must specify at least one of tage/wochen/monate/jahre");
  }

  // § 222 ZPO Hemmung
  if (opts.regime === "zpo" && opts.gehemmtInVhfz && !opts.ferialsache) {
    const zBeginn = vhfzZeitraumAm(ausloeser);
    if (zBeginn) {
      const rest = daysBetween(ausloeser, zBeginn.ende);
      roh = addDays(roh, rest);
      hinweise.push(
        `Fristbeginn in verhandlungsfreier Zeit (${zBeginn.start}–${zBeginn.ende}) — ` +
          `Notfrist um ${rest} Tage verlängert (§ 222 Abs 1 ZPO)`
      );
    } else {
      // Fällt der Anfang eines vhfZ-Zeitraums in den Fristenlauf?
      const jahre = new Set([
        parseISODate(ausloeser).getUTCFullYear(),
        parseISODate(roh).getUTCFullYear(),
      ]);
      for (const jahr of jahre) {
        for (const z of verhandlungsfreieZeitraeume(jahr)) {
          if (z.start > ausloeser && z.start <= roh) {
            const dauer = vhfzDauer(z);
            roh = addDays(roh, dauer);
            hinweise.push(
              `Verhandlungsfreie Zeit (${z.start}–${z.ende}) fällt in den Fristenlauf — ` +
                `Notfrist um ganze Dauer (${dauer} Tage) verlängert (§ 222 Abs 1 ZPO)`
            );
            break;
          }
        }
        if (hinweise.some((h) => h.includes("ganze Dauer"))) break;
      }
    }
  } else if (opts.regime === "zpo" && opts.gehemmtInVhfz && opts.ferialsache) {
    hinweise.push("Ferialsache (§ 222 Abs 2 ZPO) — keine Hemmung durch verhandlungsfreie Zeit");
  }

  const fristende = schiebeEndTag(roh, opts.regime, hinweise);
  if (opts.regime === "materiell") {
    hinweise.push("Materiellrechtliche Frist — keine End-Tag-Verschiebung (§§ 902 f. ABGB)");
  }

  const vorfristTage = opts.vorfristTage ?? 7;
  let vorfrist = addDays(fristende, -vorfristTage);
  if (!istWerktag(vorfrist)) vorfrist = vorigerWerktag(vorfrist);

  return {
    fristbeginn: ausloeser,
    fristendeRoh: roh,
    fristende,
    vorfrist,
    kalendertage: daysBetween(ausloeser, fristende),
    hinweise,
  };
}

// ── Fristarten-Registry ─────────────────────────────────────

export interface FristArt {
  key: string;
  bezeichnung: string;
  dauer: FristDauer;
  regime: FristRegime;
  rechtsgrundlage: string;
  /** Notfrist (nicht erstreckbar, § 128 Abs 1 ZPO). */
  notfrist: boolean;
  /** § 222 ZPO Hemmung anwendbar (Rechtsmittelverfahren). */
  gehemmtInVhfz: boolean;
  verfahrenstyp: "zivil" | "straf" | "verwaltungsrecht" | "arbeitsrecht" | "alle";
  hinweis?: string;
}

export const FRISTEN_REGISTRY: readonly FristArt[] = [
  // ── ZPO (Zivilverfahren) ──
  {
    key: "klagebeantwortung",
    bezeichnung: "Klagebeantwortung",
    dauer: { wochen: 4 },
    regime: "zpo",
    rechtsgrundlage: "§ 230 Abs 1 ZPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "zivil",
  },
  {
    key: "einspruch_zahlungsbefehl",
    bezeichnung: "Einspruch gegen Zahlungsbefehl",
    dauer: { wochen: 4 },
    regime: "zpo",
    rechtsgrundlage: "§ 248 Abs 2 ZPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "zivil",
    hinweis: "Mahnverfahren: zwingend bis € 75.000 Streitwert (§ 244 ZPO)",
  },
  {
    key: "berufung",
    bezeichnung: "Berufung",
    dauer: { wochen: 4 },
    regime: "zpo",
    rechtsgrundlage: "§ 464 Abs 1 ZPO",
    notfrist: true,
    gehemmtInVhfz: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "berufungsbeantwortung",
    bezeichnung: "Berufungsbeantwortung",
    dauer: { wochen: 4 },
    regime: "zpo",
    rechtsgrundlage: "§ 468 Abs 2 ZPO",
    notfrist: true,
    gehemmtInVhfz: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "revision",
    bezeichnung: "Revision",
    dauer: { wochen: 4 },
    regime: "zpo",
    rechtsgrundlage: "§ 505 Abs 2 ZPO",
    notfrist: true,
    gehemmtInVhfz: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "rekurs",
    bezeichnung: "Rekurs",
    dauer: { tage: 14 },
    regime: "zpo",
    rechtsgrundlage: "§ 521 Abs 1 ZPO",
    notfrist: true,
    gehemmtInVhfz: true,
    verfahrenstyp: "zivil",
    hinweis: "4 Wochen bei Endbeschlüssen im Besitzstörungsverfahren u.a. (§ 521 Abs 1 Satz 2 ZPO)",
  },
  {
    key: "revisionsrekurs",
    bezeichnung: "Revisionsrekurs",
    dauer: { tage: 14 },
    regime: "zpo",
    rechtsgrundlage: "§ 528 ZPO iVm § 521 ZPO",
    notfrist: true,
    gehemmtInVhfz: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "widerspruch_versaeumungsurteil",
    bezeichnung: "Widerspruch gegen Versäumungsurteil",
    dauer: { tage: 14 },
    regime: "zpo",
    rechtsgrundlage: "§ 397a Abs 1 ZPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "zivil",
  },
  {
    key: "wiedereinsetzung",
    bezeichnung: "Wiedereinsetzung in den vorigen Stand",
    dauer: { tage: 14 },
    regime: "zpo",
    rechtsgrundlage: "§ 148 Abs 2 ZPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "zivil",
    hinweis: "Frist ab Wegfall des Hindernisses",
  },
  // ── StPO (Strafverfahren) ──
  {
    key: "einspruch_rechtsverletzung_stpo",
    bezeichnung: "Einspruch wegen Rechtsverletzung",
    dauer: { wochen: 6 },
    regime: "stpo",
    rechtsgrundlage: "§ 106 Abs 3 StPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "straf",
  },
  {
    key: "beschwerde_stpo",
    bezeichnung: "Beschwerde",
    dauer: { tage: 14 },
    regime: "stpo",
    rechtsgrundlage: "§ 88 Abs 1 StPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "straf",
  },
  {
    key: "berufungsanmeldung_stpo",
    bezeichnung: "Anmeldung der Berufung",
    dauer: { tage: 3 },
    regime: "stpo",
    rechtsgrundlage: "§ 466 Abs 1 / § 284 Abs 1 StPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "straf",
  },
  {
    key: "berufungsausfuehrung_stpo",
    bezeichnung: "Ausführung der Berufung / Nichtigkeitsbeschwerde",
    dauer: { wochen: 4 },
    regime: "stpo",
    rechtsgrundlage: "§ 285 Abs 1 / § 467 Abs 1 StPO",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "straf",
  },
  // ── Verwaltungsverfahren ──
  {
    key: "beschwerde_vwgvg",
    bezeichnung: "Bescheidbeschwerde an das Verwaltungsgericht",
    dauer: { wochen: 4 },
    regime: "avg",
    rechtsgrundlage: "§ 7 Abs 4 VwGVG",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "verwaltungsrecht",
  },
  {
    key: "revision_vwgh",
    bezeichnung: "Revision an den VwGH",
    dauer: { wochen: 6 },
    regime: "avg",
    rechtsgrundlage: "§ 26 Abs 1 VwGG",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "verwaltungsrecht",
  },
  {
    key: "beschwerde_vfgh",
    bezeichnung: "Beschwerde an den VfGH",
    dauer: { wochen: 6 },
    regime: "avg",
    rechtsgrundlage: "§ 82 Abs 1 VfGG",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "verwaltungsrecht",
  },
  {
    key: "vorstellung_avg",
    bezeichnung: "Vorstellung",
    dauer: { wochen: 2 },
    regime: "avg",
    rechtsgrundlage: "§ 57 Abs 2 AVG",
    notfrist: true,
    gehemmtInVhfz: false,
    verfahrenstyp: "verwaltungsrecht",
  },
  // ── Materiellrechtliche Fristen ──
  {
    key: "verjaehrung_kurz",
    bezeichnung: "Kurze Verjährung (Schadenersatz)",
    dauer: { jahre: 3 },
    regime: "materiell",
    rechtsgrundlage: "§ 1489 ABGB",
    notfrist: false,
    gehemmtInVhfz: false,
    verfahrenstyp: "alle",
    hinweis: "Ab Kenntnis von Schaden und Schädiger",
  },
  {
    key: "verjaehrung_lang",
    bezeichnung: "Lange Verjährung",
    dauer: { jahre: 30 },
    regime: "materiell",
    rechtsgrundlage: "§ 1489 Satz 2 ABGB",
    notfrist: false,
    gehemmtInVhfz: false,
    verfahrenstyp: "alle",
  },
  {
    key: "gewaehrleistung_beweglich",
    bezeichnung: "Gewährleistungsfrist (bewegliche Sachen)",
    dauer: { jahre: 2 },
    regime: "materiell",
    rechtsgrundlage: "§ 933 Abs 1 ABGB",
    notfrist: false,
    gehemmtInVhfz: false,
    verfahrenstyp: "zivil",
  },
] as const;

const FRISTEN_MAP = new Map(FRISTEN_REGISTRY.map((f) => [f.key, f]));

export function resolveFristArt(key: string): FristArt | null {
  return FRISTEN_MAP.get(key) ?? null;
}

export interface FristAutoErgebnis extends FristErgebnis {
  art: FristArt;
}

/** Berechnet eine Frist aus der Registry (z.B. "berufung") ab Zustellung. */
export function berechneFristAuto(
  artKey: string,
  zustellungIso: string,
  opts?: { ferialsache?: boolean; vorfristTage?: number }
): FristAutoErgebnis {
  const art = resolveFristArt(artKey);
  if (!art) {
    throw new Error(
      `frist-engine: unknown Fristart "${artKey}" (known: ${[...FRISTEN_MAP.keys()].join(", ")})`
    );
  }
  const result = berechneFrist({
    ausloeser: zustellungIso,
    dauer: art.dauer,
    regime: art.regime,
    gehemmtInVhfz: art.gehemmtInVhfz,
    ferialsache: opts?.ferialsache,
    vorfristTage: opts?.vorfristTage,
  });
  return { ...result, art };
}

// ── Fristenbuch-Klassifikation ──────────────────────────────

export type FristStatus = "ok" | "vorfrist" | "kritisch" | "ueberfaellig";

/**
 * Ampel für das Fristenbuch:
 *   ueberfaellig — Fristende liegt vor heute
 *   kritisch    — ≤ 2 Werktage bis zum Fristende (Vier-Augen-Eskalation)
 *   vorfrist    — Vorfrist erreicht (Default: 7 Tage davor)
 *   ok          — alles andere
 */
export function klassifiziereFrist(
  fristendeIso: string,
  heuteIso: string,
  vorfristTage = 7
): FristStatus {
  if (fristendeIso < heuteIso) return "ueberfaellig";
  // Werktage zwischen heute und Fristende zählen
  let werktage = 0;
  let d = heuteIso;
  while (d < fristendeIso && werktage <= 2) {
    d = addDays(d, 1);
    if (istWerktag(d)) werktage++;
  }
  if (werktage <= 2) return "kritisch";
  if (daysBetween(heuteIso, fristendeIso) <= vorfristTage) return "vorfrist";
  return "ok";
}
