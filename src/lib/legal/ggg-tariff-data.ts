// Gerichtsgebührengesetz (GGG) — Beträge aus dem konsolidierten RIS-Volltext,
// selbst gelesen (Fassung vom 22.09.2026, abgerufen 22.09.2026). Alles wird in
// Cent gerechnet, wie im RATG-/AHK-Modul.
//
// Abgedeckt: Tarifpost 1 (Pauschalgebühr zivilgerichtliche Verfahren erster
// Instanz, inkl. der praxisrelevanten Ermäßigungen Anm. 2 halbe Gebühr,
// Anm. 3 Viertel, Anm. 4 halbe) und Tarifpost 2 (Rechtsmittelverfahren zweiter
// Instanz, inkl. Anm. 1a halbe Gebühr für EJ-Verfahren).
//
// NICHT abgedeckt: TP 2a/3 (dritte Instanz), TP 3a (Außerstreit), TP 5
// (Exekution), TP 13 (Eingabengebühren), sozialgerichtliche Zuschläge,
// Anm. 16 (Kfz-Rechtsschutzziel 70 €). Das Ergebnis ist eine Gebührenschätzung,
// die der Anwalt prüft — die Justiz legt die Gebühr im Einzelfall fest.

export const GGG_SOURCE = {
  statute: "Gerichtsgebührengesetz (GGG)",
  version: "BGBl. Nr. 501/1984, konsolidierte Fassung vom 22.09.2026",
  // BGBl. II Nr. 227/2026 ändert die TP-1-Beträge (z. B. 31 → 33 € im
  // untersten Band einer neu bewerteten Stufe) — vor jedem Release gegen
  // die aktuelle konsolidierte Fassung prüfen.
  url: "https://ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002667",
  retrievedAt: "2026-09-22",
  checkNote: "GGG wird regelmäßig valorisiert — Beträge vor Rechnungslegung gegen RIS prüfen.",
} as const;

export interface GggBand {
  /** Upper bound of the dispute value / Berufungsinteresse, in EUR. */
  upTo: number;
  /** Flat fee for this band, in EUR. */
  amount: number;
}

/**
 * Tarifpost 1: Pauschalgebühr für das zivilgerichtliche Verfahren erster
 * Instanz nach dem Wert des Streitgegenstandes. Über 350.000 €: 1,2 % des
 * Streitwerts zuzüglich 4.203 € (Anm. 13).
 */
export const GGG_TP1_BANDS: GggBand[] = [
  { upTo: 150, amount: 25 },
  { upTo: 300, amount: 48 },
  { upTo: 700, amount: 68 },
  { upTo: 2_000, amount: 114 },
  { upTo: 3_500, amount: 182 },
  { upTo: 7_000, amount: 335 },
  { upTo: 35_000, amount: 792 },
  { upTo: 70_000, amount: 1_556 },
  { upTo: 140_000, amount: 3_112 },
  { upTo: 210_000, amount: 4_670 },
  { upTo: 280_000, amount: 6_227 },
  { upTo: 350_000, amount: 7_783 },
];

export const GGG_TP1_OVER_BAND = { percent: 1.2, plus: 4_203 } as const;

/**
 * Tarifpost 2: Pauschalgebühr für das Rechtsmittelverfahren zweiter Instanz
 * nach dem Berufungsinteresse. Über 350.000 €: 1,8 % zuzüglich 6.071 €.
 */
export const GGG_TP2_BANDS: GggBand[] = [
  { upTo: 150, amount: 20 },
  { upTo: 300, amount: 44 },
  { upTo: 700, amount: 75 },
  { upTo: 2_000, amount: 154 },
  { upTo: 3_500, amount: 304 },
  { upTo: 7_000, amount: 609 },
  { upTo: 35_000, amount: 1_219 },
  { upTo: 70_000, amount: 2_288 },
  { upTo: 140_000, amount: 4_579 },
  { upTo: 210_000, amount: 6_867 },
  { upTo: 280_000, amount: 9_156 },
  { upTo: 350_000, amount: 11_446 },
];

export const GGG_TP2_OVER_BAND = { percent: 1.8, plus: 6_071 } as const;

/** Anm. 5 TP 1: Kfz-Rechtsschutzziel (§ 615 ZPO-Verfahren) — Fixgebühr. */
export const GGG_TP1_KFZ_RECHTSSCHUTZ_EURO = 70;
