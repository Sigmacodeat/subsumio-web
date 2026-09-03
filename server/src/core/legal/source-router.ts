/**
 * Source Router v2 — Frontier-Level Source Routing für juristische Recherche.
 *
 * Erweitert den bestehenden query-planner um:
 *  1. Granulare Source-Type-Klassifikation (statute, judgement, materials, admin_practice, firm_knowledge)
 *  2. Stichtag-Unterstützung (as-of-date) für historische Gesetzesstände
 *  3. Jurisdiction-Clarification bei unsicherer Jurisdiktion (Kollisionserkennung)
 *
 * Architektur:
 *   User Question + Context (jurisdiction, case_slug, as_of_date)
 *       ↓
 *   classifySourceTypes() — bestimmt welche Source Types relevant sind
 *       ↓
 *   clarifyJurisdiction() — bei Kollision → Disambiguation
 *       ↓
 *   routeToSources() — mappt Source Types auf konkrete source_ids
 *       ↓
 *   Sub-Queries mit source_type + jurisdiction + as_of_date
 */

import {
  LEGAL_SOURCE_BY_JURISDICTION,
  AT_LAW_SOURCES_STATUTES,
  AT_LAW_SOURCES_JUDIKATUR,
  type LegalJurisdiction,
} from "./jurisdiction.ts";

// ── Source Types ──────────────────────────────────────────────────────

export type SourceType =
  | "statute" // Gesetze (BGB, ABGB, OR, etc.)
  | "judgement" // Judikatur (BGH, OGH, EuGH, etc.)
  | "materials" // Materialien (Gesetzesmaterialien, Begründungen)
  | "admin_practice" // Verwaltungspraxis (Erlasse, Verwaltungsvorschriften)
  | "firm_knowledge" // Kanzleiwissen (Matters, Memos, Playbooks)
  | "all";

export const ALL_SOURCE_TYPES: SourceType[] = [
  "statute",
  "judgement",
  "materials",
  "admin_practice",
  "firm_knowledge",
  "all",
];

// ── Source Type → Source ID Mapping ───────────────────────────────────

/**
 * Map a source type to concrete source IDs for a given jurisdiction.
 * Returns the source IDs that should be searched for this source type.
 */
export function sourceTypeToIds(
  sourceType: SourceType,
  jurisdiction: string | undefined,
  ownSourceId?: string
): string[] {
  const jur = jurisdiction?.toLowerCase() as LegalJurisdiction | undefined;
  const lawSource = jur ? LEGAL_SOURCE_BY_JURISDICTION[jur] : undefined;

  switch (sourceType) {
    case "statute":
      // v0.46: AT statutes are in granular sources (law-at-normen, etc.)
      // because the 148.198 AT norms were imported via batch-import-from-disk
      // under granular source IDs, not under the legacy "law-at" source
      // (which has 0 pages). Returning only "law-at" would search an empty
      // source — a critical bug that returned no AT statutes.
      if (jur === "at") {
        return AT_LAW_SOURCES_STATUTES;
      }
      return lawSource ? [lawSource] : [];

    case "judgement":
      // AT has separate judikatur sources per court
      if (jur === "at") {
        return AT_LAW_SOURCES_JUDIKATUR;
      }
      // DE/CH judgements are in the main law source for now
      return lawSource ? [lawSource] : [];

    case "materials":
      // Materials are in the main law source (frontmatter tagged)
      return lawSource ? [lawSource] : [];

    case "admin_practice":
      // Admin practice is in the main law source (frontmatter tagged)
      return lawSource ? [lawSource] : [];

    case "firm_knowledge":
      // Firm knowledge = tenant's own source (matters, memos, playbooks)
      return ownSourceId ? [ownSourceId] : [];

    case "all":
    default: {
      const ids = new Set<string>();
      if (lawSource) ids.add(lawSource);
      if (jur === "at") {
        // v0.46: include all granular AT sources for "all" queries
        for (const sid of AT_LAW_SOURCES_STATUTES) ids.add(sid);
        for (const sid of AT_LAW_SOURCES_JUDIKATUR) ids.add(sid);
      }
      // EU law always included for DACH
      ids.add("law-eu");
      if (ownSourceId) ids.add(ownSourceId);
      return Array.from(ids);
    }
  }
}

// ── Source Type Classification ────────────────────────────────────────

export interface SourceTypeClassification {
  /** Which source types are relevant for this query. */
  sourceTypes: SourceType[];
  /** Why each source type was selected. */
  reasoning: Record<SourceType, string>;
  /** Whether the classification is confident or uncertain. */
  confident: boolean;
}

/**
 * Classify which source types are relevant for a legal query.
 *
 * Heuristic-based (no LLM needed) — uses keyword matching to determine
 * whether the query needs statutes, judgements, materials, admin practice,
 * or firm knowledge.
 */
export function classifySourceTypes(
  query: string,
  context?: {
    hasActiveCase?: boolean;
    jurisdiction?: string;
  }
): SourceTypeClassification {
  const lower = query.toLowerCase();
  const types = new Set<SourceType>();
  const reasoning: Partial<Record<SourceType, string>> = {};
  let confident = true;

  // Statute signals: §, Art., law names, legal concepts
  const statuteSignals = [
    /§+\s*\d/,
    /\bArt\.\s*\d/,
    /\b(?:BGB|ABGB|StGB|HGB|ZPO|StPO|GG|AO|OR|ZGB|UWG|DSGVO|KSchG|GmbHG|AktG|InsO|EStG|UStG|BAO|AVG|GewO|ASVG|EheG|KartG|UGB|DSG|VwGVG|BauGB|VwVfG|SGB|BetrVG|BUrlG|TzBfG|AGG|MuSchG)\b/i,
    /\bgesetz\b/i,
    /\bvorschrift\b/i,
    /\bnorm\b/i,
    /\bparagraf\b/i,
    /\bregelung\b/i,
    /\bbestimmung\b/i,
  ];

  // Judgement signals: court names, case citations, "Urteil", "Beschluss"
  const judgementSignals = [
    /\b(?:BGH|BVerfG|BVerwG|BFH|BAG|BSG|EuGH|EuG|OLG|OVG|VGH|LG|AG|SG|BayObLG|KG)\b/i,
    /\b(?:OGH|VwGH|VfGH|OGD|OLG\s+\w+)\b/i, // AT courts
    /\bBundesgerichtshof\b/i,
    /\bOberster\s+Gerichtshof\b/i,
    /\bEuGH\b/i,
    /\bEuG\b/i,
    /\burteil\b/i,
    /\bbeschluss\b/i,
    /\bentscheidung\b/i,
    /\brechtsprechung\b/i,
    /\bjudikat/i,
    /\bpräjudiz/i,
    /\bECLI:/i,
    /\b\d+\s+\w+\s+\d+\/\d+/i, // file number pattern
  ];

  // Materials signals: "Gesetzesmaterialien", "Begründung", "RegE", "BR-Drucks"
  const materialsSignals = [
    /materialien/i,
    /\bbegründung\b/i,
    /\bregierungsentwurf\b/i,
    /\bRegE\b/i,
    /\bBR-Drucks/i,
    /\bBT-Drucks/i,
    /gesetzesbegründ/i,
    /\bregelungszweck\b/i,
  ];

  // Admin practice signals: "Verwaltungspraxis", "Erlass", "Verwaltungsvorschrift"
  const adminPracticeSignals = [
    /\bverwaltungspraxis\b/i,
    /\berlass\b/i,
    /\bverwaltungsvorschrift\b/i,
    /\banwendungshinweis\b/i,
    /\bverwaltungsanweisung\b/i,
  ];

  // Firm knowledge signals: case-specific terms, internal references
  const firmKnowledgeSignals = [
    /\bunsere?\s+(?:mandant|akte|sache|vertrag|klausel|memo|playbook|muster)\b/i,
    /\bmandant\b/i,
    /\bakte\b/i,
    /\bintern\b/i,
    /\bplaybook\b/i,
    /\bmemo\b/i,
    /\bklausel\b/i,
    /\bmuster\b/i,
    /\bvorlage\b/i,
    /\bschriftsatz\b/i,
  ];

  if (statuteSignals.some((rx) => rx.test(lower))) {
    types.add("statute");
    reasoning.statute = "Query enthält Gesetzes- oder Norm-Referenzen";
  }

  if (judgementSignals.some((rx) => rx.test(lower))) {
    types.add("judgement");
    reasoning.judgement = "Query enthält Judikatur- oder Gerichts-Referenzen";
  }

  if (materialsSignals.some((rx) => rx.test(lower))) {
    types.add("materials");
    reasoning.materials = "Query enthält Materialien-Referenzen";
  }

  if (adminPracticeSignals.some((rx) => rx.test(lower))) {
    types.add("admin_practice");
    reasoning.admin_practice = "Query enthält Verwaltungspraxis-Referenzen";
  }

  if (firmKnowledgeSignals.some((rx) => rx.test(lower)) || context?.hasActiveCase) {
    types.add("firm_knowledge");
    reasoning.firm_knowledge = context?.hasActiveCase
      ? "Aktive Mandate — Kanzleiwissen relevant"
      : "Query enthält Kanzleiwissen-Referenzen";
  }

  // If no specific type detected, default to statute + judgement
  if (types.size === 0) {
    types.add("statute");
    types.add("judgement");
    reasoning.statute = "Default: keine spezifischen Signale — statute + judgement als Fallback";
    reasoning.judgement = "Default: keine spezifischen Signale — statute + judgement als Fallback";
    confident = false;
  }

  return {
    sourceTypes: Array.from(types),
    reasoning: reasoning as Record<SourceType, string>,
    confident,
  };
}

// ── Stichtag (As-of-Date) ─────────────────────────────────────────────

export interface StichtagContext {
  /** The as-of date for historical law queries (ISO format: YYYY-MM-DD). */
  asOfDate?: string;
  /** Whether the date was explicitly set or inferred. */
  explicit: boolean;
  /** Source: "user" (explicitly stated), "case" (from case frontmatter), "default" (today). */
  source: "user" | "case" | "default";
}

/**
 * Extract a Stichtag (as-of date) from the query or context.
 *
 * Looks for patterns like:
 *  - "Stand 01.01.2024"
 *  - "nach dem Stand vom 15.03.2023"
 *  - "Stand 2024"
 *  - "im Jahr 2020"
 */
export function extractStichtag(query: string, caseDate?: string): StichtagContext {
  // Pattern 1: "Stand DD.MM.YYYY"
  const standMatch = query.match(
    /(?:nach\s+dem\s+)?Stand\s+(?:vom\s+)?(\d{1,2}\.\d{1,2}\.\d{2,4})/i
  );
  if (standMatch) {
    const date = parseGermanDate(standMatch[1]);
    if (date) {
      return { asOfDate: date, explicit: true, source: "user" };
    }
  }

  // Pattern 2: "Stand YYYY"
  const standYearMatch = query.match(/Stand\s+(\d{4})/i);
  if (standYearMatch) {
    return { asOfDate: `${standYearMatch[1]}-12-31`, explicit: true, source: "user" };
  }

  // Pattern 3: "im Jahr YYYY" / "nach dem Recht von YYYY"
  const yearMatch = query.match(/(?:im\s+Jahr|nach\s+dem\s+Recht\s+von)\s+(\d{4})/i);
  if (yearMatch) {
    return { asOfDate: `${yearMatch[1]}-12-31`, explicit: true, source: "user" };
  }

  // Pattern 4: Case date as fallback
  if (caseDate) {
    return { asOfDate: caseDate, explicit: false, source: "case" };
  }

  // Default: today
  return { asOfDate: new Date().toISOString().split("T")[0], explicit: false, source: "default" };
}

function parseGermanDate(dateStr: string): string | null {
  const parts = dateStr.split(".");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

// ── Jurisdiction Clarification ────────────────────────────────────────

export interface JurisdictionClarification {
  /** The resolved jurisdiction, or null if ambiguous. */
  jurisdiction: string | null;
  /** Whether the jurisdiction is ambiguous and needs clarification. */
  ambiguous: boolean;
  /** The detected possible jurisdictions. */
  candidates: string[];
  /** A human-readable clarification question, if ambiguous. */
  clarificationQuestion?: string;
  /** The statute(s) that caused the collision, if any. */
  collisionStatutes?: string[];
}

/**
 * Statute abbreviations that exist in multiple jurisdictions.
 * Used for collision detection when the query mentions them.
 */
const COLLISION_STATUTES: Record<string, string[]> = {
  StGB: ["DE", "AT", "CH"],
  ZPO: ["DE", "AT", "CH"],
  StPO: ["DE", "AT", "CH"],
  UWG: ["DE", "AT", "CH"],
  KSchG: ["AT", "DE"],
  GmbHG: ["DE", "AT"],
  AktG: ["DE", "AT"],
  EStG: ["DE", "AT"],
  UStG: ["DE", "AT"],
  KStG: ["DE", "AT"],
  BVG: ["AT", "CH"],
  DSG: ["AT", "CH"],
};

/**
 * Detect jurisdiction from query text and check for collisions.
 *
 * If the query mentions a statute that exists in multiple jurisdictions
 * (e.g. "ZPO" which exists in DE, AT, and CH), and no explicit jurisdiction
 * is provided, the jurisdiction is ambiguous.
 */
export function clarifyJurisdiction(
  query: string,
  explicitJurisdiction?: string
): JurisdictionClarification {
  // If explicit jurisdiction is provided, use it
  if (explicitJurisdiction) {
    return {
      jurisdiction: explicitJurisdiction.toUpperCase(),
      ambiguous: false,
      candidates: [explicitJurisdiction.toUpperCase()],
    };
  }

  const upper = query.toUpperCase();

  // Check for explicit jurisdiction signals in the query
  const deSignals =
    /\b(?:BGB|HGB|AO|InsO|FamFG|BetrVG|BUrlG|BVerfGG|TzBfG|AGG|MuSchG|GG|SGB|VwVfG|BauGB|GWB|ZVG|BGH|BVerfG|BVerwG|BFH|BAG|BSG)\b/;
  const atSignals =
    /\b(?:ABGB|UGB|AngG|ArbVG|AZG|ASVG|AVG|AuslBG|AVRAG|GlBG|MSchG|MRG|WEG|EO|AHG|KartG|GewO|GOG|IO|BAO|BewG|OGH|VwGH|VfGH|JN|VStG|AsylG|EheG)\b/;
  const chSignals = /\b(?:OR|ZGB|SchKG|UVG|ArG|GlG|MWSTG|DBG|VWVG|BGFA|BVG|Bundesgericht)\b/;
  const euSignals =
    /\b(?:DSGVO|DSRL|EUV|AEUV|EMRK|EuInsVO|EuZVO|BrüsselIbis|RomI|RomII|EuGH|EuG)\b/;

  const detected: string[] = [];
  if (deSignals.test(upper)) detected.push("DE");
  if (atSignals.test(upper)) detected.push("AT");
  if (chSignals.test(upper)) detected.push("CH");
  if (euSignals.test(upper)) detected.push("EU");

  // Check for collision statutes
  const collisionStatutes: string[] = [];
  for (const [statute, jurisdictions] of Object.entries(COLLISION_STATUTES)) {
    const regex = new RegExp(`\\b${statute}\\b`, "i");
    if (regex.test(query)) {
      collisionStatutes.push(statute);
      // Add all jurisdictions for this statute as candidates
      for (const jur of jurisdictions) {
        if (!detected.includes(jur)) detected.push(jur);
      }
    }
  }

  // Filter to unique DACH jurisdictions (EU is always additive, not exclusive)
  const dach = detected.filter((j) => j !== "EU");
  const hasEU = detected.includes("EU");

  // If only EU detected, jurisdiction is EU
  if (dach.length === 0 && hasEU) {
    return { jurisdiction: "EU", ambiguous: false, candidates: ["EU"] };
  }

  // If exactly one DACH jurisdiction detected (plus optional EU), use it
  if (dach.length === 1) {
    return { jurisdiction: dach[0], ambiguous: false, candidates: dach };
  }

  // If multiple DACH jurisdictions detected, it's ambiguous
  if (dach.length > 1) {
    // Check if collision statutes are the only reason for ambiguity
    const nonCollisionReasons = dach.filter((j) => {
      // Check if this jurisdiction was detected by a non-collision signal
      const signals = j === "DE" ? deSignals : j === "AT" ? atSignals : chSignals;
      const nonCollisionMatch = query.match(signals);
      if (!nonCollisionMatch) return false;
      // Check if the matched term is a collision statute
      const matched = nonCollisionMatch[0];
      return !COLLISION_STATUTES[matched];
    });

    if (nonCollisionReasons.length === 1) {
      return {
        jurisdiction: nonCollisionReasons[0],
        ambiguous: false,
        candidates: nonCollisionReasons,
      };
    }

    return {
      jurisdiction: null,
      ambiguous: true,
      candidates: dach,
      collisionStatutes,
      clarificationQuestion: `Ihre Frage könnte ${dach.join(" oder ")} betreffen. Welche Jurisdiktion ist relevant? (z.B. "${collisionStatutes[0] ?? "Das Gesetz"}" existiert in ${dach.join(" und ")})`,
    };
  }

  // No jurisdiction detected at all
  return {
    jurisdiction: null,
    ambiguous: false,
    candidates: [],
  };
}

// ── Full Source Routing ───────────────────────────────────────────────

export interface SourceRoutingResult {
  /** Classified source types for this query. */
  sourceTypes: SourceType[];
  /** Resolved jurisdiction (or null if ambiguous). */
  jurisdiction: string | null;
  /** Stichtag context. */
  stichtag: StichtagContext;
  /** Whether jurisdiction needs clarification. */
  needsClarification: boolean;
  /** Clarification question if needed. */
  clarificationQuestion?: string;
  /** Source IDs to search for each source type. */
  sourceMappings: Array<{
    sourceType: SourceType;
    sourceIds: string[];
  }>;
  /** Classification reasoning. */
  reasoning: Record<SourceType, string>;
}

export interface SourceRoutingOpts {
  query: string;
  /** Explicit jurisdiction (from user profile or case). */
  jurisdiction?: string;
  /** Case date for Stichtag fallback. */
  caseDate?: string;
  /** Whether an active case is open (enables firm_knowledge). */
  hasActiveCase?: boolean;
  /** Tenant's own source ID. */
  ownSourceId?: string;
}

/**
 * Full source routing: classify source types, resolve jurisdiction,
 * extract Stichtag, and map to concrete source IDs.
 */
export function routeSources(opts: SourceRoutingOpts): SourceRoutingResult {
  // 1. Classify source types
  const typeClassification = classifySourceTypes(opts.query, {
    hasActiveCase: opts.hasActiveCase,
    jurisdiction: opts.jurisdiction,
  });

  // 2. Clarify jurisdiction
  const jurResult = clarifyJurisdiction(opts.query, opts.jurisdiction);

  // 3. Extract Stichtag
  const stichtag = extractStichtag(opts.query, opts.caseDate);

  // 4. Map source types to source IDs
  const sourceMappings = typeClassification.sourceTypes.map((sourceType) => ({
    sourceType,
    sourceIds: sourceTypeToIds(sourceType, jurResult.jurisdiction ?? undefined, opts.ownSourceId),
  }));

  return {
    sourceTypes: typeClassification.sourceTypes,
    jurisdiction: jurResult.jurisdiction,
    stichtag,
    needsClarification: jurResult.ambiguous,
    clarificationQuestion: jurResult.clarificationQuestion,
    sourceMappings,
    reasoning: typeClassification.reasoning,
  };
}
