/**
 * kosten-at.ts — Deterministic Austrian litigation cost calculator (Gap C).
 *
 * Replaces the LLM's "Gerichtskosten: 1–3% des Streitwerts" estimation with
 * exact, table-driven computation:
 *
 *   - GGG Pauschalgebühren (Tarifpost 1–3: 1./2./3. Instanz Zivilverfahren)
 *   - RATG Tarifposten (TP 1, 2, 3A) nach Bemessungsgrundlage
 *   - Einheitssatz § 23 RATG (60% / 50%; doppelt im Rechtsmittelverfahren)
 *   - ERV-Zuschlag § 23a RATG (verfahrenseinleitend € 4,10 / sonst € 2,10)
 *   - Streitgenossenzuschlag § 15 RATG (+10% je weitere Person, max +50%)
 *   - Umsatzsteuer 20%
 *   - Verfahrenskosten-Schätzung pro Instanz + Kostenrisiko-Matrix
 *   - Kostenersatzquote nach § 43 ZPO (Quotenkompensation)
 *
 * IMPORTANT: tariff values change with BGBl amendments. All tables live ONCE
 * here (same philosophy as the canonical model-pricing table), carry a
 * `TARIF_STAND` marker, and every result echoes that marker so downstream
 * consumers (cost-benefit layer, Kostenverzeichnis draft, settlement BATNA)
 * can surface "Tarifstand prüfen" to the attorney. Update values here only.
 *
 * The LLM layers INTERPRET these numbers; they never re-compute them.
 */

/** Tariff table revision marker — bump when updating values after a BGBl amendment. */
export const TARIF_STAND = "2024";

// ── GGG: Gerichtsgebühren (Pauschalgebühren Zivilverfahren) ──

export interface TarifStufe {
  /** Obergrenze des Streitwerts (inklusive), Infinity für die letzte Stufe. */
  bis: number;
  /** Pauschalgebühr in EUR; für die letzte Stufe: Grundbetrag. */
  gebuehr: number;
  /** Nur letzte Stufe: zusätzlicher Prozentsatz vom Streitwert. */
  prozent?: number;
}

/** GGG TP 1 — Zivilverfahren 1. Instanz (Stand: siehe TARIF_STAND). */
export const GGG_TP1: TarifStufe[] = [
  { bis: 150, gebuehr: 25 },
  { bis: 300, gebuehr: 48 },
  { bis: 700, gebuehr: 68 },
  { bis: 2_000, gebuehr: 114 },
  { bis: 3_500, gebuehr: 182 },
  { bis: 7_000, gebuehr: 335 },
  { bis: 35_000, gebuehr: 792 },
  { bis: 70_000, gebuehr: 1_556 },
  { bis: 140_000, gebuehr: 3_112 },
  { bis: 210_000, gebuehr: 4_670 },
  { bis: 280_000, gebuehr: 6_227 },
  { bis: 350_000, gebuehr: 7_783 },
  { bis: Infinity, gebuehr: 4_203, prozent: 1.2 },
];

/** GGG TP 2 — Berufungsverfahren (2. Instanz). */
export const GGG_TP2: TarifStufe[] = [
  { bis: 150, gebuehr: 18 },
  { bis: 300, gebuehr: 39 },
  { bis: 700, gebuehr: 62 },
  { bis: 2_000, gebuehr: 152 },
  { bis: 3_500, gebuehr: 261 },
  { bis: 7_000, gebuehr: 484 },
  { bis: 35_000, gebuehr: 1_120 },
  { bis: 70_000, gebuehr: 2_240 },
  { bis: 140_000, gebuehr: 4_480 },
  { bis: 210_000, gebuehr: 6_726 },
  { bis: 280_000, gebuehr: 8_965 },
  { bis: 350_000, gebuehr: 11_207 },
  { bis: Infinity, gebuehr: 6_051, prozent: 1.8 },
];

/** GGG TP 3 — Revisionsverfahren (3. Instanz). */
export const GGG_TP3: TarifStufe[] = [
  { bis: 150, gebuehr: 23 },
  { bis: 300, gebuehr: 52 },
  { bis: 700, gebuehr: 82 },
  { bis: 2_000, gebuehr: 203 },
  { bis: 3_500, gebuehr: 348 },
  { bis: 7_000, gebuehr: 645 },
  { bis: 35_000, gebuehr: 1_493 },
  { bis: 70_000, gebuehr: 2_987 },
  { bis: 140_000, gebuehr: 5_973 },
  { bis: 210_000, gebuehr: 8_968 },
  { bis: 280_000, gebuehr: 11_953 },
  { bis: 350_000, gebuehr: 14_943 },
  { bis: Infinity, gebuehr: 8_069, prozent: 2.4 },
];

export type Instanz = 1 | 2 | 3;

function lookupStufe(tabelle: TarifStufe[], streitwert: number): TarifStufe {
  for (const stufe of tabelle) {
    if (streitwert <= stufe.bis) return stufe;
  }
  return tabelle[tabelle.length - 1]!;
}

/**
 * Pauschalgebühr (GGG) für ein Zivilverfahren.
 * Arbeits- und Sozialrechtssachen: 1. Instanz gebührenfrei (§ 16 GGG-Befreiung
 * bzw. ASGG) — via `arbeitsrecht` flag.
 */
export function gerichtsgebuehr(
  streitwert: number,
  instanz: Instanz,
  opts?: { arbeitsrecht?: boolean }
): { betrag: number; tarifpost: string; tarif_stand: string } {
  if (!(streitwert >= 0)) throw new Error("kosten-at: streitwert must be >= 0");
  if (opts?.arbeitsrecht && instanz === 1) {
    return { betrag: 0, tarifpost: "GGG TP 1 (ASG: gebührenfrei 1. Instanz)", tarif_stand: TARIF_STAND };
  }
  const tabelle = instanz === 1 ? GGG_TP1 : instanz === 2 ? GGG_TP2 : GGG_TP3;
  const stufe = lookupStufe(tabelle, streitwert);
  const betrag =
    stufe.prozent != null
      ? Math.round((stufe.gebuehr + (streitwert * stufe.prozent) / 100) * 100) / 100
      : stufe.gebuehr;
  return { betrag, tarifpost: `GGG TP ${instanz}`, tarif_stand: TARIF_STAND };
}

// ── RATG: Rechtsanwaltstarif ────────────────────────────────

/**
 * RATG-Verdienstansätze nach Bemessungsgrundlage (Stand: siehe TARIF_STAND).
 * TP 3A: Klagen, Klagebeantwortungen, vorbereitende Schriftsätze,
 *        Verhandlungen (je begonnene Stunde ab der 2.: 50% Zuschlag).
 * TP 2:  einfache Schriftsätze (Mahnklage, Urgenzen, Fristansuchen).
 * TP 1:  kurze Mitteilungen, Vollmachtsbekanntgabe.
 */
export interface RatgStufe {
  bis: number;
  tp1: number;
  tp2: number;
  tp3a: number;
}

export const RATG_STUFEN: RatgStufe[] = [
  { bis: 730, tp1: 12.1, tp2: 23.8, tp3a: 47.9 },
  { bis: 1_450, tp1: 23.8, tp2: 47.9, tp3a: 95.5 },
  { bis: 2_180, tp1: 35.9, tp2: 71.7, tp3a: 143.4 },
  { bis: 2_910, tp1: 47.9, tp2: 95.5, tp3a: 191.2 },
  { bis: 3_630, tp1: 59.8, tp2: 119.4, tp3a: 239.1 },
  { bis: 4_360, tp1: 71.7, tp2: 143.4, tp3a: 287.0 },
  { bis: 5_090, tp1: 83.6, tp2: 167.3, tp3a: 334.9 },
  { bis: 5_810, tp1: 95.5, tp2: 191.2, tp3a: 382.8 },
  { bis: 7_270, tp1: 107.6, tp2: 215.2, tp3a: 430.7 },
  { bis: 8_720, tp1: 119.4, tp2: 239.1, tp3a: 478.4 },
  { bis: 10_170, tp1: 131.5, tp2: 263.0, tp3a: 526.3 },
  { bis: 11_630, tp1: 143.4, tp2: 287.0, tp3a: 574.2 },
  { bis: 14_540, tp1: 155.4, tp2: 310.9, tp3a: 622.1 },
  { bis: 21_800, tp1: 179.3, tp2: 358.7, tp3a: 717.8 },
  { bis: 29_070, tp1: 203.1, tp2: 406.5, tp3a: 813.4 },
  { bis: 36_340, tp1: 227.0, tp2: 454.4, tp3a: 909.2 },
  { bis: 43_600, tp1: 250.9, tp2: 502.2, tp3a: 1_004.9 },
  { bis: 50_870, tp1: 274.8, tp2: 550.1, tp3a: 1_100.6 },
  { bis: 58_140, tp1: 298.7, tp2: 597.9, tp3a: 1_196.3 },
  { bis: 65_410, tp1: 322.6, tp2: 645.8, tp3a: 1_292.0 },
  { bis: 72_670, tp1: 346.4, tp2: 693.6, tp3a: 1_387.7 },
  // Darüber: je angefangene weitere 21.800 € Bemessungsgrundlage erhöhen
  // sich die Ansätze (vereinfacht linear fortgeschrieben, § 13 RATG-Systematik).
];

const RATG_INCREMENT_BASE = 72_670;
const RATG_INCREMENT_STEP = 21_800;
const RATG_INCREMENT = { tp1: 47.9, tp2: 95.5, tp3a: 191.2 };

export type Tarifpost = "TP1" | "TP2" | "TP3A";

/** Verdienstansatz (ohne Einheitssatz/Zuschläge/USt) für eine einzelne Leistung. */
export function ratgAnsatz(bemessungsgrundlage: number, tp: Tarifpost): number {
  if (!(bemessungsgrundlage >= 0)) throw new Error("kosten-at: bemessungsgrundlage must be >= 0");
  const key = tp === "TP1" ? "tp1" : tp === "TP2" ? "tp2" : "tp3a";
  const last = RATG_STUFEN[RATG_STUFEN.length - 1]!;
  if (bemessungsgrundlage <= last.bis) {
    for (const stufe of RATG_STUFEN) {
      if (bemessungsgrundlage <= stufe.bis) return stufe[key];
    }
  }
  const steps = Math.ceil((bemessungsgrundlage - RATG_INCREMENT_BASE) / RATG_INCREMENT_STEP);
  return Math.round((last[key] + steps * RATG_INCREMENT[key]) * 100) / 100;
}

export interface LeistungOpts {
  bemessungsgrundlage: number;
  tarifpost: Tarifpost;
  /** § 23 RATG Einheitssatz anwenden (Default true). */
  einheitssatz?: boolean;
  /** Rechtsmittelverfahren: doppelter Einheitssatz (§ 23 Abs 9 RATG). */
  rechtsmittel?: boolean;
  /** § 23a RATG ERV-Zuschlag: 'einleitend' (€ 4,10) | 'folgend' (€ 2,10) | 'keiner'. */
  erv?: "einleitend" | "folgend" | "keiner";
  /** Anzahl der vertretenen Personen (§ 15 RATG: +10% je weitere, max +50%). */
  personen?: number;
  /** Verhandlung: Gesamtdauer in begonnenen Stunden (TP 3A: 1. Stunde voll,
   *  jede weitere begonnene Stunde 50% des Ansatzes). */
  verhandlungsstunden?: number;
  /** USt-Satz (Default 0.20). */
  ustSatz?: number;
}

export interface LeistungErgebnis {
  ansatz: number;
  einheitssatz: number;
  streitgenossenzuschlag: number;
  ervZuschlag: number;
  nettoSumme: number;
  ust: number;
  bruttoSumme: number;
  tarif_stand: string;
  aufschluesselung: string[];
}

/** § 23 RATG: Einheitssatz 60% bis € 10.170 Bemessungsgrundlage, darüber 50%. */
export function einheitssatzProzent(bemessungsgrundlage: number, rechtsmittel = false): number {
  const basis = bemessungsgrundlage <= 10_170 ? 60 : 50;
  return rechtsmittel ? basis * 2 : basis;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Vollständige Kostennote-Zeile für EINE anwaltliche Leistung nach RATG. */
export function berechneLeistung(opts: LeistungOpts): LeistungErgebnis {
  const aufschluesselung: string[] = [];
  let ansatz = ratgAnsatz(opts.bemessungsgrundlage, opts.tarifpost);

  // Verhandlungsdauer: 1. Stunde = voller Ansatz, jede weitere begonnene
  // Stunde = +50% des Ansatzes (TP 3A II RATG).
  if (opts.verhandlungsstunden && opts.verhandlungsstunden > 1) {
    const weitere = Math.ceil(opts.verhandlungsstunden) - 1;
    const zuschlag = round2(weitere * ansatz * 0.5);
    aufschluesselung.push(
      `Verhandlung ${Math.ceil(opts.verhandlungsstunden)} Std: Ansatz + ${weitere} × 50%`
    );
    ansatz = round2(ansatz + zuschlag);
  }
  aufschluesselung.push(`${opts.tarifpost} Ansatz (BMG € ${opts.bemessungsgrundlage.toLocaleString("de-AT")}): € ${ansatz.toFixed(2)}`);

  let einheitssatz = 0;
  if (opts.einheitssatz !== false) {
    const pct = einheitssatzProzent(opts.bemessungsgrundlage, opts.rechtsmittel === true);
    einheitssatz = round2((ansatz * pct) / 100);
    aufschluesselung.push(`Einheitssatz ${pct}% (§ 23 RATG): € ${einheitssatz.toFixed(2)}`);
  }

  let streitgenossenzuschlag = 0;
  const personen = opts.personen ?? 1;
  if (personen > 1) {
    const pct = Math.min((personen - 1) * 10, 50);
    streitgenossenzuschlag = round2(((ansatz + einheitssatz) * pct) / 100);
    aufschluesselung.push(`Streitgenossenzuschlag ${pct}% (§ 15 RATG): € ${streitgenossenzuschlag.toFixed(2)}`);
  }

  let ervZuschlag = 0;
  if (opts.erv === "einleitend") {
    ervZuschlag = 4.1;
    aufschluesselung.push("ERV-Zuschlag verfahrenseinleitend (§ 23a RATG): € 4,10");
  } else if (opts.erv === "folgend") {
    ervZuschlag = 2.1;
    aufschluesselung.push("ERV-Zuschlag (§ 23a RATG): € 2,10");
  }

  const nettoSumme = round2(ansatz + einheitssatz + streitgenossenzuschlag + ervZuschlag);
  const ustSatz = opts.ustSatz ?? 0.2;
  const ust = round2(nettoSumme * ustSatz);
  const bruttoSumme = round2(nettoSumme + ust);
  aufschluesselung.push(`USt ${Math.round(ustSatz * 100)}%: € ${ust.toFixed(2)}`);

  return {
    ansatz,
    einheitssatz,
    streitgenossenzuschlag,
    ervZuschlag,
    nettoSumme,
    ust,
    bruttoSumme,
    tarif_stand: TARIF_STAND,
    aufschluesselung,
  };
}

// ── Verfahrenskosten-Schätzung + Kostenrisiko ───────────────

export interface VerfahrenskostenOpts {
  streitwert: number;
  /** Wie viele Instanzen einkalkulieren (Default 1). */
  instanzen?: Instanz;
  /** Zahl der Verhandlungen 1. Instanz (Default 2). */
  verhandlungen?: number;
  /** Durchschnittliche Verhandlungsdauer in Stunden (Default 2). */
  verhandlungsstunden?: number;
  /** Zahl der vorbereitenden Schriftsätze zusätzlich zur Klage (Default 2). */
  schriftsaetze?: number;
  arbeitsrecht?: boolean;
  /** Vertretene Personen. */
  personen?: number;
}

export interface InstanzKosten {
  instanz: Instanz;
  gerichtsgebuehr: number;
  eigenanwalt: number;
  gegneranwalt: number;
  summe: number;
}

export interface VerfahrenskostenErgebnis {
  streitwert: number;
  proInstanz: InstanzKosten[];
  gesamtEigen: number;
  gesamtGegner: number;
  gesamtGericht: number;
  /** Worst Case: eigene + gegnerische Kosten + Gerichtsgebühren. */
  kostenrisikoGesamt: number;
  tarif_stand: string;
  hinweise: string[];
}

/**
 * Schätzt die Verfahrenskosten pro Instanz deterministisch aus den Tarifen.
 * Annahme Kostengleichheit beider Seiten (Standardfall Anwaltsprozess).
 */
export function schaetzeVerfahrenskosten(opts: VerfahrenskostenOpts): VerfahrenskostenErgebnis {
  const sw = opts.streitwert;
  if (!(sw >= 0)) throw new Error("kosten-at: streitwert must be >= 0");
  const instanzen = opts.instanzen ?? 1;
  const hinweise: string[] = [`Tarifstand ${TARIF_STAND} — Werte vor Verrechnung prüfen`];
  const proInstanz: InstanzKosten[] = [];

  for (let i = 1 as Instanz; i <= instanzen; i = (i + 1) as Instanz) {
    const gg = gerichtsgebuehr(sw, i, { arbeitsrecht: opts.arbeitsrecht }).betrag;
    let anwalt = 0;
    if (i === 1) {
      // Klage/Klagebeantwortung (TP 3A, einleitend)
      anwalt += berechneLeistung({
        bemessungsgrundlage: sw,
        tarifpost: "TP3A",
        erv: "einleitend",
        personen: opts.personen,
      }).nettoSumme;
      // Vorbereitende Schriftsätze
      const anzahl = opts.schriftsaetze ?? 2;
      for (let s = 0; s < anzahl; s++) {
        anwalt += berechneLeistung({
          bemessungsgrundlage: sw,
          tarifpost: "TP3A",
          erv: "folgend",
          personen: opts.personen,
        }).nettoSumme;
      }
      // Verhandlungen
      const verh = opts.verhandlungen ?? 2;
      for (let v = 0; v < verh; v++) {
        anwalt += berechneLeistung({
          bemessungsgrundlage: sw,
          tarifpost: "TP3A",
          verhandlungsstunden: opts.verhandlungsstunden ?? 2,
          erv: "keiner",
          personen: opts.personen,
        }).nettoSumme;
      }
    } else {
      // Rechtsmittelschrift + Rechtsmittelbeantwortung-Risiko (doppelter ES)
      anwalt += berechneLeistung({
        bemessungsgrundlage: sw,
        tarifpost: "TP3A",
        rechtsmittel: true,
        erv: "einleitend",
        personen: opts.personen,
      }).nettoSumme;
      // Eine Rechtsmittelverhandlung (2. Instanz häufig, 3. selten — konservativ)
      if (i === 2) {
        anwalt += berechneLeistung({
          bemessungsgrundlage: sw,
          tarifpost: "TP3A",
          verhandlungsstunden: 1,
          rechtsmittel: true,
          erv: "keiner",
          personen: opts.personen,
        }).nettoSumme;
      }
    }
    anwalt = round2(anwalt);
    proInstanz.push({
      instanz: i,
      gerichtsgebuehr: gg,
      eigenanwalt: anwalt,
      gegneranwalt: anwalt,
      summe: round2(gg + anwalt * 2),
    });
    if (i >= instanzen) break;
  }

  const gesamtEigen = round2(proInstanz.reduce((s, k) => s + k.eigenanwalt, 0));
  const gesamtGegner = round2(proInstanz.reduce((s, k) => s + k.gegneranwalt, 0));
  const gesamtGericht = round2(proInstanz.reduce((s, k) => s + k.gerichtsgebuehr, 0));
  return {
    streitwert: sw,
    proInstanz,
    gesamtEigen,
    gesamtGegner,
    gesamtGericht,
    kostenrisikoGesamt: round2(gesamtEigen + gesamtGegner + gesamtGericht),
    tarif_stand: TARIF_STAND,
    hinweise,
  };
}

// ── § 43 ZPO Kostenersatz (Quotenkompensation) ──────────────

export interface KostenersatzErgebnis {
  /** Obsiegensquote des Mandanten (0–1). */
  quote: number;
  /** Ersatzquote nach § 43 Abs 1 ZPO: (2×Quote − 1). Positiv = Mandant erhält Ersatz. */
  ersatzquote: number;
  /** EUR-Betrag: positiv = Mandant bekommt, negativ = Mandant zahlt Gegnerkosten. */
  anwaltskostenersatz: number;
  /** Gerichtsgebühren-Ersatz (idR nach Obsiegensquote). */
  gerichtsgebuehrenersatz: number;
  regel: string;
}

/**
 * § 43 ZPO: Bei teilweisem Obsiegen werden die Anwaltskosten quotenkompensiert —
 * der Ersatzanspruch beträgt (Obsiegensquote − Unterliegensquote) der eigenen
 * Kosten; Gerichtsgebühren werden im Verhältnis des Obsiegens ersetzt.
 * Volles Obsiegen (§ 41 ZPO) bzw. geringfügiges Unterliegen (§ 43 Abs 2 ZPO,
 * < 10%) → voller Ersatz.
 */
export function kostenersatz(
  quote: number,
  eigeneAnwaltskosten: number,
  gegnerAnwaltskosten: number,
  gerichtsgebuehren: number
): KostenersatzErgebnis {
  if (!(quote >= 0 && quote <= 1)) throw new Error("kosten-at: quote must be within [0,1]");
  if (quote >= 0.9) {
    return {
      quote,
      ersatzquote: 1,
      anwaltskostenersatz: round2(eigeneAnwaltskosten),
      gerichtsgebuehrenersatz: round2(gerichtsgebuehren),
      regel: quote === 1 ? "§ 41 ZPO — voller Kostenersatz" : "§ 43 Abs 2 ZPO — geringfügiges Unterliegen, voller Ersatz",
    };
  }
  if (quote <= 0.1) {
    return {
      quote,
      ersatzquote: -1,
      anwaltskostenersatz: round2(-gegnerAnwaltskosten),
      gerichtsgebuehrenersatz: 0,
      regel: "§ 41 ZPO (spiegelbildlich) — Mandant ersetzt die gegnerischen Kosten voll",
    };
  }
  const ersatzquote = round2(2 * quote - 1);
  const anwaltskostenersatz = round2(
    ersatzquote >= 0 ? eigeneAnwaltskosten * ersatzquote : gegnerAnwaltskosten * ersatzquote
  );
  return {
    quote,
    ersatzquote,
    anwaltskostenersatz,
    gerichtsgebuehrenersatz: round2(gerichtsgebuehren * quote),
    regel: "§ 43 Abs 1 ZPO — Quotenkompensation",
  };
}

// ── Kostenverzeichnis (für den Kostenverzeichnis-Draft) ─────

export interface KostenverzeichnisPosition {
  datum: string;
  leistung: string;
  tarifpost: Tarifpost;
  verhandlungsstunden?: number;
  erv?: "einleitend" | "folgend" | "keiner";
}

export interface Kostenverzeichnis {
  positionen: Array<KostenverzeichnisPosition & LeistungErgebnis>;
  nettoGesamt: number;
  ustGesamt: number;
  barauslagen: number;
  bruttoGesamt: number;
  tarif_stand: string;
}

/** Baut ein RATG-Kostenverzeichnis (Beilage zu jedem Schriftsatz). */
export function baueKostenverzeichnis(
  bemessungsgrundlage: number,
  positionen: KostenverzeichnisPosition[],
  opts?: { personen?: number; barauslagen?: number }
): Kostenverzeichnis {
  const rows = positionen.map((p) => ({
    ...p,
    ...berechneLeistung({
      bemessungsgrundlage,
      tarifpost: p.tarifpost,
      verhandlungsstunden: p.verhandlungsstunden,
      erv: p.erv ?? "keiner",
      personen: opts?.personen,
    }),
  }));
  const nettoGesamt = round2(rows.reduce((s, r) => s + r.nettoSumme, 0));
  const ustGesamt = round2(rows.reduce((s, r) => s + r.ust, 0));
  const barauslagen = round2(opts?.barauslagen ?? 0);
  return {
    positionen: rows,
    nettoGesamt,
    ustGesamt,
    barauslagen,
    bruttoGesamt: round2(nettoGesamt + ustGesamt + barauslagen),
    tarif_stand: TARIF_STAND,
  };
}

/** Markdown-Rendering des Kostenverzeichnisses (für Drafts/Pages). */
export function kostenverzeichnisMarkdown(kv: Kostenverzeichnis): string {
  const lines: string[] = [];
  lines.push("| Datum | Leistung | TP | Netto | USt | Brutto |");
  lines.push("|---|---|---|---:|---:|---:|");
  for (const p of kv.positionen) {
    lines.push(
      `| ${p.datum} | ${p.leistung} | ${p.tarifpost} | € ${p.nettoSumme.toFixed(2)} | € ${p.ust.toFixed(2)} | € ${p.bruttoSumme.toFixed(2)} |`
    );
  }
  lines.push(`| | **Summe** | | **€ ${kv.nettoGesamt.toFixed(2)}** | **€ ${kv.ustGesamt.toFixed(2)}** | **€ ${round2(kv.nettoGesamt + kv.ustGesamt).toFixed(2)}** |`);
  if (kv.barauslagen > 0) {
    lines.push(`| | Barauslagen (GGG etc.) | | | | € ${kv.barauslagen.toFixed(2)} |`);
  }
  lines.push(`| | **Gesamt** | | | | **€ ${kv.bruttoGesamt.toFixed(2)}** |`);
  lines.push("");
  lines.push(`_Tarifstand ${kv.tarif_stand} — Werte vor Verrechnung prüfen._`);
  return lines.join("\n");
}
