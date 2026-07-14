/**
 * Law-corpus ingestion v1 — Germany + Austria, from OFFICIAL sources only.
 *
 *   bun scripts/ingest-law-corpus.ts [--only stgb,abgb] [--out ../law-corpus]
 *
 * Sources & licensing:
 * - DE: gesetze-im-internet.de XML (Bundesamt für Justiz). Amtliche Werke,
 *   § 5 UrhG — public domain. The XML carries `builddate` = the consolidation
 *   version stamp we persist.
 * - AT: RIS GeltendeFassung (Bundeskanzleramt, OGD). Konsolidierte Fassung
 *   zum Abrufdatum; we stamp the retrieval date as the version anchor and
 *   attribute RIS as required by the OGD terms.
 *
 * Output: one markdown file per law in <out>/{de,at}/, frontmatter-stamped
 * (type: law, jurisdiction, abbreviation, version_date, retrieved_at,
 * source_url, license). Import into a dedicated source afterwards:
 *
 *   gbrain sources add law-de <out>/de && gbrain import <out>/de --source-id law-de
 *   gbrain sources add law-at <out>/at && gbrain import <out>/at --source-id law-at
 *
 * HONESTY SCOPE (mirrors /compare): this gives the brain CITABLE STATUTE
 * TEXT with a version stamp. It is not legal research à la beck-online
 * (no Kommentare, no Rechtsprechungsketten, no editorial consolidation
 * guarantees) and the brain still never computes legal conclusions —
 * answers cite §§ so the professional can verify.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";

// ── Switzerland (Fedlex — admin.ch Open Government Data) ──────────────

interface ChLaw {
  /** Fedlex SR number (e.g. '220' for OR, '311.0' for StGB, '210' for ZGB) */
  srNumber: string;
  abbr: string;
  title: string;
}

interface DeLaw {
  slug: string; // gesetze-im-internet.de/<slug>/xml.zip
  abbr: string;
  title: string;
}

interface AtLaw {
  /** Title term for the RIS BrKons API search query. The Gesetzesnummer is
   *  resolved dynamically (hardcoded numbers proved wrong in testing). */
  searchTitle: string;
  /** Exact RIS Kurztitel to match a result on, when it differs from the search
   *  query term (e.g. query "Gesetz über Gesellschaften mit beschränkter
   *  Haftung" → Kurztitel "GmbH-Gesetz"; query "Aktiengesetz 1965" → "Aktiengesetz").
   *  Defaults to searchTitle. */
  matchTitle?: string;
  abbr: string;
  title: string;
  /** Stable official RIS identity. Prefer this over ambiguous title search. */
  gesetzesnummer?: string;
  /** Explicit corpus filename when abbreviation transliteration is ambiguous. */
  outputFile?: string;
}

// Starter set — the load-bearing codes for our legal + tax verticals.
// Extend deliberately; every entry costs corpus size and sync time.
const DE_LAWS: DeLaw[] = [
  { slug: "gg", abbr: "GG", title: "Grundgesetz für die Bundesrepublik Deutschland" },
  { slug: "bgb", abbr: "BGB", title: "Bürgerliches Gesetzbuch" },
  { slug: "stgb", abbr: "StGB", title: "Strafgesetzbuch" },
  { slug: "zpo", abbr: "ZPO", title: "Zivilprozessordnung" },
  { slug: "stpo", abbr: "StPO", title: "Strafprozeßordnung" },
  { slug: "hgb", abbr: "HGB", title: "Handelsgesetzbuch" },
  { slug: "uwg_2004", abbr: "UWG", title: "Gesetz gegen den unlauteren Wettbewerb" },
  { slug: "ao_1977", abbr: "AO", title: "Abgabenordnung" },
  { slug: "estg", abbr: "EStG", title: "Einkommensteuergesetz" },
  { slug: "ustg_1980", abbr: "UStG", title: "Umsatzsteuergesetz" },
  {
    slug: "famfg",
    abbr: "FamFG",
    title:
      "Gesetz über das Verfahren in Familiensachen und in den Angelegenheiten der freiwilligen Gerichtsbarkeit",
  },
  {
    slug: "gmbhg",
    abbr: "GmbHG",
    title: "Gesetz betreffend die Gesellschaften mit beschränkter Haftung",
  },
  { slug: "inso", abbr: "InsO", title: "Insolvenzordnung" },
  // ── Additional codes for full law-firm coverage ──
  { slug: "rvg", abbr: "RVG", title: "Rechtsanwaltsvergütungsgesetz" },
  { slug: "bdsg_2018", abbr: "BDSG", title: "Bundesdatenschutzgesetz" },
  { slug: "bbaug", abbr: "BauGB", title: "Baugesetzbuch" },
  { slug: "betrvg", abbr: "BetrVG", title: "Betriebsverfassungsgesetz" },
  { slug: "vwgo", abbr: "VwGO", title: "Verwaltungsgerichtsordnung" },
  {
    slug: "zvg",
    abbr: "ZVG",
    title: "Gesetz über die Zwangsversteigerung und die Zwangsverwaltung",
  },
  { slug: "urhg", abbr: "UrhG", title: "Gesetz über Urheberrecht und verwandte Schutzrechte" },
  { slug: "kstg_1977", abbr: "KStG", title: "Körperschaftsteuergesetz" },
  { slug: "gewo", abbr: "GewO", title: "Gewerbeordnung" },
  // ── Tax-specific laws for TAXUMIO ──
  { slug: "gewstg", abbr: "GewStG", title: "Gewerbesteuergesetz" },
  { slug: "erbstg_1974", abbr: "ErbStG", title: "Erbschaftsteuer- und Schenkungsteuergesetz" },
  { slug: "bewg", abbr: "BewG", title: "Bewertungsgesetz" },
  { slug: "stbgebv", abbr: "StBVV", title: "Steuerberatervergütungsverordnung" },
  { slug: "stberg", abbr: "StBerG", title: "Steuerberatungsgesetz" },
  { slug: "lstdv", abbr: "LStDV", title: "Lohnsteuer-Durchführungsverordnung" },
  { slug: "grestg_1983", abbr: "GrEStG", title: "Grunderwerbsteuergesetz" },
  { slug: "ustdv_1980", abbr: "UStDV", title: "Umsatzsteuer-Durchführungsverordnung" },
  { slug: "estdv_1955", abbr: "EStDV", title: "Einkommensteuer-Durchführungsverordnung" },
  { slug: "solzg_1995", abbr: "SolZG", title: "Solidaritätszuschlaggesetz" },
  { slug: "astg", abbr: "AStG", title: "Außensteuergesetz" },
];

const AT_LAWS: AtLaw[] = [
  {
    searchTitle: "Allgemeines bürgerliches Gesetzbuch",
    abbr: "ABGB",
    title: "Allgemeines bürgerliches Gesetzbuch",
  },
  { searchTitle: "Strafgesetzbuch", abbr: "StGB-AT", title: "Strafgesetzbuch (Österreich)" },
  { searchTitle: "Amtshaftungsgesetz", abbr: "AHG", title: "Amtshaftungsgesetz" },
  { searchTitle: "Zivilprozessordnung", abbr: "ZPO-AT", title: "Zivilprozessordnung (Österreich)" },
  { searchTitle: "Unternehmensgesetzbuch", abbr: "UGB", title: "Unternehmensgesetzbuch" },
  { searchTitle: "Bundesabgabenordnung", abbr: "BAO", title: "Bundesabgabenordnung" },
  { searchTitle: "Exekutionsordnung", abbr: "EO", title: "Exekutionsordnung" },
  {
    searchTitle: "Strafprozeßordnung 1975",
    abbr: "StPO-AT",
    title: "Strafprozeßordnung 1975 (Österreich)",
  },
  // Tax (AT-specific — the DE EStG/UStG do NOT apply in Austria).
  {
    searchTitle: "Einkommensteuergesetz 1988",
    abbr: "EStG-AT",
    title: "Einkommensteuergesetz 1988 (Österreich)",
  },
  {
    searchTitle: "Körperschaftsteuergesetz 1988",
    abbr: "KStG-AT",
    title: "Körperschaftsteuergesetz 1988 (Österreich)",
  },
  {
    searchTitle: "Umsatzsteuergesetz 1994",
    abbr: "UStG-AT",
    title: "Umsatzsteuergesetz 1994 (Österreich)",
  },
  // Labour + social insurance.
  {
    searchTitle: "Allgemeines Sozialversicherungsgesetz",
    abbr: "ASVG",
    title: "Allgemeines Sozialversicherungsgesetz",
  },
  { searchTitle: "Arbeitsverfassungsgesetz", abbr: "ArbVG", title: "Arbeitsverfassungsgesetz" },
  { searchTitle: "Angestelltengesetz", abbr: "AngG", title: "Angestelltengesetz" },
  // Consumer + tenancy.
  { searchTitle: "Konsumentenschutzgesetz", abbr: "KSchG", title: "Konsumentenschutzgesetz" },
  { searchTitle: "Mietrechtsgesetz", abbr: "MRG", title: "Mietrechtsgesetz" },
  // Corporate + insolvency.
  {
    searchTitle: "Gesetz über Gesellschaften mit beschränkter Haftung",
    matchTitle: "GmbH-Gesetz",
    abbr: "GmbHG-AT",
    title: "GmbH-Gesetz (Österreich)",
  },
  {
    searchTitle: "Aktiengesetz 1965",
    matchTitle: "Aktiengesetz",
    abbr: "AktG-AT",
    title: "Aktiengesetz (Österreich)",
  },
  { searchTitle: "Insolvenzordnung", abbr: "IO", title: "Insolvenzordnung (Österreich)" },
  // Administrative + traffic + data protection.
  {
    searchTitle: "Allgemeines Verwaltungsverfahrensgesetz 1991",
    abbr: "AVG",
    title: "Allgemeines Verwaltungsverfahrensgesetz 1991",
  },
  {
    searchTitle: "Straßenverkehrsordnung 1960",
    abbr: "StVO-AT",
    title: "Straßenverkehrsordnung 1960 (Österreich)",
  },
  {
    searchTitle: "Datenschutzgesetz",
    matchTitle: "Datenschutzgesetz",
    abbr: "DSG-AT",
    title: "Datenschutzgesetz (Österreich)",
  },
  // ── Additional codes for full law-firm coverage ──
  { searchTitle: "Rechtsanwaltsordnung", abbr: "RAO", title: "Rechtsanwaltsordnung (Österreich)" },
  {
    searchTitle: "Außerstreitgesetz",
    matchTitle: "Außerstreitgesetz",
    abbr: "AußStrG",
    title: "Außerstreitgesetz (Österreich)",
    gesetzesnummer: "20003047",
    outputFile: "au-strg.md",
  },
  {
    searchTitle: "Jurisdiktionsnorm",
    matchTitle: "Jurisdiktionsnorm",
    abbr: "JN",
    title: "Jurisdiktionsnorm (Österreich)",
    gesetzesnummer: "10001697",
    outputFile: "jn.md",
  },
  {
    searchTitle: "Gerichtsorganisationsgesetz",
    abbr: "GOG",
    title: "Gerichtsorganisationsgesetz (Österreich)",
  },
  {
    searchTitle: "Gebührengesetz",
    matchTitle: "Gebührengesetz 1957",
    abbr: "GebG",
    title: "Gebührengesetz (Österreich)",
  },
  {
    searchTitle: "Urheberrechtsgesetz",
    abbr: "UrhG-AT",
    title: "Urheberrechtsgesetz (Österreich)",
  },
  {
    searchTitle: "Markenschutzgesetz",
    matchTitle: "Markenschutzgesetz 1970",
    abbr: "MSchG",
    title: "Markenschutzgesetz (Österreich)",
  },
  { searchTitle: "Kartellgesetz 2005", abbr: "KartG", title: "Kartellgesetz 2005 (Österreich)" },
  { searchTitle: "E-Commerce-Gesetz", abbr: "ECG", title: "E-Commerce-Gesetz (Österreich)" },
  {
    searchTitle: "Telekommunikationsgesetz 2003",
    matchTitle: "Telekommunikationsgesetz 2003",
    abbr: "TKG",
    title: "Telekommunikationsgesetz 2003 (Österreich)",
  },
  {
    searchTitle: "Gewerbeordnung 1994",
    abbr: "GewO-AT",
    title: "Gewerbeordnung 1994 (Österreich)",
  },
  {
    searchTitle: "Wohnungseigentumsgesetz 2002",
    abbr: "WEG",
    title: "Wohnungseigentumsgesetz 2002 (Österreich)",
  },
  {
    searchTitle: "Bundesrätegesetz",
    abbr: "BRagG",
    title: "Bundesrätegesetz (Österreich)",
  },
  {
    searchTitle: "Sicherheitspolizeigesetz",
    matchTitle: "Sicherheitspolizeigesetz",
    abbr: "SPG",
    title: "Sicherheitspolizeigesetz (Österreich)",
  },
  {
    searchTitle: "Beamten-Dienstrechtsgesetz 1979",
    matchTitle: "Beamten-Dienstrechtsgesetz 1979",
    abbr: "BDG",
    title: "Beamten-Dienstrechtsgesetz 1979 (Österreich)",
  },
  // ── Verfassungsrecht ──
  {
    searchTitle: "Bundes-Verfassungsgesetz",
    matchTitle: "Bundes-Verfassungsgesetz",
    abbr: "B-VG",
    title: "Bundes-Verfassungsgesetz (Österreich)",
  },
  // ── Ausländer- & Asylrecht ──
  {
    searchTitle: "Aufenthaltsgesetz",
    matchTitle: "Niederlassungs- und Aufenthaltsgesetz",
    abbr: "AufenthG",
    title: "Niederlassungs- und Aufenthaltsgesetz (Österreich)",
  },
  {
    searchTitle: "Fremdenpolizeigesetz 2005",
    matchTitle: "Fremdenpolizeigesetz 2005",
    abbr: "FPG",
    title: "Fremdenpolizeigesetz 2005 (Österreich)",
  },
  {
    searchTitle: "Asylgesetz 2005",
    matchTitle: "Asylgesetz 2005",
    abbr: "AsylG",
    title: "Asylgesetz 2005 (Österreich)",
  },
  {
    searchTitle: "Staatsbürgerschaftsgesetz 1985",
    matchTitle: "Staatsbürgerschaftsgesetz 1985",
    abbr: "StbG",
    title: "Staatsbürgerschaftsgesetz 1985 (Österreich)",
  },
  {
    searchTitle: "Ausländerbeschäftigungsgesetz",
    matchTitle: "Ausländerbeschäftigungsgesetz",
    abbr: "AuslBG",
    title: "Ausländerbeschäftigungsgesetz (Österreich)",
  },
  // ── Strafrecht ergänzend ──
  {
    searchTitle: "Suchtmittelgesetz",
    matchTitle: "Suchtmittelgesetz",
    abbr: "SMG",
    title: "Suchtmittelgesetz (Österreich)",
  },
  {
    searchTitle: "Waffengesetz",
    matchTitle: "Waffengesetz 1996",
    abbr: "WaffG",
    title: "Waffengesetz 1996 (Österreich)",
  },
  // ── Verwaltungsrecht ──
  {
    searchTitle: "Verwaltungsstrafgesetz 1991",
    matchTitle: "Verwaltungsstrafgesetz 1991",
    abbr: "VStG",
    title: "Verwaltungsstrafgesetz 1991 (Österreich)",
  },
  {
    searchTitle: "Verwaltungsvollstreckungsgesetz 1991",
    matchTitle: "Verwaltungsvollstreckungsgesetz 1991",
    abbr: "VVG",
    title: "Verwaltungsvollstreckungsgesetz 1991 (Österreich)",
  },
  {
    searchTitle: "Zustellgesetz",
    matchTitle: "Zustellgesetz",
    abbr: "ZustG",
    title: "Zustellgesetz (Österreich)",
  },
  // ── Familienrecht ──
  {
    searchTitle: "Ehegesetz",
    matchTitle: "Ehegesetz",
    abbr: "EheG",
    title: "Ehegesetz (Österreich)",
  },
  // ── Gewaltschutz ──
  // Hinweis: Das "Gewaltschutzgesetz 2019" ist kein eigenständiges Gesetz,
  // sondern ein Änderungsbündel (SPG § 38a, StGB, EO etc.). Der Gewaltschutz
  // ist im SPG (§ 38a Betretungs- und Annäherungsverbot) geregelt, das wir
  // bereits im Korpus haben.
  // ── Gleichbehandlung ──
  {
    searchTitle: "Gleichbehandlungsgesetz",
    matchTitle: "Gleichbehandlungsgesetz",
    abbr: "GlbG",
    title: "Gleichbehandlungsgesetz (Österreich)",
  },
  // ── Medienrecht ──
  {
    searchTitle: "Mediengesetz",
    matchTitle: "Mediengesetz",
    abbr: "MedienG",
    title: "Mediengesetz (Österreich)",
  },
  // ── Vergaberecht ──
  {
    searchTitle: "Bundesvergabegesetz 2018",
    matchTitle: "Bundesvergabegesetz 2018",
    abbr: "BVergG",
    title: "Bundesvergabegesetz 2018 (Österreich)",
  },
  // ── Wasserrecht ──
  {
    searchTitle: "Wasserrechtsgesetz 1959",
    matchTitle: "Wasserrechtsgesetz 1959",
    abbr: "WRG",
    title: "Wasserrechtsgesetz 1959 (Österreich)",
  },
  // ── Patentrecht ──
  {
    searchTitle: "Patentgesetz 1970",
    matchTitle: "Patentgesetz 1970",
    abbr: "PatG",
    title: "Patentgesetz 1970 (Österreich)",
  },
  // ── Arbeitslosenversicherung ──
  {
    searchTitle: "Arbeitslosenversicherungsgesetz 1977",
    matchTitle: "Arbeitslosenversicherungsgesetz 1977",
    abbr: "AlVG",
    title: "Arbeitslosenversicherungsgesetz 1977 (Österreich)",
  },
  // ── Bauarbeiterurlaub ──
  {
    searchTitle: "Bauarbeiter-Urlaubs- und Abfertigungsgesetz",
    matchTitle: "Bauarbeiter-Urlaubs- und Abfertigungsgesetz",
    abbr: "BUAG",
    title: "Bauarbeiter-Urlaubs- und Abfertigungsgesetz (Österreich)",
  },
  // ── E-Government ──
  {
    searchTitle: "E-Government-Gesetz",
    matchTitle: "E-Government-Gesetz",
    abbr: "E-GovG",
    title: "E-Government-Gesetz (Österreich)",
  },
  // ── Krankenanstalten ──
  {
    searchTitle: "Krankenanstaltengesetz",
    matchTitle: "Krankenanstalten- und Kuranstaltengesetz",
    abbr: "KAG",
    title: "Krankenanstaltengesetz (Österreich)",
  },
  // ── Arztgesetz ──
  {
    searchTitle: "Ärztegesetz 1998",
    matchTitle: "Ärztegesetz 1998",
    abbr: "ÄrzteG",
    title: "Ärztegesetz 1998 (Österreich)",
  },
  // ── Behindertengesetz ──
  {
    searchTitle: "Bundesbehindertengesetz",
    matchTitle: "Bundesbehindertengesetz",
    abbr: "BBG",
    title: "Bundesbehindertengesetz (Österreich)",
  },
  // ── Forstrecht ──
  {
    searchTitle: "Forstgesetz 1975",
    matchTitle: "Forstgesetz 1975",
    abbr: "ForstG",
    title: "Forstgesetz 1975 (Österreich)",
  },
  // ── Gesundheitsrecht ergänzend ──
  {
    searchTitle: "Epidemiegesetz 1950",
    matchTitle: "Epidemiegesetz 1950",
    abbr: "EpiG",
    title: "Epidemiegesetz 1950 (Österreich)",
  },
  {
    searchTitle: "Arzneimittelgesetz",
    matchTitle: "Arzneimittelgesetz",
    abbr: "AMG",
    title: "Arzneimittelgesetz (Österreich)",
  },
  {
    searchTitle: "Gesundheits- und Krankenpflegegesetz",
    matchTitle: "Gesundheits- und Krankenpflegegesetz",
    abbr: "GuKG",
    title: "Gesundheits- und Krankenpflegegesetz (Österreich)",
  },
  // ── Steuerrecht ergänzend ──
  {
    searchTitle: "Bewertungsgesetz 1955",
    matchTitle: "Bewertungsgesetz 1955",
    abbr: "BewG",
    title: "Bewertungsgesetz 1955 (Österreich)",
  },
  {
    searchTitle: "Grundsteuergesetz 1955",
    matchTitle: "Grundsteuergesetz 1955",
    abbr: "GrStG",
    title: "Grundsteuergesetz 1955 (Österreich)",
  },
  // Hinweis: Vermögensteuergesetz wurde 2005 abgeschafft, Erbschaftsteuergesetz 2008.
  // Gebührentarif ist Teil des Gebührengesetzes 1957 (GebG), das wir bereits haben.
  // Außerstreitgesetz haben wir bereits als au-strg.md.
  {
    searchTitle: "Verbandsverantwortlichkeitsgesetz",
    matchTitle: "Verbandsverantwortlichkeitsgesetz",
    abbr: "VbVG",
    title: "Verbandsverantwortlichkeitsgesetz (Österreich)",
  },
  {
    searchTitle: "Tilgungsgesetz 1972",
    matchTitle: "Tilgungsgesetz 1972",
    abbr: "TilgG",
    title: "Tilgungsgesetz 1972 (Österreich)",
  },
  {
    searchTitle: "Strafregistergesetz 1968",
    matchTitle: "Strafregistergesetz 1968",
    abbr: "StRegG",
    title: "Strafregistergesetz 1968 (Österreich)",
  },
  // ── Jugendrecht ──
  {
    searchTitle: "Jugendgerichtsgesetz 1988",
    matchTitle: "Jugendgerichtsgesetz 1988",
    abbr: "JGG-AT",
    title: "Jugendgerichtsgesetz 1988 (Österreich)",
  },
  // ── Arbeitsrecht ergänzend ──
  {
    searchTitle: "Arbeitszeitgesetz",
    matchTitle: "Arbeitszeitgesetz",
    abbr: "AZG",
    title: "Arbeitszeitgesetz (Österreich)",
  },
  {
    searchTitle: "Mutterschutzgesetz 1979",
    matchTitle: "Mutterschutzgesetz 1979",
    abbr: "MSchG-AT",
    title: "Mutterschutzgesetz 1979 (Österreich)",
  },
  {
    searchTitle: "Väter-Karenzgesetz",
    matchTitle: "Väter-Karenzgesetz",
    abbr: "VKgG",
    title: "Väter-Karenzgesetz (Österreich)",
  },
  {
    searchTitle: "Arbeitsruhegesetz",
    matchTitle: "Arbeitsruhegesetz",
    abbr: "ARG",
    title: "Arbeitsruhegesetz (Österreich)",
  },
  {
    searchTitle: "Arbeitsvertragsrechts-Anpassungsgesetz",
    matchTitle: "Arbeitsvertragsrechts-Anpassungsgesetz",
    abbr: "AVRAG",
    title: "Arbeitsvertragsrechts-Anpassungsgesetz (Österreich)",
  },
  // Hinweis: Betriebsrätegesetz wurde ins Arbeitsverfassungsgesetz (ArbVG) integriert.
  // ── Personenstandsrecht ──
  {
    searchTitle: "Personenstandsgesetz 2013",
    matchTitle: "Personenstandsgesetz 2013",
    abbr: "PStG",
    title: "Personenstandsgesetz 2013 (Österreich)",
  },
  // ── Namensrecht ──
  {
    searchTitle: "Namensänderungsgesetz",
    matchTitle: "Namensänderungsgesetz",
    abbr: "NÄG",
    title: "Namensänderungsgesetz (Österreich)",
  },
  // ── Tierschutz ──
  {
    searchTitle: "Tierschutzgesetz",
    matchTitle: "Tierschutzgesetz",
    abbr: "TSchG",
    title: "Tierschutzgesetz (Österreich)",
  },
  // ── Abfallrecht ──
  {
    searchTitle: "Abfallwirtschaftsgesetz 2002",
    matchTitle: "Abfallwirtschaftsgesetz 2002",
    abbr: "AWG",
    title: "Abfallwirtschaftsgesetz 2002 (Österreich)",
  },
  // ── Chemikalienrecht ──
  {
    searchTitle: "Chemikaliengesetz",
    matchTitle: "Chemikaliengesetz",
    abbr: "ChemG",
    title: "Chemikaliengesetz (Österreich)",
  },
  // Hinweis: Luftreinhaltegesetz existiert nicht als eigenständiges Bundesgesetz.
  // ── Energie ──
  {
    searchTitle: "Elektrizitätswirtschafts- und -organisationsgesetz 2010",
    matchTitle: "Elektrizitätswirtschafts- und -organisationsgesetz 2010",
    abbr: "EiWOG",
    title: "Elektrizitätswirtschafts- und -organisationsgesetz 2010 (Österreich)",
  },
  {
    searchTitle: "Gaswirtschaftsgesetz 2011",
    matchTitle: "Gaswirtschaftsgesetz 2011",
    abbr: "GWG",
    title: "Gaswirtschaftsgesetz 2011 (Österreich)",
  },
  // Hinweis: Baurecht ist in Österreich Landessache. Todeserklärung (§§ 25-28 ABGB)
  // und Erbrecht (§§ 531-817 ABGB) sind im ABGB geregelt, das wir bereits haben.
];

// ── Switzerland (3 core codes via Fedlex) ─────────────────────────────
const CH_LAWS: ChLaw[] = [
  { srNumber: "220", abbr: "OR", title: "Obligationenrecht (Schweiz)" },
  { srNumber: "311.0", abbr: "StGB", title: "Schweizerisches Strafgesetzbuch" },
  { srNumber: "210", abbr: "ZGB", title: "Schweizerisches Zivilgesetzbuch" },
  { srNumber: "312.0", abbr: "StPO", title: "Schweizerische Strafprozessordnung" },
];

// ── EU (key regulations via EUR-Lex Cellar API) ───────────────────────

interface EuLaw {
  /** CELEX number — the canonical EUR-Lex document ID */
  celex: string;
  abbr: string;
  title: string;
}

const EU_LAWS: EuLaw[] = [
  { celex: "32016R0679", abbr: "DSGVO", title: "Datenschutz-Grundverordnung (GDPR)" },
  {
    celex: "32016L0680",
    abbr: "DSRL",
    title: "Datenschutz-Richtlinie (Law Enforcement Directive)",
  },
  { celex: "32002L0058", abbr: "ePrivacy", title: "ePrivacy-Richtlinie" },
  { celex: "32008R0648", abbr: "RomI", title: "Rom I-Verordnung (Vertragsstatut)" },
  {
    celex: "32008R0649",
    abbr: "RomII",
    title: "Rom II-Verordnung (Außervertragliche Schuldverhältnisse)",
  },
  { celex: "32012R0121", abbr: "BrusselsIbis", title: "Brussels Ibis-Verordnung (Gerichtsstände)" },
  { celex: "32017R2401", abbr: "EuCO", title: "Europäisches Vollstreckungsübereinkommen" },
];

const args = process.argv.slice(2);
const onlyIdx = args.indexOf("--only");
const only =
  onlyIdx !== -1 ? new Set(args[onlyIdx + 1].split(",").map((s) => s.trim().toLowerCase())) : null;
const outIdx = args.indexOf("--out");
const _scriptDir = dirname(fileURLToPath(import.meta.url));
const OUT = outIdx !== -1 ? args[outIdx + 1] : join(_scriptDir, "..", "..", "law-corpus");

const RETRIEVED_AT = new Date().toISOString().slice(0, 10);

function yamlEscape(v: string): string {
  return JSON.stringify(v);
}

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${yamlEscape(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

/** All text content of a node, paragraphs separated. */
function nodeText(node: Node | null): string {
  if (!node) return "";
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      parts.push(n.nodeValue ?? "");
      return;
    }
    const name = n.nodeName.toUpperCase();
    if (name === "P" || name === "BR") parts.push("\n");
    for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  };
  walk(node);
  return parts
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstByTag(el: Element | Document, tag: string): Element | null {
  const list = el.getElementsByTagName(tag);
  return list.length > 0 ? (list.item(0) as Element) : null;
}

async function fetchDe(law: DeLaw): Promise<{ markdown: string; versionDate: string } | null> {
  const url = `https://www.gesetze-im-internet.de/${law.slug}/xml.zip`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  [de:${law.abbr}] HTTP ${res.status} for ${url}`);
    return null;
  }
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const xmlName = Object.keys(zip.files).find((f) => f.endsWith(".xml"));
  if (!xmlName) {
    console.error(`  [de:${law.abbr}] no XML in zip`);
    return null;
  }
  const xml = await zip.files[xmlName].async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  const dokumente = firstByTag(doc, "dokumente");
  const builddate = dokumente?.getAttribute("builddate") ?? "";
  // builddate format: YYYYMMDDhhmmss → YYYY-MM-DD
  const versionDate = builddate
    ? `${builddate.slice(0, 4)}-${builddate.slice(4, 6)}-${builddate.slice(6, 8)}`
    : RETRIEVED_AT;

  const norms = doc.getElementsByTagName("norm");
  const sections: string[] = [];
  for (let i = 0; i < norms.length; i++) {
    const norm = norms.item(i) as Element;
    const enbez = nodeText(firstByTag(norm, "enbez"));
    const titel = nodeText(firstByTag(norm, "titel"));
    const textEl = firstByTag(norm, "textdaten");
    const body = nodeText(textEl ? firstByTag(textEl, "text") : null);
    if (!enbez && !body) continue; // structural norms (TOC containers)
    const heading = [enbez, titel].filter(Boolean).join(" — ");
    if (heading && body) sections.push(`## ${heading}\n\n${body}`);
    else if (body) sections.push(body);
  }
  if (sections.length === 0) {
    console.error(`  [de:${law.abbr}] parsed 0 norms — format change?`);
    return null;
  }

  const fm = frontmatter({
    title: `${law.abbr} — ${law.title}`,
    type: "law",
    jurisdiction: "de",
    abbreviation: law.abbr,
    version_date: versionDate,
    retrieved_at: RETRIEVED_AT,
    source_url: url,
    license:
      "Amtliches Werk, § 5 UrhG (gemeinfrei). Quelle: gesetze-im-internet.de, Bundesamt für Justiz.",
  });
  return { markdown: `${fm}\n${sections.join("\n\n")}\n`, versionDate };
}

const RIS_UA = {
  "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)",
};

/** Resolve the RIS Gesetzesnummer via the OGD API + one norm page (the
 *  API search result links the norm; the norm page carries the number). */
async function resolveGesetzesnummer(law: AtLaw): Promise<string | null> {
  if (law.gesetzesnummer) return law.gesetzesnummer;
  // Title search ranks related laws first ("Einführungsgesetz zur
  // Exekutionsordnung" beats "Exekutionsordnung" on page 1) — paginate
  // until the EXACT Kurztitel shows up.
  for (let pageNo = 1; pageNo <= 8; pageNo++) {
    const api = `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Titel=${encodeURIComponent(law.searchTitle)}&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}`;
    const res = await fetch(api, { headers: RIS_UA });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    try {
      const result = (data.OgdSearchResult as Record<string, unknown>).OgdDocumentResults as Record<
        string,
        unknown
      >;
      let refs = result.OgdDocumentReference as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
        | undefined;
      if (!refs) return null; // past the last page
      if (!Array.isArray(refs)) refs = [refs];
      for (const ref of refs as Array<Record<string, unknown>>) {
        const meta = (ref.Data as Record<string, unknown>)?.Metadaten as
          | Record<string, unknown>
          | undefined;
        const bund = meta?.Bundesrecht as Record<string, unknown> | undefined;
        // RIS API returns non-breaking spaces (U+00A0) in Kurztitel instead of
        // regular spaces (U+0020). Normalize before comparing.
        const normalize = (s: unknown) => (typeof s === "string" ? s.replace(/\u00A0/g, " ") : s);
        const expected = normalize(law.matchTitle ?? law.searchTitle);
        if (normalize(bund?.Kurztitel) !== expected) continue;
        // Gesetzesnummer is directly in the API JSON — prefer this.
        const brKons = bund?.BrKons as Record<string, unknown> | undefined;
        const gnr = (brKons?.Gesetzesnummer ?? bund?.Gesetzesnummer) as string | undefined;
        if (typeof gnr === "string" && /^\d+$/.test(gnr)) {
          return gnr;
        }
        // Fallback: scrape from document page HTML.
        const docUrl = (meta?.Allgemein as Record<string, unknown> | undefined)?.DokumentUrl as
          | string
          | undefined;
        if (!docUrl) continue;
        const page = await fetch(docUrl, { headers: RIS_UA, redirect: "follow" });
        if (!page.ok) continue;
        const m = (await page.text()).match(/Gesetzesnummer=(\d+)/);
        if (m) return m[1];
      }
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchAt(law: AtLaw): Promise<{ markdown: string; versionDate: string } | null> {
  const nr = await resolveGesetzesnummer(law);
  if (!nr) {
    console.error(`  [at:${law.abbr}] could not resolve Gesetzesnummer via RIS API`);
    return null;
  }

  // The GeltendeFassung page links the OFFICIAL whole-law PDF
  // ("…, Fassung vom DD.MM.YYYY.pdf") — one fetch, clean text via our own
  // PDF extractor, and the link text doubles as the consolidation stamp.
  const pageUrl = `https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=${nr}`;
  const pageRes = await fetch(pageUrl, { headers: RIS_UA });
  if (pageRes.ok) {
    const pageHtml = await pageRes.text();
    const pdfMatch = pageHtml.match(
      /href="(\/GeltendeFassung\/Bundesnormen\/\d+\/[^"]*Fassung%20vom%20([\d.]+)\.pdf)"/
    );
    if (pdfMatch) {
      const pdfUrl = `https://www.ris.bka.gv.at${pdfMatch[1]}`;
      // DD.MM.YYYY → YYYY-MM-DD
      const [dd, mm, yyyy] = pdfMatch[2].split(".");
      const versionDate = `${yyyy}-${mm}-${dd}`;

      const pdfRes = await fetch(pdfUrl, { headers: RIS_UA });
      if (pdfRes.ok) {
        const { extractDocumentText } = await import("../src/core/extract-document.ts");
        const extracted = await extractDocumentText(
          Buffer.from(await pdfRes.arrayBuffer()),
          ".pdf"
        );
        let text = extracted.text;
        if (text.length < 5_000 || !text.includes("§")) {
          console.error(
            `  [at:${law.abbr}] suspicious extraction (${text.length} chars) — skipped`
          );
          return null;
        }
        if (text.length > 4_000_000) text = text.slice(0, 4_000_000);

        const fm = frontmatter({
          title: `${law.abbr} — ${law.title}`,
          type: "law",
          jurisdiction: "at",
          abbreviation: law.abbr,
          version_date: versionDate,
          retrieved_at: RETRIEVED_AT,
          source_url: pdfUrl,
          license:
            "Quelle: RIS (ris.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung.",
        });
        return { markdown: `${fm}\n${text}\n`, versionDate };
      }
    }
  }

  // Fallback: GeltendeFassung returned 404 or no PDF — fetch individual
  // norms via the RIS OGD API and concatenate them.
  console.error(
    `  [at:${law.abbr}] GeltendeFassung unavailable, falling back to OGD norm-by-norm…`
  );
  return await fetchAtViaOgd(law, nr);
}

/** Fallback: fetch all individual norms from the RIS OGD API and
 *  concatenate them into a single markdown file. Slower but works
 *  for laws where GeltendeFassung.wxe returns 404.
 */
async function fetchAtViaOgd(
  law: AtLaw,
  gesetzesnummer: string
): Promise<{ markdown: string; versionDate: string } | null> {
  const allText: string[] = [];
  const versionDate = new Date().toISOString().slice(0, 10);

  for (let pageNo = 1; pageNo <= 20; pageNo++) {
    const apiUrl = `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Gesetzesnummer=${gesetzesnummer}&DokumenteProSeite=OneHundred&Seitennummer=${pageNo}`;
    const apiRes = await fetch(apiUrl, { headers: RIS_UA });
    if (!apiRes.ok) break;
    const apiData = (await apiRes.json()) as Record<string, unknown>;
    try {
      const result = (apiData.OgdSearchResult as Record<string, unknown>)
        .OgdDocumentResults as Record<string, unknown>;
      let refs = result.OgdDocumentReference as
        | Array<Record<string, unknown>>
        | Record<string, unknown>
        | undefined;
      if (!refs) break;
      if (!Array.isArray(refs)) refs = [refs];

      for (const ref of refs as Array<Record<string, unknown>>) {
        const data = ref.Data as Record<string, unknown> | undefined;
        if (!data) continue;
        const dokListe = data.Dokumentliste as Record<string, unknown> | undefined;
        if (!dokListe) continue;
        const contentRef = dokListe.ContentReference as Record<string, unknown> | undefined;
        if (!contentRef) continue;
        const urls = contentRef.Urls as Record<string, unknown> | undefined;
        if (!urls) continue;
        const contentUrls = urls.ContentUrl as Array<Record<string, unknown>> | undefined;
        if (!contentUrls) continue;

        // Find the HTML URL
        const htmlUrl = contentUrls.find((u) => u.DataType === "Html")?.Url as string | undefined;
        if (!htmlUrl) continue;

        const htmlRes = await fetch(htmlUrl, { headers: RIS_UA });
        if (!htmlRes.ok) continue;
        const html = await htmlRes.text();
        const text = stripHtmlSimple(html);
        if (text.length > 50) allText.push(text);
      }

      if ((refs as Array<Record<string, unknown>>).length < 100) break; // last page
    } catch {
      break;
    }
  }

  if (allText.length === 0) {
    console.error(`  [at:${law.abbr}] OGD fallback: no norms fetched`);
    return null;
  }

  let text = allText.join("\n\n---\n\n");
  if (text.length < 500 || !text.includes("§")) {
    console.error(
      `  [at:${law.abbr}] OGD fallback: suspicious extraction (${text.length} chars) — skipped`
    );
    return null;
  }
  if (text.length > 4_000_000) text = text.slice(0, 4_000_000);

  const fm = frontmatter({
    title: `${law.abbr} — ${law.title}`,
    type: "law",
    jurisdiction: "at",
    abbreviation: law.abbr,
    version_date: versionDate,
    retrieved_at: RETRIEVED_AT,
    source_url: `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons&Gesetzesnummer=${gesetzesnummer}`,
    license:
      "Quelle: RIS OGD (data.bka.gv.at), Bundeskanzleramt Österreich — Open Government Data, Namensnennung.",
  });
  console.error(
    `  [at:${law.abbr}] OGD fallback: ${allText.length} norms, ${Math.round(text.length / 1024)} KB`
  );
  return { markdown: `${fm}\n${text}\n`, versionDate };
}

// ── Switzerland: odat.ch API (Forma Legis, CC-BY-SA-4.0) ──────────────

const ODAT_API = "https://api.odat.ch/api/v1";
const ODAT_HTML = "https://www.odat.ch/de/cc";
const ODAT_UA = {
  "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)",
};

/** Fetch a Swiss consolidated law via the odat.ch API.
 *  1. Resolve the latest in-force version via /api/v1/laws/ch/{sr}/versions
 *  2. Fetch the full HTML from www.odat.ch/de/cc/{sr}-{version}-de.html
 *  3. Convert HTML to markdown
 */
async function fetchCh(law: ChLaw): Promise<{ markdown: string; versionDate: string } | null> {
  try {
    // Step 1: Find the latest in-force version
    const versionsUrl = `${ODAT_API}/laws/ch/${law.srNumber}/versions?language=de`;
    const versionsRes = await fetch(versionsUrl, { headers: ODAT_UA });
    if (!versionsRes.ok) {
      console.error(`  [ch:${law.abbr}] odat.ch versions HTTP ${versionsRes.status}`);
      return null;
    }
    const versionsData = (await versionsRes.json()) as {
      versions?: Array<{ refno_version: string; in_force: boolean; date_in_force: string }>;
    };
    const inForce = (versionsData.versions ?? []).filter((v) => v.in_force);
    const all = versionsData.versions ?? [];
    if (all.length === 0) {
      console.error(`  [ch:${law.abbr}] no versions found on odat.ch`);
      return null;
    }
    // Prefer in-force (newest first from API), fall back to latest overall
    const latest = inForce.length > 0 ? inForce[0] : all[0];
    const versionCode = latest.refno_version; // e.g. "20260101"
    const versionDate = `${versionCode.slice(0, 4)}-${versionCode.slice(4, 6)}-${versionCode.slice(6, 8)}`;

    // Step 2: Fetch the full HTML law text
    const htmlUrl = `${ODAT_HTML}/${law.srNumber}-${versionCode}-de.html`;
    const contentRes = await fetch(htmlUrl, { headers: ODAT_UA });
    if (!contentRes.ok) {
      console.error(`  [ch:${law.abbr}] odat.ch content HTTP ${contentRes.status}`);
      return null;
    }
    const html = await contentRes.text();

    // Step 3: Convert HTML to markdown-like text
    let text = stripHtmlSimple(html);
    if (text.length < 500 || !text.includes("Art.")) {
      console.error(`  [ch:${law.abbr}] suspicious extraction (${text.length} chars) — skipped`);
      return null;
    }
    if (text.length > 4_000_000) text = text.slice(0, 4_000_000);

    const fm = frontmatter({
      title: `${law.abbr} — ${law.title}`,
      type: "law",
      jurisdiction: "ch",
      abbreviation: law.abbr,
      version_date: versionDate,
      retrieved_at: RETRIEVED_AT,
      source_url: htmlUrl,
      license: "Quelle: odat.ch (Forma Legis) — CC-BY-SA-4.0. Nicht-amtliche Veröffentlichung.",
    });
    return { markdown: `${fm}\n${text}\n`, versionDate };
  } catch (err) {
    console.error(`  [ch:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Minimal HTML-to-text converter (avoids extra dependency on node-html-parser). */
function stripHtmlSimple(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n## ")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ── EU: EUR-Lex Cellar API ────────────────────────────────────────────

const EURLEX_CELLAR_BASE = "https://eur-lex.europa.eu/legal-content";

/** Fetch an EU regulation or directive from EUR-Lex by its CELEX number.
 *  Uses the official EUR-Lex legal-content API (format=TXT, language=DE).
 */
async function fetchEu(law: EuLaw): Promise<{ markdown: string; versionDate: string } | null> {
  try {
    // Build the EUR-Lex content URL — request German text in TXT format
    const url = `${EURLEX_CELLAR_BASE}/DE/TXT/HTML/?uri=CELEX:${law.celex}&qid=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "subsumio-law-corpus/1.0 (corpus build; contact: hello@subsum.io)",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      console.error(`  [eu:${law.abbr}] EUR-Lex HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    let text = stripHtmlSimple(html);

    if (text.length < 500) {
      console.error(`  [eu:${law.abbr}] suspicious extraction (${text.length} chars) — skipped`);
      return null;
    }
    if (text.length > 4_000_000) text = text.slice(0, 4_000_000);

    const versionDate = new Date().toISOString().slice(0, 10);

    const fm = frontmatter({
      title: `${law.abbr} — ${law.title}`,
      type: "law",
      jurisdiction: "eu",
      abbreviation: law.abbr,
      version_date: versionDate,
      retrieved_at: RETRIEVED_AT,
      source_url: `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${law.celex}`,
      license:
        "Quelle: EUR-Lex (eur-lex.europa.eu) — Amtliche Veröffentlichung der Europäischen Union.",
    });
    return { markdown: `${fm}\n${text}\n`, versionDate };
  } catch (err) {
    console.error(`  [eu:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function main() {
  mkdirSync(join(OUT, "de"), { recursive: true });
  mkdirSync(join(OUT, "at"), { recursive: true });
  mkdirSync(join(OUT, "ch"), { recursive: true });
  mkdirSync(join(OUT, "eu"), { recursive: true });

  let ok = 0;
  let failed = 0;

  for (const law of DE_LAWS) {
    if (only && !only.has(law.slug) && !only.has(law.abbr.toLowerCase())) continue;
    process.stderr.write(`[de] ${law.abbr} …\n`);
    try {
      const result = await fetchDe(law);
      if (!result) {
        failed++;
        continue;
      }
      const file = join(OUT, "de", `${law.abbr.toLowerCase()}.md`);
      writeFileSync(file, result.markdown, "utf-8");
      console.error(
        `  [de:${law.abbr}] ok — Stand ${result.versionDate}, ${(result.markdown.length / 1024).toFixed(0)} KB`
      );
      ok++;
    } catch (err) {
      console.error(
        `  [de:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  for (const law of AT_LAWS) {
    if (only && !only.has(law.abbr.toLowerCase())) continue;
    process.stderr.write(`[at] ${law.abbr} …\n`);
    try {
      const result = await fetchAt(law);
      if (!result) {
        failed++;
        continue;
      }
      const file = join(
        OUT,
        "at",
        law.outputFile ?? `${law.abbr.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.md`
      );
      writeFileSync(file, result.markdown, "utf-8");
      console.error(
        `  [at:${law.abbr}] ok — Fassung vom ${result.versionDate}, ${(result.markdown.length / 1024).toFixed(0)} KB`
      );
      ok++;
    } catch (err) {
      console.error(
        `  [at:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  // ── Switzerland ──
  for (const law of CH_LAWS) {
    if (only && !only.has(law.abbr.toLowerCase())) continue;
    process.stderr.write(`[ch] ${law.abbr} …\n`);
    try {
      const result = await fetchCh(law);
      if (!result) {
        failed++;
        continue;
      }
      const file = join(OUT, "ch", `${law.abbr.toLowerCase()}.md`);
      writeFileSync(file, result.markdown, "utf-8");
      console.error(
        `  [ch:${law.abbr}] ok — Stand ${result.versionDate}, ${(result.markdown.length / 1024).toFixed(0)} KB`
      );
      ok++;
    } catch (err) {
      console.error(
        `  [ch:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  // ── EU ──
  for (const law of EU_LAWS) {
    if (only && !only.has(law.abbr.toLowerCase())) continue;
    process.stderr.write(`[eu] ${law.abbr} …\n`);
    try {
      const result = await fetchEu(law);
      if (!result) {
        failed++;
        continue;
      }
      const file = join(OUT, "eu", `${law.abbr.toLowerCase()}.md`);
      writeFileSync(file, result.markdown, "utf-8");
      console.error(
        `  [eu:${law.abbr}] ok — Stand ${result.versionDate}, ${(result.markdown.length / 1024).toFixed(0)} KB`
      );
      ok++;
    } catch (err) {
      console.error(
        `  [eu:${law.abbr}] failed: ${err instanceof Error ? err.message : String(err)}`
      );
      failed++;
    }
  }

  console.error(`\nDone: ${ok} ok, ${failed} failed → ${OUT}`);
  console.error(
    `Import:\n  gbrain sources add law-de ${join(OUT, "de")} && gbrain import ${join(OUT, "de")} --source-id law-de`
  );
  console.error(
    `  gbrain sources add law-at ${join(OUT, "at")} && gbrain import ${join(OUT, "at")} --source-id law-at`
  );
  console.error(
    `  gbrain sources add law-ch ${join(OUT, "ch")} && gbrain import ${join(OUT, "ch")} --source-id law-ch`
  );
  console.error(
    `  gbrain sources add law-eu ${join(OUT, "eu")} && gbrain import ${join(OUT, "eu")} --source-id law-eu`
  );
  if (failed > 0) process.exit(1);
}

main();
