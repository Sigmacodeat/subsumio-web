// OeNB-Basiszinssatz-Historie für die §-456-UGB-Verzugszinsen.
// Quelle: OeNB „Anknüpfungszinssätze" (oenb.at), abgerufen 22.09.2026.
// Der Satz am ersten Kalendertag eines Halbjahres gilt für das ganze Halbjahr
// (§ 456 UGB) — die Tabelle führt daher je Stichtag 1.1./1.7. den gültigen Satz.

export const VERZUGSZINSEN_SOURCE = {
  statute: "§§ 1000, 1333 ABGB; §§ 456, 458 UGB",
  version: "Basiszinssatz-Historie OeNB, Stand 1. Juli 2026 (1,53 %)",
  url: "https://www.oenb.at/Service/Zins--und-Wechselkurse/Anknuepfungszinssaetze.html",
  retrievedAt: "2026-09-22",
  checkNote:
    "Basiszinssatz ändert sich halbjährlich (1.1./1.7.) — Tabelle vor Verwendung gegen OeNB prüfen.",
} as const;

/** Gesetzlicher Zinssatz für Verbrauchergeschäfte und allgemeine Fälle. */
export const ZINSSATZ_ABGB_PROZENT = 4;

/** § 456 UGB: Aufschlag auf den Basiszinssatz (Unternehmergeschäfte). */
export const UGB_AUFSCHLAG_PROZENTPUNKTE = 9.2;

/** § 458 UGB: Betreibungskostenpauschale je Forderung, in EUR. */
export const UGB_BETREIBUNGSPAUSCHALE_EURO = 40;

export interface BasiszinssatzStichtag {
  /** ISO-Datum des Halbjahres-Stichtags (1.1. oder 1.7.). */
  ab: string;
  /** Basiszinssatz in Prozent. */
  prozent: number;
}

/**
 * OeNB-Tabelle, absteigend sortiert (neuester Stichtag zuerst).
 * Gilt für § 456 UGB (Verträge ab 16.3.2013) — für Altverträge gilt § 352
 * UGB a.F. (Basis + 8 PP), separat zu prüfen.
 */
export const BASISZINSSATZ_HISTORIE: BasiszinssatzStichtag[] = [
  { ab: "2026-07-01", prozent: 1.53 },
  { ab: "2026-01-01", prozent: 1.53 },
  { ab: "2025-07-01", prozent: 1.53 },
  { ab: "2025-01-01", prozent: 2.53 },
  { ab: "2024-07-01", prozent: 3.88 },
  { ab: "2024-01-01", prozent: 3.88 },
  { ab: "2023-07-01", prozent: 3.38 },
  { ab: "2023-01-01", prozent: 1.88 },
  { ab: "2022-07-01", prozent: -0.62 },
  { ab: "2022-01-01", prozent: -0.62 },
  { ab: "2021-07-01", prozent: -0.62 },
  { ab: "2021-01-01", prozent: -0.62 },
  { ab: "2020-07-01", prozent: -0.62 },
  { ab: "2020-01-01", prozent: -0.62 },
  { ab: "2019-07-01", prozent: -0.62 },
  { ab: "2019-01-01", prozent: -0.62 },
  { ab: "2018-07-01", prozent: -0.62 },
  { ab: "2018-01-01", prozent: -0.62 },
  { ab: "2017-07-01", prozent: -0.62 },
  { ab: "2017-01-01", prozent: -0.62 },
  { ab: "2016-07-01", prozent: -0.62 },
  { ab: "2016-01-01", prozent: -0.12 },
  { ab: "2015-07-01", prozent: -0.12 },
  { ab: "2015-01-01", prozent: -0.12 },
  { ab: "2014-07-01", prozent: -0.12 },
  { ab: "2014-01-01", prozent: -0.12 },
  { ab: "2013-07-01", prozent: -0.12 },
  { ab: "2013-01-01", prozent: 0.38 },
];
