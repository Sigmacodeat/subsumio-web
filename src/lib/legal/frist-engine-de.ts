/**
 * frist-engine-de.ts — Deterministic German deadline calculator.
 *
 * Pure TypeScript, no LLM, no I/O. Every rule cites its statutory basis.
 * Companion to frist-engine.ts (AT) — same ISO-UTC math, German rules:
 *
 *   - §§ 187–193 BGB (Fristbeginn, Fristende, End-Tag-Verschiebung auf
 *     Sonnabend/Sonntag/allgemeinen Feiertag → nächster Werktag)
 *   - Gesetzliche Feiertage aller 16 Bundesländer (fest + Oster-abhängig
 *     via Gauss/Butcher; Buß- und Bettag SN berechnet)
 *   - § 199 BGB — regelmäßige Verjährungsfrist endet mit Ablauf des
 *     Kalenderjahres (Jahresendverjährung)
 *   - Zustellfiktionen DE: § 174 ZPO i.V.m. § 4 ERVG (beA/elektronische
 *     Zustellung — folgender Tag, Sonnabend zählt nicht), § 181 ZPO
 *     (Ersatzzustellung — Tag der Bekanntgabe)
 *   - Fristarten-Registry DE (ZPO / StPO / VwGO / BGB)
 *   - KEINE verhandlungsfreie Zeit — das deutsche Recht kennt kein
 *     Äquivalent zu § 222 ZPO-AT; Notfristen laufen durch.
 *
 * Bundesland muss immer mitgegeben werden — Feiertage sind Ländersache
 * (§ 193 BGB: "allgemeiner Feiertag" = Feiertag am Wirkungsort).
 */

import {
  addDays,
  daysBetween,
  osterSonntag,
  parseISODate,
  toISODate,
  type Feiertag,
  type FristDauer,
} from "./frist-engine";

// ── Bundesländer ────────────────────────────────────────────

export type Bundesland =
  | "BW"
  | "BY"
  | "BE"
  | "BB"
  | "HB"
  | "HH"
  | "HE"
  | "MV"
  | "NI"
  | "NW"
  | "RP"
  | "SL"
  | "SN"
  | "ST"
  | "SH"
  | "TH";

export const BUNDESLAENDER: readonly { code: Bundesland; name: string }[] = [
  { code: "BW", name: "Baden-Württemberg" },
  { code: "BY", name: "Bayern" },
  { code: "BE", name: "Berlin" },
  { code: "BB", name: "Brandenburg" },
  { code: "HB", name: "Bremen" },
  { code: "HH", name: "Hamburg" },
  { code: "HE", name: "Hessen" },
  { code: "MV", name: "Mecklenburg-Vorpommern" },
  { code: "NI", name: "Niedersachsen" },
  { code: "NW", name: "Nordrhein-Westfalen" },
  { code: "RP", name: "Rheinland-Pfalz" },
  { code: "SL", name: "Saarland" },
  { code: "SN", name: "Sachsen" },
  { code: "ST", name: "Sachsen-Anhalt" },
  { code: "SH", name: "Schleswig-Holstein" },
  { code: "TH", name: "Thüringen" },
];

const BUNDESLAND_CODES = new Set<string>(BUNDESLAENDER.map((b) => b.code));

/** Validiert einen Rohwert (Frontmatter/Settings) als Bundesland-Code.
 *  Case-insensitiv; unbekannte/leere Werte → undefined (fail-closed auf
 *  bundesweite Feiertage statt falscher Landesfeiertage). */
export function toBundesland(raw: unknown): Bundesland | undefined {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  return BUNDESLAND_CODES.has(code) ? (code as Bundesland) : undefined;
}

/** Buß- und Bettag (SN): Mittwoch vor dem 23. November. */
function bussUndBettag(jahr: number): string {
  let d = `${jahr}-11-22`;
  while (parseISODate(d).getUTCDay() !== 3) d = addDays(d, -1);
  return d;
}

/** Gesetzliche Feiertage eines Bundeslandes für ein Kalenderjahr.
 *  Ohne `land` nur bundesweite Feiertage (konservativ: Landesfeiertage
 *  werden nur berücksichtigt, wenn der Wirkungsort bekannt ist).
 *  Hinweis BY: Mariä Himmelfahrt gilt nur in Gemeinden mit überwiegend
 *  katholischer Bevölkerung — wir listen ihn für BY mit Hinweis. */
export function feiertageDE(jahr: number, land?: Bundesland): Feiertag[] {
  const ostern = osterSonntag(jahr);
  const fix = (mmdd: string, name: string): Feiertag => ({ datum: `${jahr}-${mmdd}`, name });
  const all: Feiertag[] = [
    fix("01-01", "Neujahr"),
    { datum: addDays(ostern, -2), name: "Karfreitag" },
    { datum: addDays(ostern, 1), name: "Ostermontag" },
    fix("05-01", "Tag der Arbeit"),
    { datum: addDays(ostern, 39), name: "Christi Himmelfahrt" },
    { datum: addDays(ostern, 50), name: "Pfingstmontag" },
    fix("10-03", "Tag der Deutschen Einheit"),
    fix("12-25", "1. Weihnachtsfeiertag"),
    fix("12-26", "2. Weihnachtsfeiertag"),
  ];
  const landFeiertage: Partial<Record<Bundesland, Feiertag[]>> = {
    BW: [
      fix("01-06", "Heilige Drei Könige"),
      { datum: addDays(ostern, 60), name: "Fronleichnam" },
      fix("11-01", "Allerheiligen"),
    ],
    BY: [
      fix("01-06", "Heilige Drei Könige"),
      { datum: addDays(ostern, 60), name: "Fronleichnam" },
      fix("08-15", "Mariä Himmelfahrt (überwiegend katholische Gemeinden)"),
      fix("11-01", "Allerheiligen"),
    ],
    BE: [fix("03-08", "Internationaler Frauentag")],
    BB: [fix("10-31", "Reformationstag")],
    HB: [fix("10-31", "Reformationstag")],
    HH: [fix("10-31", "Reformationstag")],
    HE: [{ datum: addDays(ostern, 60), name: "Fronleichnam" }],
    MV: [fix("03-08", "Internationaler Frauentag"), fix("10-31", "Reformationstag")],
    NI: [fix("10-31", "Reformationstag")],
    NW: [{ datum: addDays(ostern, 60), name: "Fronleichnam" }, fix("11-01", "Allerheiligen")],
    RP: [{ datum: addDays(ostern, 60), name: "Fronleichnam" }, fix("11-01", "Allerheiligen")],
    SL: [
      { datum: addDays(ostern, 60), name: "Fronleichnam" },
      fix("08-15", "Mariä Himmelfahrt"),
      fix("11-01", "Allerheiligen"),
    ],
    SN: [fix("10-31", "Reformationstag"), { datum: bussUndBettag(jahr), name: "Buß- und Bettag" }],
    ST: [fix("01-06", "Heilige Drei Könige"), fix("10-31", "Reformationstag")],
    SH: [fix("10-31", "Reformationstag")],
    TH: [fix("09-20", "Weltkindertag"), fix("10-31", "Reformationstag")],
  };
  return [...all, ...(land ? (landFeiertage[land] ?? []) : [])];
}

const feiertagCacheDE = new Map<string, Set<string>>();

function feiertagSetDE(jahr: number, land?: Bundesland): Set<string> {
  const key = `${jahr}-${land ?? "bund"}`;
  let s = feiertagCacheDE.get(key);
  if (!s) {
    s = new Set(feiertageDE(jahr, land).map((f) => f.datum));
    feiertagCacheDE.set(key, s);
  }
  return s;
}

export function istFeiertagDE(iso: string, land?: Bundesland): boolean {
  return feiertagSetDE(parseISODate(iso).getUTCFullYear(), land).has(iso);
}

/** Werktag DE = Montag–Freitag, kein allgemeiner Feiertag am Wirkungsort.
 *  (§ 193 BGB zählt den Sonnabend ausdrücklich als fristschonenden Tag.) */
export function istWerktagDE(iso: string, land?: Bundesland): boolean {
  const wd = parseISODate(iso).getUTCDay();
  return wd >= 1 && wd <= 5 && !istFeiertagDE(iso, land);
}

export function naechsterWerktagDE(iso: string, land?: Bundesland): string {
  let d = addDays(iso, 1);
  while (!istWerktagDE(d, land)) d = addDays(d, 1);
  return d;
}

export function vorigerWerktagDE(iso: string, land?: Bundesland): string {
  let d = addDays(iso, -1);
  while (!istWerktagDE(d, land)) d = addDays(d, -1);
  return d;
}

// ── Zustellfiktionen DE ─────────────────────────────────────

/**
 * § 174 ZPO i.V.m. § 4 ERVG — elektronische Zustellung (beA):
 * gilt am Tag nach dem Bereitstellen als zugestellt; ist dieser Tag oder
 * der Bereitstellungstag ein Sonnabend, gilt das Dokument erst am
 * nächsten Werktag als zugestellt.
 */
export function zustellungBea(bereitgestelltIso: string, land?: Bundesland): string {
  const naechster = addDays(bereitgestelltIso, 1);
  const wdBereit = parseISODate(bereitgestelltIso).getUTCDay();
  const wdNaechster = parseISODate(naechster).getUTCDay();
  if (wdBereit === 6 || wdNaechster === 6) {
    // Sonnabend im Spiel → nächster Werktag
    let d = naechster;
    while (!istWerktagDE(d, land)) d = addDays(d, 1);
    return d;
  }
  return naechster;
}

/**
 * § 181 ZPO — Ersatzzustellung durch Ablage: die Zustellung gilt mit dem
 * Tag der Bekanntgabe als bewirkt (nicht mit Ablauf der Abholfrist).
 */
export function zustellungErsatzDE(bekanntgabeIso: string): string {
  return bekanntgabeIso;
}

// ── Fristberechnung ─────────────────────────────────────────

export type FristRegimeDE = "zpo" | "stpo" | "vwgo" | "vwvfg" | "materiell";

export interface BerechneFristDEOpts {
  /** Fristauslösendes Ereignis (idR Zustellung/Zugang), ISO-Datum. */
  ausloeser: string;
  dauer: FristDauer;
  regime: FristRegimeDE;
  /** Bundesland für die Feiertagsberechnung (§ 193 BGB). Ohne Angabe
   *  werden nur bundesweite Feiertage berücksichtigt. */
  bundesland?: Bundesland;
  /** § 187 Abs. 2 BGB: Frist beginnt mit Beginn des Tages, in den das
   *  Ereignis fällt → Ereignistag WIRD mitgerechnet. Default: false. */
  tagesbeginn?: boolean;
  /** § 199 BGB: Jahresendverjährung — Frist endet 31.12. des Jahres, in
   *  dem die Frist begann (+ Regelfrist). Nur für regime "materiell". */
  jahresendverjaehrung?: boolean;
  /** Vorfrist in Tagen vor dem Fristende (Default 7). */
  vorfristTage?: number;
}

export interface FristErgebnisDE {
  /** Erster Tag des Fristenlaufs (bei § 187 Abs. 2 = Ereignistag selbst). */
  fristbeginn: string;
  /** Rechnerisches Fristende VOR End-Tag-Verschiebung. */
  fristendeRoh: string;
  /** Maßgebliches Fristende nach § 193 BGB. */
  fristende: string;
  /** Kanzlei-Vorfrist (auf den davorliegenden Werktag gezogen). */
  vorfrist: string;
  kalendertage: number;
  bundesland?: Bundesland;
  hinweise: string[];
}

/** § 188 Abs. 2/3 BGB — Endeterminierung für Wochen-/Monatsfristen:
 *  der Tag der letzten Woche/des letzten Monats, der dem Anfangstag
 *  durch Benennung oder Zahl entspricht; fehlt er → letzter Monatstag. */
function fristendeRohDE(fristbeginn: string, dauer: FristDauer): string {
  let d = fristbeginn;
  const tage = (dauer.tage ?? 0) + (dauer.wochen ?? 0) * 7;
  if (tage > 0) d = addDays(d, tage - 1); // Anfangstag zählt mit
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

/** § 193 BGB — fällt das Fristende auf Sonntag, allgemeinen Feiertag oder
 *  Sonnabend, endet die Frist erst am nächsten Werktag. */
function schiebeEndTagDE(iso: string, land: Bundesland | undefined, hinweise: string[]): string {
  let d = iso;
  while (!istWerktagDE(d, land)) d = addDays(d, 1);
  if (d !== iso) {
    hinweise.push(
      `Fristende ${iso} fällt auf Sonnabend/Sonntag/allgemeinen Feiertag — ` +
        `verschoben auf ${d} (§ 193 BGB)`
    );
  }
  return d;
}

/**
 * Kernfunktion DE: berechnet das maßgebliche Fristende nach §§ 187–193 BGB.
 * Deutsche Notfristen werden nicht durch Ferien gehemmt (kein § 222-Äquivalent).
 */
export function berechneFristDE(opts: BerechneFristDEOpts): FristErgebnisDE {
  const hinweise: string[] = [];
  const land = opts.bundesland;
  parseISODate(opts.ausloeser); // validate

  // § 187 BGB Fristbeginn
  const fristbeginn = opts.tagesbeginn ? opts.ausloeser : addDays(opts.ausloeser, 1);
  hinweise.push(
    opts.tagesbeginn
      ? "Ereignistag zählt mit (§ 187 Abs. 2 BGB — Fristbeginn bei Tagesbeginn)"
      : "Ereignistag zählt nicht mit (§ 187 Abs. 1 BGB)"
  );

  let roh = fristendeRohDE(fristbeginn, opts.dauer);
  if (roh === fristbeginn && !opts.jahresendverjaehrung) {
    throw new Error("frist-engine-de: dauer must specify at least one of tage/wochen/monate/jahre");
  }

  // § 199 Abs. 1 BGB — Jahresendverjährung
  if (opts.jahresendverjaehrung) {
    const jahr = parseISODate(opts.ausloeser).getUTCFullYear();
    const ende = `${jahr + (opts.dauer.jahre ?? 3)}-12-31`;
    roh = ende;
    hinweise.push(
      `Regelmäßige Verjährung endet mit Ablauf des Kalenderjahres → ${ende} (§ 199 Abs. 1 BGB)`
    );
  }

  const fristende = schiebeEndTagDE(roh, land, hinweise);

  const vorfristTage = opts.vorfristTage ?? 7;
  let vorfrist = addDays(fristende, -vorfristTage);
  if (!istWerktagDE(vorfrist, land)) vorfrist = vorigerWerktagDE(vorfrist, land);

  return {
    fristbeginn,
    fristendeRoh: roh,
    fristende,
    vorfrist,
    kalendertage: daysBetween(fristbeginn, fristende),
    bundesland: land,
    hinweise,
  };
}

// ── Fristarten-Registry DE ──────────────────────────────────

export interface FristArtDE {
  key: string;
  bezeichnung: string;
  dauer: FristDauer;
  regime: FristRegimeDE;
  rechtsgrundlage: string;
  /** Notfrist (nicht erstreckbar, § 555a ZPO). */
  notfrist: boolean;
  /** § 187 Abs. 2 BGB anwendbar (Fristbeginn bei Tagesbeginn). */
  tagesbeginn?: boolean;
  /** § 199 BGB Jahresendverjährung. */
  jahresendverjaehrung?: boolean;
  verfahrenstyp: "zivil" | "straf" | "verwaltungsrecht" | "alle";
  hinweis?: string;
}

export const FRISTEN_REGISTRY_DE: readonly FristArtDE[] = [
  // ── ZPO ──
  {
    key: "klageerwiderung_de",
    bezeichnung: "Klageerwiderung (Verteidigungsanzeige)",
    dauer: { wochen: 2 },
    regime: "zpo",
    rechtsgrundlage: "§ 275 Abs. 1 ZPO",
    notfrist: false,
    verfahrenstyp: "zivil",
    hinweis: "Mindestens 2 Wochen; gerichtlich verlängerbar",
  },
  {
    key: "widerspruch_mahnbescheid_de",
    bezeichnung: "Widerspruch gegen Mahnbescheid",
    dauer: { wochen: 2 },
    regime: "zpo",
    rechtsgrundlage: "§ 692 Abs. 1 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "einspruch_vollstreckungsbescheid_de",
    bezeichnung: "Einspruch gegen Vollstreckungsbescheid",
    dauer: { wochen: 2 },
    regime: "zpo",
    rechtsgrundlage: "§ 700 Abs. 1 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "einspruch_versaeumungsurteil_de",
    bezeichnung: "Einspruch gegen Versäumungsurteil",
    dauer: { wochen: 2 },
    regime: "zpo",
    rechtsgrundlage: "§ 339 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "berufung_de",
    bezeichnung: "Berufung",
    dauer: { monate: 1 },
    regime: "zpo",
    rechtsgrundlage: "§ 517 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "berufungsbegruendung_de",
    bezeichnung: "Berufungsbegründung",
    dauer: { monate: 1 },
    regime: "zpo",
    rechtsgrundlage: "§ 520 Abs. 2 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
    hinweis: "Frist ab Zustellung des Urteils; verlängerbar bis +1 Monat",
  },
  {
    key: "berufungserwiderung_de",
    bezeichnung: "Berufungserwiderung",
    dauer: { monate: 2 },
    regime: "zpo",
    rechtsgrundlage: "§ 520 Abs. 3 ZPO",
    notfrist: false,
    verfahrenstyp: "zivil",
  },
  {
    key: "revision_de",
    bezeichnung: "Revision",
    dauer: { monate: 1 },
    regime: "zpo",
    rechtsgrundlage: "§ 552 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "revisionsbegruendung_de",
    bezeichnung: "Revisionsbegründung",
    dauer: { monate: 1 },
    regime: "zpo",
    rechtsgrundlage: "§ 553 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "sofortige_beschwerde_de",
    bezeichnung: "Sofortige Beschwerde",
    dauer: { wochen: 2 },
    regime: "zpo",
    rechtsgrundlage: "§ 569 Abs. 1 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
  },
  {
    key: "wiedereinsetzung_de",
    bezeichnung: "Wiedereinsetzung in den vorigen Stand",
    dauer: { wochen: 2 },
    regime: "zpo",
    rechtsgrundlage: "§ 233 Abs. 2 ZPO",
    notfrist: true,
    verfahrenstyp: "zivil",
    hinweis: "Frist ab Wegfall des Hindernisses",
  },
  // ── StPO ──
  {
    key: "einspruch_strafbefehl_de",
    bezeichnung: "Einspruch gegen Strafbefehl",
    dauer: { wochen: 2 },
    regime: "stpo",
    rechtsgrundlage: "§ 410 Abs. 1 StPO",
    notfrist: true,
    verfahrenstyp: "straf",
  },
  {
    key: "berufung_stpo_de",
    bezeichnung: "Berufung (Strafverfahren)",
    dauer: { wochen: 1 },
    regime: "stpo",
    rechtsgrundlage: "§ 314 Abs. 1 StPO",
    notfrist: true,
    verfahrenstyp: "straf",
  },
  {
    key: "revision_stpo_de",
    bezeichnung: "Revision (Strafverfahren)",
    dauer: { wochen: 1 },
    regime: "stpo",
    rechtsgrundlage: "§ 341 Abs. 1 StPO",
    notfrist: true,
    verfahrenstyp: "straf",
  },
  {
    key: "sofortige_beschwerde_stpo_de",
    bezeichnung: "Sofortige Beschwerde (Strafverfahren)",
    dauer: { wochen: 1 },
    regime: "stpo",
    rechtsgrundlage: "§ 311 Abs. 2 StPO",
    notfrist: true,
    verfahrenstyp: "straf",
  },
  // ── VwGO / VwVfG ──
  {
    key: "widerspruch_vwvfg_de",
    bezeichnung: "Widerspruch",
    dauer: { monate: 1 },
    regime: "vwvfg",
    rechtsgrundlage: "§ 70 Abs. 1 VwGO",
    notfrist: true,
    verfahrenstyp: "verwaltungsrecht",
  },
  {
    key: "klage_vwgo_de",
    bezeichnung: "Klagefrist (Anfechtungs-/Verpflichtungsklage)",
    dauer: { monate: 1 },
    regime: "vwgo",
    rechtsgrundlage: "§ 74 Abs. 1 VwGO",
    notfrist: true,
    verfahrenstyp: "verwaltungsrecht",
  },
  {
    key: "beschwerde_vwgo_de",
    bezeichnung: "Beschwerde (VwGO)",
    dauer: { wochen: 2 },
    regime: "vwgo",
    rechtsgrundlage: "§ 147 Abs. 2 VwGO",
    notfrist: true,
    verfahrenstyp: "verwaltungsrecht",
  },
  // ── Materiellrechtlich ──
  {
    key: "verjaehrung_regelmaessig_de",
    bezeichnung: "Regelmäßige Verjährungsfrist",
    dauer: { jahre: 3 },
    regime: "materiell",
    rechtsgrundlage: "§§ 195, 199 BGB",
    notfrist: false,
    jahresendverjaehrung: true,
    verfahrenstyp: "alle",
    hinweis: "Endet 31.12. des Jahres von Entstehung + Kenntnis",
  },
];

export function fristArtDE(key: string): FristArtDE | undefined {
  return FRISTEN_REGISTRY_DE.find((f) => f.key === key);
}

/** Bequemlichkeits-API: Frist aus der Registry berechnen. */
export function berechneFristArtDE(
  key: string,
  ausloeser: string,
  bundesland?: Bundesland,
  vorfristTage?: number
): FristErgebnisDE {
  const art = fristArtDE(key);
  if (!art) throw new Error(`frist-engine-de: unknown fristArt "${key}"`);
  return berechneFristDE({
    ausloeser,
    dauer: art.dauer,
    regime: art.regime,
    bundesland,
    tagesbeginn: art.tagesbeginn,
    jahresendverjaehrung: art.jahresendverjaehrung,
    vorfristTage,
  });
}
