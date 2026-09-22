// Allgemeine Honorar-Kriterien (AHK) — Beträge aus dem amtlichen ÖRAK-Volltext,
// selbst gelesen (nicht aus einer Zusammenfassung übernommen) am 22.09.2026.
// Keine Satzung/Verordnung wie das RATG, sondern eine berufsrechtliche
// Richtlinie der ÖRAK-Vertreterversammlung (§ 37 Abs 1 Z 4 RAO) — von der
// Rechtsprechung als "kodifiziertes Sachverständigengutachten ohne
// normativen Charakter" eingeordnet. Greift dort, wo das RATG keine
// natürliche Bemessungsgrundlage liefert (§ 5, 2. Teil) sowie in Straf- und
// Disziplinarsachen (§ 9 ff., 3. Teil).

export const AHK_SOURCE = {
  statute: "Allgemeine Honorar-Kriterien (AHK)",
  issuer:
    "Vertreterversammlung des Österreichischen Rechtsanwaltskammertages (ÖRAK), § 37 Abs 1 Z 4 RAO",
  version: "Stand: 01.10.2024 (Beschluss vom 26.09.2024, kundgemacht 30.09.2024)",
  url: "https://www.oerak.at/fileadmin/user_upload/Gesetzestexte/AHK/AHK_01102024.pdf",
  retrievedAt: "2026-09-22",
} as const;

/**
 * § 6 Abs 3 iVm Abs 3a AHK: ein VPI-gekoppelter Zuschlag auf die nach RATG
 * berechnete AHK-Gesamtentlohnung (2. und 4. Teil), unabhängig von der
 * eigenen Valorisierung des RATG (BGBl. II Nr. 131/2023). Der ÖRAK
 * veröffentlicht ihn unangekündigt neu, sobald sich der VPI seit der
 * letzten Anpassung um mehr als 5 % geändert hat (§ 6 Abs 3) — es gibt
 * keinen festen Kalender. AKTUELL WERT: aus der amtlichen Mitteilung vom
 * 16.12.2024 selbst gelesen ("Der Zuschlag zum RATG in der derzeit
 * geltenden Fassung beträgt umgerechnet nach § 6 Abs 3a AHK 12,09 %"), am
 * 22.09.2026 gegen die Kundmachungs-Liste (oerak.at/kammer/kundmachungen/
 * oerak/) geprüft — keine neuere Mitteilung vorhanden. Da unser RATG-Modul
 * (ratg-tariff-data.ts) bereits die valorisierte Fassung (BGBl. II Nr.
 * 131/2023) abbildet, ist DIESER Prozentsatz der richtige (nicht die
 * 34,5 %, die sich auf die RATG-Fassung vom 01.01.2016 beziehen).
 *
 * VOR JEDEM RELEASE NEU PRÜFEN — kein "set and forget", genau wie RATG_TARIFF_SOURCE.
 */
export const AHK_SURCHARGE = {
  percent: 12.09,
  basis: "§ 6 Abs 3a AHK, umgerechnet auf RATG in der derzeit geltenden (valorisierten) Fassung",
  effectiveFrom: "2025-01-01",
  announcedAt: "2024-12-16",
  announcementUrl:
    "https://www.oerak.at/fileadmin/user_upload/Kundmachungen/OERAK/AHK_AHR/20241216_Mitteilung_des_OERAK.pdf",
  checkUrl: "https://www.oerak.at/kammer/kundmachungen/oerak/",
} as const;

/**
 * § 5 AHK: Bemessungsgrundlagen für Zivil- und Verwaltungssachen, für die
 * das RATG keinen natürlichen Streitwert liefert. Jeder Eintrag ist der
 * "sonst"-Fallbetrag (z. B. § 5 Z 4 Bausachen: "geringfügige 9 300 Euro,
 * mittlere 34 600 Euro, Großprojekte 286 700 Euro" — als drei Varianten
 * abgebildet); wo das Gesetz stattdessen primär einen individuellen Wert
 * nennt (z. B. "der Wert des Vermögens"), steht das im `primary`-Hinweis,
 * und der Betrag hier ist nur der Ersatzwert, wenn dieser Wert nicht
 * feststellbar ist. Das Bemessungsgrundlage-Feld im Rechner bleibt frei
 * editierbar — diese Liste befüllt es nur mit einem sinnvollen Vorschlag.
 */
export interface AhkBemessungsgrundlage {
  key: string;
  label: string;
  amount: number;
  /** Primäre Bemessung laut Gesetz, falls abweichend vom "sonst"-Betrag. */
  primary?: string;
  norm: string;
}

export const AHK_BEMESSUNGSGRUNDLAGEN: AhkBemessungsgrundlage[] = [
  { key: "abgaben", label: "Abgabensachen (sonst)", amount: 5500, norm: "§ 5 Z 1 lit d" },
  {
    key: "adoption",
    label: "Adoptionssachen",
    amount: 9300,
    primary: "Wert des Vermögens des Annehmenden",
    norm: "§ 5 Z 2",
  },
  {
    key: "agrar",
    label: "Agrarsachen",
    amount: 17300,
    primary: "dreifacher Jahresbetrag bzw. Verkehrswert des Rechts",
    norm: "§ 5 Z 3",
  },
  { key: "bau_geringfuegig", label: "Bausachen, geringfügig", amount: 9300, norm: "§ 5 Z 4 lit a" },
  { key: "bau_mittel", label: "Bausachen, mittel", amount: 34600, norm: "§ 5 Z 4 lit b" },
  {
    key: "bau_grossprojekt",
    label: "Bausachen, Großprojekt",
    amount: 286700,
    norm: "§ 5 Z 4 lit c",
  },
  { key: "bergrecht", label: "Bergrechtssachen", amount: 57000, norm: "§ 5 Z 5" },
  {
    key: "bestand_geschaeft",
    label: "Bestandsachen, Geschäftsräumlichkeiten",
    amount: 17300,
    primary: "dreifacher Jahresbestandzins",
    norm: "§ 5 Z 6 lit a",
  },
  {
    key: "bestand_wohnung_klein",
    label: "Bestandsachen, Wohnung bis 3 Räume",
    amount: 9300,
    norm: "§ 5 Z 6 lit b",
  },
  {
    key: "bestand_wohnung_sonst",
    label: "Bestandsachen, sonstige Wohnung",
    amount: 14000,
    norm: "§ 5 Z 6 lit c",
  },
  {
    key: "dienstbarkeit",
    label: "Dienstbarkeits- und Reallastsachen",
    amount: 9300,
    primary: "dreifacher Jahresbetrag bzw. Verkehrswert des Rechts",
    norm: "§ 5 Z 7",
  },
  {
    key: "dienstrecht",
    label: "Dienstrechtssachen (ohne Disziplinarsachen)",
    amount: 0,
    primary: "drei Jahresbezüge — kein Ersatzwert, muss individuell berechnet werden",
    norm: "§ 5 Z 8",
  },
  { key: "elektrizitaet", label: "Elektrizitätssachen", amount: 17300, norm: "§ 5 Z 9" },
  {
    key: "enteignung",
    label: "Enteignungssachen (sonst)",
    amount: 5500,
    primary: "geltend gemachter Entschädigungsbetrag",
    norm: "§ 5 Z 10",
  },
  {
    key: "fischerei",
    label: "Fischereisachen (sonst)",
    amount: 17300,
    primary: "dreifacher Jahrespachtzins",
    norm: "§ 5 Z 11",
  },
  {
    key: "forst_baeuerlich",
    label: "Forstrechtssachen, bäuerlicher Umfang",
    amount: 17300,
    norm: "§ 5 Z 12 lit a",
  },
  {
    key: "forst_grosswald",
    label: "Forstrechtssachen, Großwaldbesitz",
    amount: 172700,
    norm: "§ 5 Z 12 lit b",
  },
  {
    key: "gewerbe_klein",
    label: "Gewerbesachen, Kleinbetrieb",
    amount: 17300,
    norm: "§ 5 Z 13 lit a",
  },
  {
    key: "gewerbe_mittel",
    label: "Gewerbesachen, mittlerer Betrieb",
    amount: 57000,
    norm: "§ 5 Z 13 lit b",
  },
  {
    key: "gewerbe_groesser",
    label: "Gewerbesachen, größerer Betrieb",
    amount: 114000,
    norm: "§ 5 Z 13 lit c",
  },
  {
    key: "gewerbe_gross",
    label: "Gewerbesachen, Großbetrieb",
    amount: 286700,
    norm: "§ 5 Z 13 lit d",
  },
  {
    key: "immaterialgueter",
    label: "Gewerblicher Rechtsschutz und Immaterialgüterrecht",
    amount: 57000,
    norm: "§ 5 Z 14",
  },
  {
    key: "grenzberichtigung",
    label: "Grenzberichtigungs- und -erneuerungssachen (sonst)",
    amount: 7200,
    primary: "Wert der strittigen Fläche",
    norm: "§ 5 Z 15",
  },
  {
    key: "insolvenz",
    label: "Insolvenzsachen (Vertretung des Schuldners, sonst)",
    amount: 17300,
    primary: "Erfüllungserfordernis bzw. zu verteilendes Vermögen",
    norm: "§ 5 Z 16",
  },
  {
    key: "jagdrecht",
    label: "Jagdrechtssachen (sonst)",
    amount: 34600,
    primary: "dreifacher Jahrespachtzins",
    norm: "§ 5 Z 17",
  },
  {
    key: "kartell_bagatell",
    label: "Kartellsachen, Bagatellkartell/Vertriebsbindung",
    amount: 57000,
    norm: "§ 5 Z 18 lit a",
  },
  { key: "kartell_sonst", label: "Kartellsachen (sonst)", amount: 229700, norm: "§ 5 Z 18 lit b" },
  {
    key: "kfg_fuehrerschein",
    label: "KFG- und Führerscheinsachen",
    amount: 14000,
    norm: "§ 5 Z 19",
  },
  {
    key: "letztwillig",
    label: "Letztwillige Verfügungen (sonst)",
    amount: 7200,
    primary: "Wert des verfügten Vermögens",
    norm: "§ 5 Z 20",
  },
  {
    key: "medien_gericht",
    label: "Mediensachen, Gerichte/Kommissionen und Entgegnungen",
    amount: 0,
    primary: "Honoraransprüche gemäß § 9 Abs 1 Z 2 und § 10 AHK",
    norm: "§ 5 Z 22 lit a",
  },
  {
    key: "medien_verwaltung",
    label: "Mediensachen, Verwaltungsbehörden",
    amount: 0,
    primary: "Honoraransprüche gemäß § 9 Abs 1 Z 1 und § 10 AHK",
    norm: "§ 5 Z 22 lit b",
  },
  { key: "personenstand", label: "Personenstandsachen", amount: 14000, norm: "§ 5 Z 23" },
  {
    key: "pflegschaft",
    label: "Pflegschaftssachen (ohne Unterhaltssachen)",
    amount: 7200,
    norm: "§ 5 Z 24",
  },
  {
    key: "erwachsenenvertretung",
    label: "Erwachsenenvertretung (sonst)",
    amount: 9300,
    primary: "Wert des betroffenen Vermögens",
    norm: "§ 5 Z 25",
  },
  {
    key: "staatsbuergerschaft",
    label: "Staatsbürgerschaftssachen",
    amount: 14000,
    norm: "§ 5 Z 26",
  },
  {
    key: "todeserklaerung",
    label: "Todeserklärungssachen (sonst)",
    amount: 9300,
    primary: "Wert des Vermögens des für tot zu Erklärenden",
    norm: "§ 5 Z 27",
  },
  {
    key: "umweltschutz_gross",
    label: "Umweltschutzsachen, Großanlagen",
    amount: 57000,
    norm: "§ 5 Z 28 lit a",
  },
  {
    key: "umweltschutz_sonst",
    label: "Umweltschutzsachen (sonst)",
    amount: 17300,
    norm: "§ 5 Z 28 lit b",
  },
  {
    key: "urheberrecht",
    label: "Urheber- und Verlagsrechtssachen",
    amount: 57000,
    norm: "§ 5 Z 29",
  },
  {
    key: "verein",
    label: "Vereinssachen (sonst)",
    amount: 14000,
    primary: "Wert des Vermögens",
    norm: "§ 5 Z 30",
  },
  { key: "wasserrecht", label: "Wasserrechtssachen", amount: 17300, norm: "§ 5 Z 32" },
  {
    key: "wohnungseigentum",
    label: "Wohnungseigentumssachen (sonst)",
    amount: 9300,
    primary: "dreifacher Jahresbetrag bei wiederkehrenden Leistungen",
    norm: "§ 5 Z 33 lit b",
  },
  {
    key: "sonstige_einfach",
    label: "Sonstige Zivil-/Verwaltungssache, sehr einfach",
    amount: 5500,
    norm: "§ 5 Z 34 lit a",
  },
  {
    key: "sonstige_allgemein",
    label: "Sonstige Zivil-/Verwaltungssache, im Allgemeinen",
    amount: 21200,
    norm: "§ 5 Z 34 lit b",
  },
  {
    key: "sonstige_weittragend",
    label: "Sonstige Zivil-/Verwaltungssache, weittragende Bedeutung",
    amount: 55500,
    norm: "§ 5 Z 34 lit c",
  },
  {
    key: "verwaltungsgericht_zwang",
    label: "Unmittelbare verwaltungsbehördliche Befehls- und Zwangsgewalt, Fremdenpolizeigesetz",
    amount: 34600,
    norm: "§ 5 Z 35",
  },
  { key: "patientenverfuegung", label: "Patientenverfügungen", amount: 21200, norm: "§ 5 Z 36" },
  {
    key: "vorsorgevollmacht",
    label: "Vorsorgevollmachten (sonst)",
    amount: 21200,
    primary: "Wert des Vermögens",
    norm: "§ 5 Z 37",
  },
];

/**
 * § 7 Abs 1 AHK: Streitgenossenzuschlag in Zivil-/Verwaltungssachen —
 * wortgleich zu § 15 RATG (siehe streitgenossenPercent in ratg.ts), hier
 * als eigene Konstante geführt, weil AHK § 7 die eigene Rechtsgrundlage
 * ist, nicht RATG § 15.
 */
export const AHK_STREITGENOSSEN_BASIS = 10;
export const AHK_STREITGENOSSEN_JE_WEITERE = 5;
export const AHK_STREITGENOSSEN_MAX = 50;

/** § 10 Abs 3 AHK: Streitgenossenzuschlag in Strafsachen, je weitere verteidigte Partei. */
export const AHK_STREITGENOSSEN_STRAFSACHE_PROZENT = 30;

/** § 12 AHK: Erfolgszuschlag in Strafsachen, bis zu diesem Höchstsatz. */
export const AHK_ERFOLGSZUSCHLAG_MAX_PROZENT = 50;

/** § 16 AHK: Zuschlag für Leistungen zwischen 20 und 8 Uhr, Sa/So/Feiertag. */
export const AHK_NACHT_WOCHENENDE_ZUSCHLAG_PROZENT = 100;

/** § 17 Abs 2 AHK: Barauslage je sicherer elektronischer Nachricht. */
export const AHK_SICHERE_NACHRICHT_EURO = 0.5;

// ── § 9 Abs 1: Straf- und Disziplinarsachen, feste Honoraransätze ─────────
//
// Fünf Verfahrensarten, je mit Hauptverhandlung (erste/weitere halbe
// Stunde) und, wo das Gesetz sie vorsieht, Berufung/Nichtigkeitsbeschwerde
// als fixe Pauschale. Nur die in § 9 Abs 1 genannten Positionen; sonstige
// Strafsachen laufen über § 10 (RATG-Anwendung, siehe AHK_TP10_BEMESSUNG).

export type AhkStrafVerfahren =
  | "bezirksgericht"
  | "einzelrichter_gerichtshof"
  | "schoeffengericht"
  | "geschworenengericht"
  | "haftverfahren";

export interface AhkStrafPosition {
  key: string;
  label: string;
  /** Feste Pauschale (kein Halbe-Stunde-Satz). */
  amount?: number;
  /** Erste halbe Stunde; jede weitere halbe Stunde kostet `weitere`. */
  ersteHalbeStunde?: number;
  weitereHalbeStunde?: number;
  norm: string;
}

export const AHK_STRAF_VERFAHREN_LABEL: Record<AhkStrafVerfahren, string> = {
  bezirksgericht: "Bezirksgerichtliches Verfahren",
  einzelrichter_gerichtshof: "Einzelrichterliches Verfahren des Gerichtshofes",
  schoeffengericht: "Schöffengerichtliches Verfahren",
  geschworenengericht: "Geschworenengerichtliches Verfahren",
  haftverfahren: "Haftverfahren",
};

export const AHK_STRAF_POSITIONEN: Record<AhkStrafVerfahren, AhkStrafPosition[]> = {
  bezirksgericht: [
    {
      key: "hauptverhandlung",
      label: "Hauptverhandlung 1. Instanz",
      ersteHalbeStunde: 238,
      weitereHalbeStunde: 119,
      norm: "§ 9 Abs 1 Z 1 lit a",
    },
    {
      key: "berufung_voll",
      label: "Volle Berufung + Gegenausführung",
      amount: 714,
      norm: "§ 9 Abs 1 Z 1 lit b",
    },
    {
      key: "berufung_strafe",
      label: "Berufung nur wegen Strafe + Gegenausführung",
      amount: 352,
      norm: "§ 9 Abs 1 Z 1 lit c",
    },
    {
      key: "berufungsverhandlung_voll",
      label: "Berufungsverhandlung (volle Berufung)",
      ersteHalbeStunde: 468,
      weitereHalbeStunde: 234,
      norm: "§ 9 Abs 1 Z 1 lit d",
    },
    {
      key: "berufungsverhandlung_strafe",
      label: "Berufungsverhandlung (nur wegen Strafe)",
      ersteHalbeStunde: 352,
      weitereHalbeStunde: 176,
      norm: "§ 9 Abs 1 Z 1 lit e",
    },
  ],
  einzelrichter_gerichtshof: [
    {
      key: "hauptverhandlung",
      label: "Hauptverhandlung 1. Instanz",
      ersteHalbeStunde: 396,
      weitereHalbeStunde: 198,
      norm: "§ 9 Abs 1 Z 2 lit a",
    },
    {
      key: "berufung_voll",
      label: "Volle Berufung + Gegenausführung",
      amount: 1188,
      norm: "§ 9 Abs 1 Z 2 lit b",
    },
    {
      key: "berufung_strafe",
      label: "Berufung nur wegen Strafe + Gegenausführung",
      amount: 590,
      norm: "§ 9 Abs 1 Z 2 lit c",
    },
    {
      key: "berufungsverhandlung_voll",
      label: "Berufungsverhandlung (volle Berufung)",
      ersteHalbeStunde: 786,
      weitereHalbeStunde: 393,
      norm: "§ 9 Abs 1 Z 2 lit d",
    },
    {
      key: "berufungsverhandlung_strafe",
      label: "Berufungsverhandlung (nur wegen Strafe)",
      ersteHalbeStunde: 590,
      weitereHalbeStunde: 295,
      norm: "§ 9 Abs 1 Z 2 lit e",
    },
  ],
  schoeffengericht: [
    {
      key: "hauptverhandlung",
      label: "Hauptverhandlung 1. Instanz",
      ersteHalbeStunde: 540,
      weitereHalbeStunde: 270,
      norm: "§ 9 Abs 1 Z 3 lit a",
    },
    {
      key: "berufung",
      label: "Berufung + Gegenausführung",
      amount: 808,
      norm: "§ 9 Abs 1 Z 3 lit b",
    },
    {
      key: "berufungsverhandlung",
      label: "Berufungsverhandlung",
      ersteHalbeStunde: 808,
      weitereHalbeStunde: 404,
      norm: "§ 9 Abs 1 Z 3 lit c",
    },
    {
      key: "nichtigkeitsbeschwerde",
      label: "Nichtigkeitsbeschwerde + Gegenausführung",
      amount: 1620,
      norm: "§ 9 Abs 1 Z 3 lit d",
    },
    {
      key: "gerichtstag_nichtigkeit",
      label: "Gerichtstag über Nichtigkeitsbeschwerde",
      ersteHalbeStunde: 1076,
      weitereHalbeStunde: 538,
      norm: "§ 9 Abs 1 Z 3 lit e",
    },
  ],
  geschworenengericht: [
    {
      key: "hauptverhandlung",
      label: "Hauptverhandlung 1. Instanz",
      ersteHalbeStunde: 620,
      weitereHalbeStunde: 310,
      norm: "§ 9 Abs 1 Z 4 lit a",
    },
    {
      key: "berufung",
      label: "Berufung + Gegenausführung",
      amount: 928,
      norm: "§ 9 Abs 1 Z 4 lit b",
    },
    {
      key: "berufungsverhandlung",
      label: "Berufungsverhandlung",
      ersteHalbeStunde: 928,
      weitereHalbeStunde: 464,
      norm: "§ 9 Abs 1 Z 4 lit c",
    },
    {
      key: "nichtigkeitsbeschwerde",
      label: "Nichtigkeitsbeschwerde + Gegenausführung",
      amount: 1860,
      norm: "§ 9 Abs 1 Z 4 lit d",
    },
    {
      key: "gerichtstag_nichtigkeit",
      label: "Gerichtstag über Nichtigkeitsbeschwerde",
      ersteHalbeStunde: 1236,
      weitereHalbeStunde: 618,
      norm: "§ 9 Abs 1 Z 4 lit e",
    },
  ],
  haftverfahren: [
    {
      key: "verhandlung_1instanz",
      label: "Verhandlung 1. Instanz",
      ersteHalbeStunde: 364,
      weitereHalbeStunde: 182,
      norm: "§ 9 Abs 1 Z 5 lit a",
    },
    {
      key: "grundrechtsbeschwerde",
      label: "Grundrechtsbeschwerde",
      amount: 786,
      norm: "§ 9 Abs 1 Z 5 lit b",
    },
    {
      key: "sonstige_beschwerde",
      label: "Sonstige Beschwerde",
      amount: 564,
      norm: "§ 9 Abs 1 Z 5 lit b",
    },
    {
      key: "verhandlung_2instanz",
      label: "Verhandlung 2. Instanz",
      ersteHalbeStunde: 564,
      weitereHalbeStunde: 282,
      norm: "§ 9 Abs 1 Z 5 lit c",
    },
  ],
};

/**
 * § 9 Abs 2: 20 % Zuschlag, wenn im Schöffen- oder Geschworenenverfahren
 * (Abs 1 Z 3/Z 4) gleichzeitig mit der Nichtigkeitsbeschwerde auch
 * Berufung erhoben wird — betrifft die Positionen "berufungsverhandlung"
 * und "gerichtstag_nichtigkeit" (lit d und e) dieser beiden Verfahren.
 */
export const AHK_NICHTIGKEIT_UND_BERUFUNG_ZUSCHLAG_PROZENT = 20;

/**
 * § 10 Abs 1: Bemessungsgrundlagen für sonstige Strafsachen (nicht in § 9
 * genannt) — RATG TP 1-3 und 5-9 werden sinngemäß auf diese
 * Ersatzstreitwerte angewendet, zuzüglich des § 6 Abs 3-Zuschlags.
 */
export const AHK_TP10_BEMESSUNGSGRUNDLAGEN: Record<AhkStrafVerfahren | "unbestimmbar", number> = {
  bezirksgericht: 7800,
  einzelrichter_gerichtshof: 18000,
  schoeffengericht: 27600,
  geschworenengericht: 33200,
  haftverfahren: 33200, // § 10 Abs 1 Z 5: "entsprechend Z 1 bis 4" — Haftverfahren folgt der Instanz des Hauptverfahrens, siehe Hinweis im Rechner.
  unbestimmbar: 18000,
};

/**
 * § 13 Abs 1: Verwaltungsstrafsachen — die Strafdrohung (Geldstrafen-Obergrenze)
 * bestimmt, welche § 9/§ 10-Kategorie sinngemäß gilt.
 */
export const AHK_VERWALTUNGSSTRAFE_SCHWELLEN = {
  bisEuro: { bezirksgericht: 730, einzelrichter_gerichtshof: 2180, schoeffengericht: 4360 },
} as const;
