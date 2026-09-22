// Gerichtskostengesetz (GKG) — § 34 Stufenformel und Anlage-1-
// Gebührensätze, aus dem amtlichen Volltext (gesetze-im-internet.de,
// Fassung zuletzt geändert durch KostBRÄG 2025, abgerufen 22.09.2026).
// Alles wird in Cent gerechnet, wie im GGG-/RATG-/AHK-Modul.

export const GKG_SOURCE = {
  statute: "Gerichtskostengesetz (GKG)",
  version: "GKG v. 5.5.2004 (BGBl. I S. 718), Fassung i.d.F. KostBRÄG 2025",
  url: "https://www.gesetze-im-internet.de/gkg_2004/",
  retrievedAt: "2026-09-22",
  checkNote:
    "§ 34 GKG-Stufen werden per KostBRÄG angepasst — Beträge vor Rechnungslegung gegen die aktuelle Fassung prüfen.",
} as const;

/**
 * § 34 Abs. 1 GKG — einfache Gebühr (1,0) nach Streitwert.
 * Stufenformel: Grundbetrag 40 € bis 500 €, danach Erhöhung je
 * angefangenem Stufenbetrag.
 */
export const GKG_STUFEN: ReadonlyArray<{
  /** Streitwert-Obergrenze der Stufe, in EUR. */
  bis: number;
  /** Erhöhung je angefangenem Betrag, in EUR. */
  je: number;
  /** Erhöhungsbetrag, in EUR. */
  betrag: number;
}> = [
  { bis: 2_000, je: 500, betrag: 21 },
  { bis: 10_000, je: 1_000, betrag: 22.5 },
  { bis: 25_000, je: 3_000, betrag: 30.5 },
  { bis: 50_000, je: 5_000, betrag: 40.5 },
  { bis: 200_000, je: 15_000, betrag: 140 },
  { bis: 500_000, je: 30_000, betrag: 210 },
  { bis: Infinity, je: 50_000, betrag: 210 },
];

/** Grundgebühr bis 500 € Streitwert (§ 34 Abs. 1 Satz 1 GKG). */
export const GKG_GRUNDBETRAG = 40;

/** Mindestgebühr (§ 34 Abs. 2 GKG), in EUR. */
export const GKG_MINDESTGEBUEHR = 15;

/**
 * Anlage 1 KV GKG — die praxisrelevanten Gebührensätze (Vielfache der
 * einfachen Gebühr).
 */
export const GKG_GEBUEHRENSAETZE = {
  /** KV 1100: Mahnverfahren (Mahnbescheid + Vollstreckungsbescheid). */
  mahnverfahren: { kv: "1100", satz: 0.5, label: "Mahnverfahren (KV 1100)" },
  /** KV 1110: Verfahren auf Erlass einer einstweiligen Anordnung. */
  einstweiligeAnordnung: {
    kv: "1110",
    satz: 1.0,
    label: "Einstweilige Anordnung (KV 1110)",
  },
  /** KV 1210: Verfahren erster Instanz im Allgemeinen. */
  verfahren1Instanz: {
    kv: "1210",
    satz: 3.0,
    label: "Verfahren 1. Instanz (KV 1210)",
  },
  /** KV 1220: Berufungsverfahren. */
  berufung: { kv: "1220", satz: 4.0, label: "Berufung (KV 1220)" },
  /** KV 1230: Revisionsverfahren. */
  revision: { kv: "1230", satz: 5.0, label: "Revision (KV 1230)" },
} as const;

export type GkgGebuehrensatzKey = keyof typeof GKG_GEBUEHRENSAETZE;
