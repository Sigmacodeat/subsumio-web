/**
 * Legal Source Coverage Matrix — Quellen-Coverage nach Rechtsgebiet und Quellentyp
 *
 * T3.5: Misst die Abdeckung von Rechtsquellen nicht nur nach Anzahl der Gesetze,
 * sondern nach Rechtsgebiet und Quellentyp:
 *   - Primärrecht (Gesetze im engeren Sinne)
 *   - Verordnungen
 *   - Höchstgerichtliche Judikatur (BGH, OGH, BGer)
 *   - Instanzrechtsprechung (OLG, LG, etc.)
 *   - Gesetzesmaterialien (Begründungen, Drucksachen)
 *   - Behördenpraxis (Verwaltungspraxis, Erlasse)
 *   - Offene Literatur (Open Access)
 *   - Lizenzierte Literatur (Verlagspartnerschaft)
 *
 * Die Matrix dient als Single-Source-of-Truth für:
 *   1. UI: "Welche Quellen sind verfügbar?"
 *   2. Eval: Coverage-Gaps identifizieren
 *   3. Onboarding: Welche Quellen fehlen für diese Jurisdiktion?
 *   4. CI: Regression-Tests gegen erwartete Coverage
 *
 * @module src/lib/legal-source-coverage
 */

import type { SourceType, Jurisdiction } from "../../server/src/core/legal/source-lifecycle";

// ── Types ─────────────────────────────────────────────────────────────

export type LegalArea =
  | "civil_law" // Zivilrecht (BGB, ABGB, OR)
  | "criminal_law" // Strafrecht (StGB, StPO)
  | "commercial_law" // Handelsrecht (HGB, UGB)
  | "tax_law" // Steuerrecht (AO, EStG, KStG, BAO)
  | "administrative_law" // Verwaltungsrecht (VwGO, VwVG)
  | "constitutional_law" // Verfassungsrecht (GG, B-VG, BV)
  | "family_law" // Familienrecht (FamFG, EheG)
  | "labor_law" // Arbeitsrecht (BetrVG, ArBG)
  | "intellectual_property" // Urheber-/Patentrecht (UrhG, PatG)
  | "data_protection" // Datenschutz (DSGVO, DSG)
  | "insolvency_law" // Insolvenzrecht (InsO, IO)
  | "eu_law" // EU-Recht (Richtlinien, Verordnungen)
  | "procedural_law"; // Verfahrensrecht (ZPO, StPO)

export interface LegalSourceCoverageEntry {
  source_id: string;
  source_name: string;
  jurisdiction: Jurisdiction;
  source_type: SourceType;
  legal_areas: LegalArea[];
  status: "available" | "early_access" | "planned" | "gap";
  item_count: number;
  last_sync: string | null;
  sync_mode: "delta" | "full" | "manual";
  official_url: string;
  api_url: string | null;
  notes: string;
}

export interface CoverageMatrix {
  entries: LegalSourceCoverageEntry[];
  by_jurisdiction: Record<Jurisdiction, CoverageSummary>;
  by_source_type: Record<SourceType, CoverageSummary>;
  gaps: CoverageGap[];
}

export interface CoverageSummary {
  total_sources: number;
  available_sources: number;
  total_items: number;
  covered_areas: LegalArea[];
  missing_areas: LegalArea[];
}

export interface CoverageGap {
  jurisdiction: Jurisdiction;
  source_type: SourceType;
  legal_area: LegalArea;
  description: string;
  priority: "high" | "medium" | "low";
}

// ── Legal Area Labels ─────────────────────────────────────────────────

export const LEGAL_AREA_LABELS_DE: Record<LegalArea, string> = {
  civil_law: "Zivilrecht",
  criminal_law: "Strafrecht",
  commercial_law: "Handelsrecht",
  tax_law: "Steuerrecht",
  administrative_law: "Verwaltungsrecht",
  constitutional_law: "Verfassungsrecht",
  family_law: "Familienrecht",
  labor_law: "Arbeitsrecht",
  intellectual_property: "Urheber-/Patentrecht",
  data_protection: "Datenschutz",
  insolvency_law: "Insolvenzrecht",
  eu_law: "EU-Recht",
  procedural_law: "Verfahrensrecht",
};

export const SOURCE_TYPE_LABELS_DE: Record<SourceType, string> = {
  primary_legislation: "Primärrecht (Gesetze)",
  regulation: "Verordnungen",
  case_law_supreme: "Höchstgerichtliche Judikatur",
  case_law_instance: "Instanzrechtsprechung",
  materials: "Gesetzesmaterialien",
  authority_practice: "Behördenpraxis",
  literature_open: "Offene Literatur",
  literature_licensed: "Lizenzierte Literatur",
};

// ── Coverage Matrix ───────────────────────────────────────────────────

/**
 * The canonical legal source coverage matrix.
 *
 * This is the single source of truth for what legal sources are
 * available, planned, or missing (gaps) across all jurisdictions.
 */
export const LEGAL_SOURCE_COVERAGE_MATRIX: LegalSourceCoverageEntry[] = [
  // ── DE: Primary Legislation ──────────────────────────────────────────
  {
    source_id: "law-de",
    source_name: "gesetze-im-internet.de",
    jurisdiction: "DE",
    source_type: "primary_legislation",
    legal_areas: [
      "civil_law",
      "criminal_law",
      "commercial_law",
      "tax_law",
      "administrative_law",
      "constitutional_law",
      "family_law",
      "labor_law",
      "intellectual_property",
      "data_protection",
      "insolvency_law",
      "procedural_law",
    ],
    status: "available",
    item_count: 30,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://www.gesetze-im-internet.de/",
    api_url: "https://www.gesetze-im-internet.de/xml/",
    notes: "Bundesministerium der Justiz. XML API für Bundesgesetze.",
  },
  {
    source_id: "law-de-regulations",
    source_name: "gesetze-im-internet.de (Verordnungen)",
    jurisdiction: "DE",
    source_type: "regulation",
    legal_areas: [
      "civil_law",
      "criminal_law",
      "commercial_law",
      "tax_law",
      "administrative_law",
      "data_protection",
    ],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://www.gesetze-im-internet.de/",
    api_url: "https://www.gesetze-im-internet.de/xml/",
    notes: "Verordnungen über gleiche API wie Gesetze. Noch nicht importiert.",
  },
  {
    source_id: "law-de-judikatur",
    source_name: "BGH Entscheidungen",
    jurisdiction: "DE",
    source_type: "case_law_supreme",
    legal_areas: ["civil_law", "criminal_law", "commercial_law", "tax_law", "procedural_law"],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "delta",
    official_url: "https://www.bundesgerichtshof.de/",
    api_url: null,
    notes: "BGH-Entscheidungen über RSS-Feeds. Kommerzielle Volltexte bei juris.",
  },
  {
    source_id: "law-de-instance",
    source_name: "Instanzrechtsprechung DE",
    jurisdiction: "DE",
    source_type: "case_law_instance",
    legal_areas: ["civil_law", "criminal_law", "administrative_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "Keine zentrale kostenlose Quelle für OLG/LG-Entscheidungen. Gap.",
  },
  {
    source_id: "law-de-materials",
    source_name: "Bundestags-Drucksachen",
    jurisdiction: "DE",
    source_type: "materials",
    legal_areas: ["civil_law", "criminal_law", "tax_law", "constitutional_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "delta",
    official_url: "https://dip.bundestag.de/",
    api_url: "https://dip.bundestag.de/api/",
    notes: "Gesetzesmaterialien über DIP API. Noch nicht angebunden.",
  },
  {
    source_id: "law-de-authority",
    source_name: "Behördenpraxis DE",
    jurisdiction: "DE",
    source_type: "authority_practice",
    legal_areas: ["tax_law", "administrative_law", "data_protection"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "Bundessteuerberaterkammer, BfDI. Keine strukturierte API. Gap.",
  },
  {
    source_id: "law-de-literature-open",
    source_name: "Open Access Literatur DE",
    jurisdiction: "DE",
    source_type: "literature_open",
    legal_areas: ["civil_law", "criminal_law", "constitutional_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "Open-Access-Zeitschriften (z.B. ZIS, HFR). Noch nicht angebunden.",
  },
  {
    source_id: "law-de-literature-licensed",
    source_name: "Lizenzierte Literatur DE",
    jurisdiction: "DE",
    source_type: "literature_licensed",
    legal_areas: ["civil_law", "criminal_law", "tax_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "Verlagspartnerschaften (Beck, Nomos, Springer). Business Track.",
  },

  // ── AT: Primary Legislation ──────────────────────────────────────────
  {
    source_id: "law-at",
    source_name: "RIS-OGD (Bundeskanzleramt)",
    jurisdiction: "AT",
    source_type: "primary_legislation",
    legal_areas: [
      "civil_law",
      "criminal_law",
      "commercial_law",
      "tax_law",
      "administrative_law",
      "constitutional_law",
      "family_law",
      "labor_law",
      "data_protection",
      "insolvency_law",
      "procedural_law",
    ],
    status: "available",
    item_count: 79,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://www.ris.bka.gv.at/",
    api_url: "https://data.ris.bka.gv.at/ogd/v2.6/",
    notes: "RIS-OGD API v2.6. CC-BY 4.0. Bundesgesetze komplett.",
  },
  {
    source_id: "law-at-regulations",
    source_name: "RIS-OGD (Verordnungen)",
    jurisdiction: "AT",
    source_type: "regulation",
    legal_areas: ["civil_law", "tax_law", "administrative_law", "data_protection", "labor_law"],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://www.ris.bka.gv.at/",
    api_url: "https://data.ris.bka.gv.at/ogd/v2.6/",
    notes: "Verordnungen über gleiche RIS-OGD API. Noch nicht importiert.",
  },
  {
    source_id: "law-at-judikatur",
    source_name: "OGH Judikatur (RIS)",
    jurisdiction: "AT",
    source_type: "case_law_supreme",
    legal_areas: [
      "civil_law",
      "criminal_law",
      "commercial_law",
      "tax_law",
      "procedural_law",
      "labor_law",
    ],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "delta",
    official_url: "https://www.ris.bka.gv.at/Judikatur/",
    api_url: "https://data.ris.bka.gv.at/ogd/v2.6/",
    notes: "OGH-Entscheidungen über RIS-OGD API. CC-BY 4.0.",
  },
  {
    source_id: "law-at-instance",
    source_name: "Instanzrechtsprechung AT",
    jurisdiction: "AT",
    source_type: "case_law_instance",
    legal_areas: ["civil_law", "criminal_law", "administrative_law"],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "delta",
    official_url: "https://www.ris.bka.gv.at/Judikatur/",
    api_url: "https://data.ris.bka.gv.at/ogd/v2.6/",
    notes: "OLG/LG-Entscheidungen über RIS-OGD API. Noch nicht importiert.",
  },
  {
    source_id: "law-at-materials",
    source_name: "Regierungsvorlagen AT",
    jurisdiction: "AT",
    source_type: "materials",
    legal_areas: ["civil_law", "criminal_law", "tax_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "https://www.parlament.gv.at/",
    api_url: null,
    notes: "Regierungsvorlagen über Parlamentswebsite. Keine API. Gap.",
  },
  {
    source_id: "law-at-authority",
    source_name: "Behördenpraxis AT",
    jurisdiction: "AT",
    source_type: "authority_practice",
    legal_areas: ["tax_law", "administrative_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "BMF-Erlasse, WKO. Keine strukturierte API. Gap.",
  },
  {
    source_id: "law-at-literature-open",
    source_name: "Open Access Literatur AT",
    jurisdiction: "AT",
    source_type: "literature_open",
    legal_areas: ["civil_law", "criminal_law", "constitutional_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "z.B. Jusline Open Access. Noch nicht angebunden.",
  },
  {
    source_id: "law-at-literature-licensed",
    source_name: "Lizenzierte Literatur AT",
    jurisdiction: "AT",
    source_type: "literature_licensed",
    legal_areas: ["civil_law", "criminal_law", "tax_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "Verlagspartnerschaften (Manz, Verlag Österreich). Business Track.",
  },

  // ── CH: Primary Legislation ──────────────────────────────────────────
  {
    source_id: "law-ch",
    source_name: "Fedlex (Bundeskanzlei)",
    jurisdiction: "CH",
    source_type: "primary_legislation",
    legal_areas: [
      "civil_law",
      "criminal_law",
      "commercial_law",
      "tax_law",
      "administrative_law",
      "constitutional_law",
      "family_law",
      "labor_law",
      "intellectual_property",
      "data_protection",
      "insolvency_law",
      "procedural_law",
    ],
    status: "available",
    item_count: 11,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://www.fedlex.data.admin.ch/",
    api_url: "https://www.fedlex.data.admin.ch/api/v1/",
    notes: "Fedlex Open Data. CC0 1.0. Bundesgesetze komplett.",
  },
  {
    source_id: "law-ch-regulations",
    source_name: "Fedlex (Verordnungen)",
    jurisdiction: "CH",
    source_type: "regulation",
    legal_areas: ["civil_law", "tax_law", "administrative_law", "data_protection", "labor_law"],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://www.fedlex.data.admin.ch/",
    api_url: "https://www.fedlex.data.admin.ch/api/v1/",
    notes: "Verordnungen über gleiche Fedlex API. Noch nicht importiert.",
  },
  {
    source_id: "law-ch-judikatur",
    source_name: "Bundesgerichtsentscheide (BGer)",
    jurisdiction: "CH",
    source_type: "case_law_supreme",
    legal_areas: [
      "civil_law",
      "criminal_law",
      "commercial_law",
      "tax_law",
      "procedural_law",
      "administrative_law",
    ],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "delta",
    official_url: "https://www.bger.ch/",
    api_url: null,
    notes: "BGer-Entscheidungen über RSS-Feeds. Öffentliche Entscheide.",
  },
  {
    source_id: "law-ch-instance",
    source_name: "Instanzrechtsprechung CH",
    jurisdiction: "CH",
    source_type: "case_law_instance",
    legal_areas: ["civil_law", "criminal_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "Kantonale Gerichte. Keine zentrale Quelle. Gap.",
  },
  {
    source_id: "law-ch-materials",
    source_name: "Botschaften CH",
    jurisdiction: "CH",
    source_type: "materials",
    legal_areas: ["civil_law", "criminal_law", "tax_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "https://www.admin.ch/",
    api_url: null,
    notes: "Botschaften über admin.ch. Keine API. Gap.",
  },
  {
    source_id: "law-ch-authority",
    source_name: "Behördenpraxis CH",
    jurisdiction: "CH",
    source_type: "authority_practice",
    legal_areas: ["tax_law", "administrative_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "ESTV, SECO. Keine strukturierte API. Gap.",
  },
  {
    source_id: "law-ch-literature-open",
    source_name: "Open Access Literatur CH",
    jurisdiction: "CH",
    source_type: "literature_open",
    legal_areas: ["civil_law", "criminal_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "z.B. Jusletter Open Access. Noch nicht angebunden.",
  },
  {
    source_id: "law-ch-literature-licensed",
    source_name: "Lizenzierte Literatur CH",
    jurisdiction: "CH",
    source_type: "literature_licensed",
    legal_areas: ["civil_law", "criminal_law", "tax_law"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "Verlagspartnerschaften (Schulthess, Stämpfli). Business Track.",
  },

  // ── EU: Primary Legislation ──────────────────────────────────────────
  {
    source_id: "law-eu",
    source_name: "EUR-Lex",
    jurisdiction: "EU",
    source_type: "primary_legislation",
    legal_areas: [
      "eu_law",
      "data_protection",
      "commercial_law",
      "intellectual_property",
      "labor_law",
      "tax_law",
    ],
    status: "available",
    item_count: 4,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://eur-lex.europa.eu/",
    api_url: "https://eur-lex.europa.eu/EURLexWebService",
    notes: "EUR-Lex Web Services. CC-BY 4.0. EU-Verordnungen und Richtlinien.",
  },
  {
    source_id: "law-eu-regulations",
    source_name: "EUR-Lex (Verordnungen)",
    jurisdiction: "EU",
    source_type: "regulation",
    legal_areas: ["eu_law", "data_protection", "commercial_law"],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "full",
    official_url: "https://eur-lex.europa.eu/",
    api_url: "https://eur-lex.europa.eu/EURLexWebService",
    notes: "EU-Verordnungen über EUR-Lex API. Noch nicht vollständig importiert.",
  },
  {
    source_id: "law-eu-judikatur",
    source_name: "EuGH Judikatur",
    jurisdiction: "EU",
    source_type: "case_law_supreme",
    legal_areas: ["eu_law", "data_protection", "commercial_law", "labor_law"],
    status: "planned",
    item_count: 0,
    last_sync: null,
    sync_mode: "delta",
    official_url: "https://curia.europa.eu/",
    api_url: null,
    notes: "EuGH-Entscheidungen über CURIA Website. Keine API, RSS verfügbar.",
  },
  {
    source_id: "law-eu-materials",
    source_name: "EU Gesetzesmaterialien",
    jurisdiction: "EU",
    source_type: "materials",
    legal_areas: ["eu_law", "data_protection"],
    status: "gap",
    item_count: 0,
    last_sync: null,
    sync_mode: "manual",
    official_url: "",
    api_url: null,
    notes: "COM-Dokumente über EUR-Lex. Gap.",
  },
];

// ── Helper Functions ──────────────────────────────────────────────────

/**
 * Get entries by jurisdiction.
 */
export function getEntriesByJurisdiction(jurisdiction: Jurisdiction): LegalSourceCoverageEntry[] {
  return LEGAL_SOURCE_COVERAGE_MATRIX.filter((e) => e.jurisdiction === jurisdiction);
}

/**
 * Get entries by source type.
 */
export function getEntriesBySourceType(sourceType: SourceType): LegalSourceCoverageEntry[] {
  return LEGAL_SOURCE_COVERAGE_MATRIX.filter((e) => e.source_type === sourceType);
}

/**
 * Get available entries only.
 */
export function getAvailableEntries(): LegalSourceCoverageEntry[] {
  return LEGAL_SOURCE_COVERAGE_MATRIX.filter((e) => e.status === "available");
}

/**
 * Get all gap entries.
 */
export function getGapEntries(): LegalSourceCoverageEntry[] {
  return LEGAL_SOURCE_COVERAGE_MATRIX.filter((e) => e.status === "gap");
}

/**
 * Get all planned entries.
 */
export function getPlannedEntries(): LegalSourceCoverageEntry[] {
  return LEGAL_SOURCE_COVERAGE_MATRIX.filter((e) => e.status === "planned");
}

/**
 * Build the full coverage matrix with summaries and gaps.
 */
export function buildCoverageMatrix(): CoverageMatrix {
  const entries = LEGAL_SOURCE_COVERAGE_MATRIX;

  // By jurisdiction
  const jurisdictions: Jurisdiction[] = ["DE", "AT", "CH", "EU"];
  const byJurisdiction = {} as Record<Jurisdiction, CoverageSummary>;
  const gaps: CoverageGap[] = [];

  for (const jur of jurisdictions) {
    const jurEntries = entries.filter((e) => e.jurisdiction === jur);
    const available = jurEntries.filter((e) => e.status === "available");
    const coveredAreas = new Set<LegalArea>();
    for (const entry of available) {
      entry.legal_areas.forEach((area) => coveredAreas.add(area));
    }

    // Find missing areas (areas with no available source)
    const allAreas: LegalArea[] = [
      "civil_law",
      "criminal_law",
      "commercial_law",
      "tax_law",
      "administrative_law",
      "constitutional_law",
      "family_law",
      "labor_law",
      "intellectual_property",
      "data_protection",
      "insolvency_law",
      "procedural_law",
    ];
    if (jur === "EU") {
      // EU has fewer areas
      allAreas.push("eu_law");
    }
    const missingAreas = allAreas.filter((area) => !coveredAreas.has(area));

    byJurisdiction[jur] = {
      total_sources: jurEntries.length,
      available_sources: available.length,
      total_items: available.reduce((sum, e) => sum + e.item_count, 0),
      covered_areas: Array.from(coveredAreas),
      missing_areas: missingAreas,
    };

    // Identify gaps
    for (const entry of jurEntries.filter((e) => e.status === "gap")) {
      for (const area of entry.legal_areas) {
        gaps.push({
          jurisdiction: jur,
          source_type: entry.source_type,
          legal_area: area,
          description: `${entry.source_name}: ${entry.notes}`,
          priority: getGapPriority(entry.source_type, area),
        });
      }
    }
  }

  // By source type
  const sourceTypes: SourceType[] = [
    "primary_legislation",
    "regulation",
    "case_law_supreme",
    "case_law_instance",
    "materials",
    "authority_practice",
    "literature_open",
    "literature_licensed",
  ];
  const bySourceType = {} as Record<SourceType, CoverageSummary>;
  for (const st of sourceTypes) {
    const stEntries = entries.filter((e) => e.source_type === st);
    const available = stEntries.filter((e) => e.status === "available");
    const coveredAreas = new Set<LegalArea>();
    for (const entry of available) {
      entry.legal_areas.forEach((area) => coveredAreas.add(area));
    }
    bySourceType[st] = {
      total_sources: stEntries.length,
      available_sources: available.length,
      total_items: available.reduce((sum, e) => sum + e.item_count, 0),
      covered_areas: Array.from(coveredAreas),
      missing_areas: [],
    };
  }

  return { entries, by_jurisdiction: byJurisdiction, by_source_type: bySourceType, gaps };
}

/**
 * Get the priority for a coverage gap.
 */
function getGapPriority(sourceType: SourceType, _area: LegalArea): "high" | "medium" | "low" {
  // Supreme court case law and regulations are high priority
  if (sourceType === "case_law_supreme") return "high";
  if (sourceType === "regulation") return "high";
  // Instance case law and materials are medium
  if (sourceType === "case_law_instance") return "medium";
  if (sourceType === "materials") return "medium";
  // Authority practice and literature are lower priority
  return "low";
}

/**
 * Get a summary of coverage for a specific jurisdiction.
 */
export function getJurisdictionSummary(jurisdiction: Jurisdiction): CoverageSummary {
  return buildCoverageMatrix().by_jurisdiction[jurisdiction];
}

/**
 * Check if a specific (jurisdiction, source_type, legal_area) is covered.
 */
export function isCovered(
  jurisdiction: Jurisdiction,
  sourceType: SourceType,
  area: LegalArea
): boolean {
  return LEGAL_SOURCE_COVERAGE_MATRIX.some(
    (e) =>
      e.jurisdiction === jurisdiction &&
      e.source_type === sourceType &&
      e.legal_areas.includes(area) &&
      e.status === "available"
  );
}

/**
 * Get the coverage percentage for a jurisdiction.
 */
export function getCoveragePercentage(jurisdiction: Jurisdiction): number {
  const summary = getJurisdictionSummary(jurisdiction);
  const totalAreas = summary.covered_areas.length + summary.missing_areas.length;
  if (totalAreas === 0) return 0;
  return Math.round((summary.covered_areas.length / totalAreas) * 100);
}
