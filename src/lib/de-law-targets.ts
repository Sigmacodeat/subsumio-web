/**
 * de-law-targets.ts — konfiguriertes Ziel-Set der DE-Bundesgesetze.
 *
 * Single Source für den Ingest (`server/scripts/ingest-law-corpus.ts`)
 * UND den Coverage-Audit (`src/lib/de-statute-coverage.ts`): das amtliche
 * gii-TOC kennt ~6.100 Bundesgesetze — dieses Set ist der bewusst
 * gewählte Subset, den Subsumio garantiert vollständig hält. Der Audit
 * meldet daher getrennt „konfiguriertes Ziel-Set" vs. „amtlicher
 * Gesamtkatalog".
 *
 * Extend deliberately; every entry costs corpus size and sync time.
 */

export interface DeLawTarget {
  /** gesetze-im-internet.de/<slug>/xml.zip */
  slug: string;
  abbr: string;
  title: string;
}

export const DE_LAW_TARGETS: readonly DeLawTarget[] = [
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
  // ── Tax law statutes (Steuerrecht as legal practice area) ──
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
  // ── DACH-Legal-Ausbau 2026-07-18: Arbeitsrecht, Gesellschaftsrecht, IP,
  //    Verwaltungsverfahren, Versicherung, Verkehr, Wohnungseigentum ──
  { slug: "kschg", abbr: "KSchG", title: "Kündigungsschutzgesetz" },
  { slug: "tzbfg", abbr: "TzBfG", title: "Teilzeit- und Befristungsgesetz" },
  { slug: "arbzg", abbr: "ArbZG", title: "Arbeitszeitgesetz" },
  { slug: "burlg", abbr: "BUrlG", title: "Bundesurlaubsgesetz" },
  { slug: "entgfg", abbr: "EntgFG", title: "Entgeltfortzahlungsgesetz" },
  { slug: "agg", abbr: "AGG", title: "Allgemeines Gleichbehandlungsgesetz" },
  { slug: "arbgg", abbr: "ArbGG", title: "Arbeitsgerichtsgesetz" },
  { slug: "aktg", abbr: "AktG", title: "Aktiengesetz" },
  { slug: "vvg_2008", abbr: "VVG", title: "Versicherungsvertragsgesetz" },
  { slug: "prodhaftg", abbr: "ProdHaftG", title: "Produkthaftungsgesetz" },
  { slug: "stvg", abbr: "StVG", title: "Straßenverkehrsgesetz" },
  { slug: "vwvfg", abbr: "VwVfG", title: "Verwaltungsverfahrensgesetz" },
  { slug: "markeng", abbr: "MarkenG", title: "Markengesetz" },
  { slug: "patg", abbr: "PatG", title: "Patentgesetz" },
  { slug: "woeigg", abbr: "WEG", title: "Wohnungseigentumsgesetz" },
];
