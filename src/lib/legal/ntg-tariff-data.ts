// Notariatstarifgesetz (NTG) — Wertgebührenstaffel nach Anl. 1 Z 1
// (zweiseitige Rechtsgeschäfte, § 18 Abs 1) in der valorisierten Fassung der
// Zuschlagsfestsetzung, aus dem konsolidierten RIS-Volltext gelesen
// (Fassung vom 03.03.2026, abgerufen 22.09.2026). Alles in Cent.
//
// Abgedeckt: § 18 Abs 1 (volle Wertgebühr), die gesetzliche Halbierung für
// § 18 Abs 2 (gesetzlich vorgeschriebene Form), § 19 (Darlehen/Belehnung)
// und § 20 (einseitige Erklärungen), sowie die Zeitgebühr § 26 iVm § 6.
//
// NICHT abgedeckt: § 21ff. Spezialtarife (Treuehandschaft, Verwahrung,
// Protest), § 25 Beglaubigungs-Fixgebühren, §§ 29–34 Schreib-/Abschriften-
// gebühren, Gerichtskommissionstarif (GKT). Ergebnis ist eine Kostenschätzung
// für Mandanten — der Notar legt die Gebühr verbindlich fest.

export const NTG_SOURCE = {
  statute: "Notariatstarifgesetz (NTG)",
  version:
    "BGBl. Nr. 576/1973, konsolidierte Fassung vom 03.03.2026; Gebührenbeträge valorisiert durch Zuschlagsfestsetzung (Anl. 1)",
  url: "https://ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10002267",
  retrievedAt: "2026-09-22",
  checkNote:
    "NTG-Gebühren werden periodisch valorisiert — Beträge vor Verwendung gegen RIS prüfen.",
} as const;

export interface NtgFlatBand {
  /** Inclusive upper bound of the Bemessungsgrundlage, in EUR. */
  upTo: number;
  /** Fee in EUR. */
  amount: number;
}

export interface NtgProgressiveBand {
  /** Lower bound (exclusive) in EUR. */
  from: number;
  /** Upper bound (inclusive) in EUR, null = open-ended. */
  to: number | null;
  /** Slice width in EUR — fee increases per each *started* slice. */
  slice: number;
  /** Fee increment per started slice, in EUR. */
  perSlice: number;
}

/** Anl. 1 Z 1: Flatfee-Einstieg. */
export const NTG_FLAT_BANDS: NtgFlatBand[] = [
  { upTo: 70, amount: 9.2 },
  { upTo: 150, amount: 18.2 },
];

/**
 * Anl. 1 Z 1: „für je angefangene weitere X Euro um Y Euro mehr" —
 * progressive Scheibenstaffel ab 150 € Bemessungsgrundlage.
 */
export const NTG_PROGRESSIVE_BANDS: NtgProgressiveBand[] = [
  { from: 150, to: 1_090, slice: 70, perSlice: 5.3 },
  { from: 1_090, to: 2_180, slice: 180, perSlice: 15.6 },
  { from: 2_180, to: 4_360, slice: 360, perSlice: 23 },
  { from: 4_360, to: 7_270, slice: 730, perSlice: 38.6 },
  { from: 7_270, to: 21_800, slice: 1_820, perSlice: 48.4 },
  { from: 21_800, to: 72_670, slice: 3_630, perSlice: 58.1 },
  { from: 72_670, to: 363_360, slice: 7_270, perSlice: 116.2 },
  { from: 363_360, to: 726_730, slice: 36_340, perSlice: 116.2 },
  { from: 726_730, to: null, slice: 72_670, perSlice: 116.2 },
];

/**
 * Anl. 1 Z 1 Schlussziffer: über 726.730 € steigt die Gebühr je angefangene
 * weitere 72.670 € um 116,20 €, „jedoch nie mehr, als einer
 * Bemessungsgrundlage von 3.633.640 Euro entspräche".
 */
export const NTG_BASIS_CAP_EURO = 3_633_640;

/** § 26: Zeitgebühr je angefangene halbe Stunde, in EUR (valorisiert). */
export const NTG_ZEITGEBUEHR_HALBE_STUNDE_EURO = 12.9;
