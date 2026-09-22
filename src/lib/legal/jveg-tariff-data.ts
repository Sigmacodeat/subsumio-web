// Justizvergütungs- und -entschädigungsgesetz (JVEG) — Sätze aus dem
// amtlichen Volltext (gesetze-im-internet.de, Fassung nach KostRMoG,
// abgerufen 22.09.2026). Alles wird in Cent/EUR-Dezimal gerechnet.

export const JVEG_SOURCE = {
  statute: "Justizvergütungs- und -entschädigungsgesetz (JVEG)",
  version: "JVEG v. 5.5.2004 (BGBl. I S. 718), Fassung i.d.F. KostRMoG",
  url: "https://www.gesetze-im-internet.de/jveg/",
  retrievedAt: "2026-09-22",
  checkNote:
    "JVEG-Sätze werden gelegentlich angepasst — vor Rechnungslegung gegen die aktuelle Fassung prüfen.",
} as const;

/** § 20 JVEG: Entschädigung für Zeitversäumnis (Zeugen), EUR/Stunde. */
export const JVEG_ZEITVERSAEUMNIS_PRO_STUNDE = 4;

/** § 21 JVEG: Nachteile bei der Haushaltsführung, EUR/Stunde. */
export const JVEG_HAUSHALTSFUEHRUNG_PRO_STUNDE = 14;

/** § 22 JVEG: Verdienstausfall — regelmäßiger Bruttoverdienst, gedeckelt. */
export const JVEG_VERDIENSTAUSFALL_MAX_PRO_STUNDE = 25;

/** § 19 Abs. 2 JVEG analog: maximal 10 Stunden pro Tag; letzte begonnene
 *  Stunde wird voll gerechnet. */
export const JVEG_MAX_STUNDEN_PRO_TAG = 10;

/** § 5 Abs. 2 JVEG: Fahrtkostenersatz bei Benutzung eines Kraftwagens,
 *  EUR/km. */
export const JVEG_FAHRKOSTEN_KFZ_PRO_KM = 0.42;

/**
 * § 9 Abs. 1 JVEG i.V.m. Anlage 1 — Honorargruppen für Sachverständige,
 * Stundensätze in EUR.
 */
export const JVEG_HONORARGRUPPEN: ReadonlyArray<{ gruppe: string; satz: number }> = [
  { gruppe: "M1", satz: 75 },
  { gruppe: "M2", satz: 80 },
  { gruppe: "M3", satz: 85 },
  { gruppe: "M4", satz: 90 },
  { gruppe: "M5", satz: 95 },
  { gruppe: "M6", satz: 100 },
  { gruppe: "M7", satz: 105 },
  { gruppe: "M8", satz: 110 },
  { gruppe: "M9", satz: 115 },
  { gruppe: "M10", satz: 125 },
  { gruppe: "M11", satz: 135 },
  { gruppe: "M12", satz: 145 },
  { gruppe: "M13", satz: 160 },
];

/** § 12 JVEG: Auslagenpauschale des Sachverständigen — 10 % des Honorars,
 *  höchstens 75 € (nur statt des Ersatzes nach § 7). */
export const JVEG_AUSLAGENPAUSCHALE_SATZ = 0.1;
export const JVEG_AUSLAGENPAUSCHALE_MAX = 75;
