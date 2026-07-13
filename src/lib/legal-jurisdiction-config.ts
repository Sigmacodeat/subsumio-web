/**
 * T1.4 — Jurisdiktions- und Rechtsgebietskonfiguration
 *
 * Deklarative Config für `jurisdiction × practice_area × procedure_type`.
 * Steuert:
 *  - Welche Gesetzesabkürzungen in welcher Jurisdiktion gültig sind
 *  - AT/DE-Abkürzungskollisionen (KSchG, StGB, ZPO, etc.)
 *  - Rechtsquellenlisten für Prompts (kein Freitext)
 *  - Arbeitsrechtsprompts nach AT und DE getrennt
 *  - Fehlende Jurisdiktion = Block, kein Default
 *  - Fremde Gesetze ohne EU-/Cross-Border-Regel blockiert
 */

import { CORPUS_META } from "@/lib/legal-grounding";

// ── Types ─────────────────────────────────────────────────────────────

export type JurisdictionCode = "DE" | "AT" | "CH" | "EU";

export type PracticeArea =
  | "civil"
  | "criminal"
  | "labor"
  | "commercial"
  | "family"
  | "tax"
  | "administrative"
  | "eu"
  | "consumer_protection"
  | "general";

export type ProcedureType =
  | "litigation"
  | "drafting"
  | "advice"
  | "review"
  | "research"
  | "fristen"
  | "general";

export interface AbbreviationCollision {
  abbreviation: string;
  jurisdictions: Record<
    JurisdictionCode,
    { fullName: string; description: string }
  >;
}

export interface PracticeAreaConfig {
  allowedStatutes: string[];
  forbiddenStatutes: string[];
  promptSection: string;
}

export interface JurisdictionConfig {
  code: JurisdictionCode;
  label: string;
  longLabel: string;
  lawSourceIds: string[];
  statutes: string[];
  collisionWarnings: string[];
  laborLawPrompt: string;
  practiceAreas: Partial<Record<PracticeArea, PracticeAreaConfig>>;
}

export interface JurisdictionResolutionResult {
  resolved: string | null;
  collisionWith: JurisdictionCode | null;
  description: string;
}

// ── Law Abbreviation Collisions ───────────────────────────────────────
//
// These abbreviations exist in multiple jurisdictions with DIFFERENT meanings.
// The LLM must be explicitly warned about these to prevent confusion.

export const LAW_ABBREVIATION_COLLISIONS: AbbreviationCollision[] = [
  {
    abbreviation: "KSchG",
    jurisdictions: {
      AT: {
        fullName: "Konsumentenschutzgesetz",
        description:
          "Österreichisches Konsumentenschutzgesetz (Schutz von Verbrauchern gegenüber Unternehmen)",
      },
      DE: {
        fullName: "Kündigungsschutzgesetz",
        description:
          "Deutsches Kündigungsschutzgesetz (Schutz vor unrechtmäßiger Kündigung im Arbeitsverhältnis)",
      },
      CH: {
        fullName: "N/A",
        description: "Kein direktes Äquivalent — Konsumentenschutz im OR geregelt",
      },
      EU: {
        fullName: "N/A",
        description: "Kein EU-Gesetz mit dieser Abkürzung",
      },
    },
  },
  {
    abbreviation: "StGB",
    jurisdictions: {
      DE: {
        fullName: "Strafgesetzbuch (Deutschland)",
        description: "Deutsches Strafgesetzbuch",
      },
      AT: {
        fullName: "Strafgesetzbuch (Österreich)",
        description: "Österreichisches Strafgesetzbuch",
      },
      CH: {
        fullName: "Schweizerisches Strafgesetzbuch",
        description: "Schweizer Strafgesetzbuch",
      },
      EU: {
        fullName: "N/A",
        description: "Kein EU-Strafgesetzbuch (nur Richtlinien)",
      },
    },
  },
  {
    abbreviation: "ZPO",
    jurisdictions: {
      DE: {
        fullName: "Zivilprozessordnung (Deutschland)",
        description: "Deutsche Zivilprozessordnung",
      },
      AT: {
        fullName: "Zivilprozessordnung (Österreich)",
        description: "Österreichische Zivilprozessordnung",
      },
      CH: {
        fullName: "Schweizerische Zivilprozessordnung",
        description: "Schweizer ZPO",
      },
      EU: {
        fullName: "N/A",
        description: "Kein EU-ZPO (nur EuZVO, Brüssel-Ibis-VO etc.)",
      },
    },
  },
  {
    abbreviation: "StPO",
    jurisdictions: {
      DE: {
        fullName: "Strafprozessordnung (Deutschland)",
        description: "Deutsche Strafprozessordnung",
      },
      AT: {
        fullName: "Strafprozessordnung (Österreich)",
        description: "Österreichische Strafprozessordnung",
      },
      CH: {
        fullName: "Schweizerische Strafprozessordnung",
        description: "Schweizer StPO",
      },
      EU: {
        fullName: "N/A",
        description: "Kein EU-StPO",
      },
    },
  },
  {
    abbreviation: "GmbHG",
    jurisdictions: {
      DE: {
        fullName: "Gesetz betreffend die Gesellschaften mit beschränkter Haftung",
        description: "Deutsches GmbH-Gesetz",
      },
      AT: {
        fullName: "GmbH-Gesetz (Österreich)",
        description: "Österreichisches GmbH-Gesetz",
      },
      CH: {
        fullName: "N/A",
        description: "Schweiz: OR regelt GmbH",
      },
      EU: {
        fullName: "N/A",
        description: "Kein EU-GmbHG",
      },
    },
  },
  {
    abbreviation: "AktG",
    jurisdictions: {
      DE: {
        fullName: "Aktiengesetz (Deutschland)",
        description: "Deutsches Aktiengesetz",
      },
      AT: {
        fullName: "Aktiengesetz (Österreich)",
        description: "Österreichisches Aktiengesetz",
      },
      CH: {
        fullName: "N/A",
        description: "Schweiz: OR regelt Aktiengesellschaft",
      },
      EU: {
        fullName: "N/A",
        description: "Kein EU-AktG",
      },
    },
  },
  {
    abbreviation: "UStG",
    jurisdictions: {
      DE: {
        fullName: "Umsatzsteuergesetz (Deutschland)",
        description: "Deutsches Umsatzsteuergesetz",
      },
      AT: {
        fullName: "Umsatzsteuergesetz (Österreich)",
        description: "Österreichisches Umsatzsteuergesetz",
      },
      CH: {
        fullName: "Mehrwertsteuergesetz",
        description: "Schweizer MWSTG (nicht UStG)",
      },
      EU: {
        fullName: "N/A",
        description: "EU: MwSt-SystRL, nicht UStG",
      },
    },
  },
  {
    abbreviation: "EStG",
    jurisdictions: {
      DE: {
        fullName: "Einkommensteuergesetz (Deutschland)",
        description: "Deutsches Einkommensteuergesetz",
      },
      AT: {
        fullName: "Einkommensteuergesetz (Österreich)",
        description: "Österreichisches Einkommensteuergesetz",
      },
      CH: {
        fullName: "N/A",
        description: "Schweiz: DBG (Bundesgesetz über die direkte Bundessteuer)",
      },
      EU: {
        fullName: "N/A",
        description: "Kein EU-EStG",
      },
    },
  },
  {
    abbreviation: "DSG",
    jurisdictions: {
      AT: {
        fullName: "Datenschutzgesetz (Österreich)",
        description: "Österreichisches Datenschutzgesetz",
      },
      DE: {
        fullName: "N/A",
        description: "Deutschland: BDSG (nicht DSG)",
      },
      CH: {
        fullName: "Datenschutzgesetz (Schweiz)",
        description: "Schweizer DSG",
      },
      EU: {
        fullName: "DSGVO",
        description: "EU: Datenschutz-Grundverordnung (DSGVO, nicht DSG)",
      },
    },
  },
  {
    abbreviation: "UWG",
    jurisdictions: {
      DE: {
        fullName: "Gesetz gegen den unlauteren Wettbewerb",
        description: "Deutsches UWG",
      },
      AT: {
        fullName: "Bundesgesetz gegen den unlauteren Wettbewerb",
        description: "Österreichisches UWG",
      },
      CH: {
        fullName: "Bundesgesetz gegen den unlauteren Wettbewerb",
        description: "Schweizer UWG",
      },
      EU: {
        fullName: "N/A",
        description: "EU: UCP-Richtlinie, nicht UWG",
      },
    },
  },
  {
    abbreviation: "InsO",
    jurisdictions: {
      DE: {
        fullName: "Insolvenzordnung",
        description: "Deutsche Insolvenzordnung",
      },
      AT: {
        fullName: "N/A",
        description: "Österreich verwendet IO (Insolvenzordnung), nicht die Abkürzung InsO",
      },
      CH: {
        fullName: "N/A",
        description: "Schweiz: Bundesgesetz über Schuldbetreibung und Konkurs (SchKG, nicht InsO)",
      },
      EU: {
        fullName: "EuInsVO",
        description: "EU: Europäische Insolvenzverordnung (EuInsVO, nicht InsO)",
      },
    },
  },
];

// ── Collision lookup map ──────────────────────────────────────────────

const COLLISION_MAP: Map<string, AbbreviationCollision> = new Map(
  LAW_ABBREVIATION_COLLISIONS.map((c) => [c.abbreviation.toUpperCase(), c])
);

// ── Jurisdiction Config ───────────────────────────────────────────────

function statutesForJurisdiction(jur: string): string[] {
  return Object.entries(CORPUS_META)
    .filter(([, meta]) => meta.jurisdiction === jur)
    .map(([, meta]) => meta.label);
}

function statuteLabelsForJurisdiction(jur: string): string[] {
  const labels = statutesForJurisdiction(jur);
  // Remove jurisdiction suffixes like "(AT)", "(DE)" for cleaner prompt lists
  return labels.map((l) => l.replace(/\s*\([A-Z]+\)\s*$/g, "").trim());
}

const DE_STATUTES = statuteLabelsForJurisdiction("de");
const AT_STATUTES = statuteLabelsForJurisdiction("at");
const CH_STATUTES = statuteLabelsForJurisdiction("ch");
const EU_STATUTES = statuteLabelsForJurisdiction("eu");

function collisionsForJurisdiction(jur: JurisdictionCode): string[] {
  return LAW_ABBREVIATION_COLLISIONS.filter(
    (c) => c.jurisdictions[jur].fullName !== "N/A"
  ).map((c) => {
    const own = c.jurisdictions[jur];
    const others = (Object.keys(c.jurisdictions) as JurisdictionCode[])
      .filter((j) => j !== jur && c.jurisdictions[j].fullName !== "N/A")
      .map((j) => `${j}: ${c.jurisdictions[j].fullName}`);
    return `${c.abbreviation} = ${own.fullName} (NICHT: ${others.join("; ")})`;
  });
}

// ── Labor Law Prompts (AT vs DE) ──────────────────────────────────────

const AT_LABOR_LAW_PROMPT = `## ARBEITSRECHT (ÖSTERREICH)
Österreichisches Arbeitsrecht basiert auf:
- AngG (Angestelltengesetz) — Kündigung, Urlaub, Entgelt
- ArbVG (Arbeitsverfassungsgesetz) — Betriebsrat, Mitbestimmung
- AZG (Arbeitszeitgesetz) — Arbeits- und Ruhezeiten
- ASVG (Allgemeines Sozialversicherungsgesetz) — Sozialversicherung
- AVG (Allgemeines Verwaltungsverfahrensgesetz) — Verfahrensrecht
- BAG (Bundes-Arbeitsgerichtsgesetz) — Arbeitsgerichtsbarkeit
- AuslBG (Ausländerbeschäftigungsgesetz) — Ausländerbeschäftigung
- AVRAG (Arbeitsvertragsrechts-Anpassungsgesetz) — EU-Rechtsanpassung
- GlBG (Gleichbehandlungsgesetz) — Diskriminierungsschutz
- MSchG (Mutterschutzgesetz) — Mutterschutz
- KSchG (Konsumentenschutzgesetz) — VERWIRKUNG: KSchG in AT = Konsumentenschutz, NICHT Kündigungsschutz!

WICHTIG: In Österreich gibt es KEIN Kündigungsschutzgesetz (KSchG DE).
Kündigungsschutz im Arbeitsrecht wird über AngG, ArbVG und GlBG geregelt.
Verwende NIEMALS § 1 KSchG (DE) in einem AT-Arbeitsrechtsfall.`;

const DE_LABOR_LAW_PROMPT = `## ARBEITSRECHT (DEUTSCHLAND)
Deutsches Arbeitsrecht basiert auf:
- BGB (§§ 611-630 BGB) — Dienstvertrag, Arbeitsvertrag
- KSchG (Kündigungsschutzgesetz) — Kündigungsschutz (§ 1 KSchG: soziale Rechtfertigung)
- BetrVG (Betriebsverfassungsgesetz) — Betriebsrat, Mitbestimmung
- BUrlG (Bundesurlaubsgesetz) — Urlaubsanspruch
- SGB (Sozialgesetzbuch) — Sozialversicherung
- TzBfG (Teilzeit- und Befristungsgesetz) — Teilzeit, Befristung
- AGG (Allgemeines Gleichbehandlungsgesetz) — Diskriminierungsschutz
- MuSchG (Mutterschutzgesetz) — Mutterschutz
- NachwG (Nachweisgesetz) — Schriftlicher Arbeitsvertrag
- ArbGG (Arbeitsgerichtsgesetz) — Arbeitsgerichtsbarkeit

WICHTIG: KSchG in DE = Kündigungsschutzgesetz (§ 1 KSchG: soziale Rechtfertigung).
Verwende NIEMALS AT-AngG, ArbVG (AT), ASVG oder AT-KSchG (Konsumentenschutz) in einem DE-Arbeitsrechtsfall.`;

const CH_LABOR_LAW_PROMPT = `## ARBEITSRECHT (SCHWEIZ)
Schweizerisches Arbeitsrecht basiert auf:
- OR (Obligationenrecht) — Arbeitsvertrag (Art. 319-362 OR)
- ArG (Arbeitsgesetz) — Arbeits- und Ruhezeit
- BVG (Berufliche Vorsorge) — Pensionskasse
- UVG (Unfallversicherungsgesetz) — Unfallversicherung
- AVG (Arbeitslosenversicherungsgesetz) — Arbeitslosenversicherung
- GlG (Gleichstellungsgesetz) — Gleichstellung von Frau und Mann

WICHTIG: Schweiz hat kein KSchG. Kündigungsschutz über OR Art. 335-338.
Verwende NIEMALS BGB, KSchG (DE/AT) oder BetrVG in einem CH-Arbeitsrechtsfall.`;

// ── Practice Area Configs ─────────────────────────────────────────────

function buildPracticeAreaConfig(
  jur: JurisdictionCode,
  area: PracticeArea,
  statutes: string[],
  forbidden: string[],
  promptSection: string
): PracticeAreaConfig {
  void jur;
  void area;
  return {
    allowedStatutes: statutes,
    forbiddenStatutes: forbidden,
    promptSection,
  };
}

// ── Main Config ───────────────────────────────────────────────────────

export const JURISDICTION_CONFIGS: Record<JurisdictionCode, JurisdictionConfig> = {
  DE: {
    code: "DE",
    label: "deutsches",
    longLabel: "deutsches Recht (BGB, StGB, ZPO, HGB, AO, etc.)",
    lawSourceIds: ["law-de", "law-eu"],
    statutes: DE_STATUTES,
    collisionWarnings: collisionsForJurisdiction("DE"),
    laborLawPrompt: DE_LABOR_LAW_PROMPT,
    practiceAreas: {
      labor: buildPracticeAreaConfig(
        "DE",
        "labor",
        ["BGB", "KSchG", "BetrVG", "BUrlG", "SGB", "TzBfG", "AGG", "MuSchG", "NachwG", "ArbGG"],
        ["AngG", "ArbVG", "ASVG", "AZG", "AVG", "AuslBG", "AVRAG", "GlBG", "MSchG", "OR"],
        DE_LABOR_LAW_PROMPT
      ),
      civil: buildPracticeAreaConfig(
        "DE",
        "civil",
        ["BGB", "ZPO", "HGB", "InsO", "FamFG", "GmbHG", "AktG", "UWG"],
        ["ABGB", "UGB", "KSchG", "MRG", "WEG", "EO", "OR", "ZGB"],
        "Zivilrecht: BGB (Allgemeiner Teil, Schuldrecht, Sachenrecht, Familienrecht, Erbrecht), ZPO (Zivilprozess)"
      ),
      criminal: buildPracticeAreaConfig(
        "DE",
        "criminal",
        ["StGB", "StPO", "GG"],
        ["StGB (AT)", "StPO (AT)", "StGB (CH)", "StPO (CH)"],
        "Strafrecht: StGB (Strafgesetzbuch), StPO (Strafprozessordnung)"
      ),
      tax: buildPracticeAreaConfig(
        "DE",
        "tax",
        ["AO", "EStG", "UStG", "GmbHG"],
        ["BAO", "EStG (AT)", "UStG (AT)", "BewG (AT)", "KStG (AT)"],
        "Steuerrecht: AO (Abgabenordnung), EStG, UStG"
      ),
      consumer_protection: buildPracticeAreaConfig(
        "DE",
        "consumer_protection",
        ["BGB", "UWG"],
        ["KSchG"],
        "Verbraucherschutz: BGB (§§ 312 ff. Verbraucherverträge), UWG"
      ),
    },
  },
  AT: {
    code: "AT",
    label: "österreichisches",
    longLabel: "österreichisches Recht (ABGB, StGB, ZPO, UGB, KSchG, ArbVG, AHG, etc.)",
    lawSourceIds: ["law-at", "law-at-judikatur", "law-eu"],
    statutes: AT_STATUTES,
    collisionWarnings: collisionsForJurisdiction("AT"),
    laborLawPrompt: AT_LABOR_LAW_PROMPT,
    practiceAreas: {
      labor: buildPracticeAreaConfig(
        "AT",
        "labor",
        ["AngG", "ArbVG", "AZG", "ASVG", "AVG", "AuslBG", "AVRAG", "GlBG", "MSchG"],
        ["BGB", "KSchG", "BetrVG", "BUrlG", "SGB", "TzBfG", "AGG", "MuSchG", "NachwG", "OR"],
        AT_LABOR_LAW_PROMPT
      ),
      civil: buildPracticeAreaConfig(
        "AT",
        "civil",
        ["ABGB", "ZPO", "UGB", "KSchG", "MRG", "WEG", "EO", "AHG"],
        ["BGB", "HGB", "InsO", "FamFG", "GmbHG", "AktG", "OR", "ZGB"],
        "Zivilrecht: ABGB (Allgemeines bürgerliches Gesetzbuch), ZPO (AT), UGB (Unternehmensgesetzbuch), KSchG (Konsumentenschutzgesetz)"
      ),
      criminal: buildPracticeAreaConfig(
        "AT",
        "criminal",
        ["StGB (AT)", "StPO (AT)", "JGG (AT)"],
        ["StGB", "StPO", "StGB (CH)", "StPO (CH)"],
        "Strafrecht: StGB (Österreich), StPO (Österreich)"
      ),
      tax: buildPracticeAreaConfig(
        "AT",
        "tax",
        ["BAO", "EStG (AT)", "UStG (AT)", "BewG (AT)", "KStG (AT)"],
        ["AO", "EStG", "UStG", "BewG", "KStG"],
        "Steuerrecht: BAO (Bundesabgabenordnung), EStG (AT), UStG (AT)"
      ),
      consumer_protection: buildPracticeAreaConfig(
        "AT",
        "consumer_protection",
        ["KSchG", "ABGB"],
        ["BGB", "UWG"],
        "Verbraucherschutz: KSchG (Konsumentenschutzgesetz), ABGB"
      ),
    },
  },
  CH: {
    code: "CH",
    label: "schweizerisches",
    longLabel: "Schweizer Recht (OR, ZGB, StGB, etc.)",
    lawSourceIds: ["law-ch", "law-eu"],
    statutes: CH_STATUTES,
    collisionWarnings: collisionsForJurisdiction("CH"),
    laborLawPrompt: CH_LABOR_LAW_PROMPT,
    practiceAreas: {
      labor: buildPracticeAreaConfig(
        "CH",
        "labor",
        ["OR", "ArG", "BVG", "UVG", "AVG", "GlG"],
        ["BGB", "KSchG", "BetrVG", "AngG", "ArbVG", "ASVG"],
        CH_LABOR_LAW_PROMPT
      ),
      civil: buildPracticeAreaConfig(
        "CH",
        "civil",
        ["OR", "ZGB"],
        ["BGB", "ABGB", "HGB", "UGB", "KSchG", "ZPO", "ZPO (AT)"],
        "Zivilrecht: OR (Obligationenrecht), ZGB (Zivilgesetzbuch)"
      ),
      criminal: buildPracticeAreaConfig(
        "CH",
        "criminal",
        ["StGB (CH)", "StPO (CH)"],
        ["StGB", "StPO", "StGB (AT)", "StPO (AT)"],
        "Strafrecht: StGB (Schweiz), StPO (Schweiz)"
      ),
    },
  },
  EU: {
    code: "EU",
    label: "EU-",
    longLabel: "EU-Recht (DSGVO, Rom I, Rom II, Brüssel Ibis, etc.)",
    lawSourceIds: ["law-eu"],
    statutes: EU_STATUTES,
    collisionWarnings: [],
    laborLawPrompt: "",
    practiceAreas: {},
  },
};

// ── Helper Functions ──────────────────────────────────────────────────

/**
 * Normalize a jurisdiction string to uppercase JurisdictionCode.
 * Returns undefined for invalid/missing values.
 */
export function normalizeJurisdiction(
  jur: string | undefined | null
): JurisdictionCode | undefined {
  if (!jur) return undefined;
  const upper = jur.trim().toUpperCase();
  if (upper === "DE" || upper === "AT" || upper === "CH" || upper === "EU") {
    return upper;
  }
  return undefined;
}

/**
 * Require a valid jurisdiction. Throws if missing or invalid.
 * This enforces the "no default" rule — missing jurisdiction = block.
 */
export function requireJurisdiction(
  jur: string | undefined | null
): JurisdictionCode {
  const normalized = normalizeJurisdiction(jur);
  if (!normalized) {
    throw new JurisdictionMissingError(
      "Jurisdiktion ist erforderlich — kein Default wird angewendet. " +
        "Setze x-subsumio-jurisdiction oder x-subsumio-case-jurisdiction Header."
    );
  }
  return normalized;
}

/**
 * Custom error class for missing jurisdiction.
 * Callers can check `instanceof JurisdictionMissingError` to distinguish
 * from other errors and return appropriate HTTP 400 responses.
 */
export class JurisdictionMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JurisdictionMissingError";
  }
}

/**
 * Get the full jurisdiction config.
 */
export function getJurisdictionConfig(
  jur: JurisdictionCode | string
): JurisdictionConfig {
  const code = normalizeJurisdiction(jur) ?? "DE";
  return JURISDICTION_CONFIGS[code];
}

/**
 * Get the practice area config for a jurisdiction.
 * Returns undefined if the practice area is not configured for this jurisdiction.
 */
export function getPracticeAreaConfig(
  jur: JurisdictionCode | string,
  area: PracticeArea
): PracticeAreaConfig | undefined {
  const config = getJurisdictionConfig(jur);
  return config.practiceAreas[area];
}

/**
 * Get all allowed statute labels for a jurisdiction (optionally scoped by practice area).
 */
export function getAllowedStatutes(
  jur: JurisdictionCode | string,
  area?: PracticeArea
): string[] {
  const config = getJurisdictionConfig(jur);
  if (area) {
    const paConfig = config.practiceAreas[area];
    if (paConfig) return paConfig.allowedStatutes;
  }
  return config.statutes;
}

/**
 * Get all forbidden statute labels for a jurisdiction (statutes from other jurisdictions).
 */
export function getForbiddenStatutes(
  jur: JurisdictionCode | string,
  area?: PracticeArea
): string[] {
  const code = normalizeJurisdiction(jur) ?? "DE";
  const config = getJurisdictionConfig(code);
  if (area) {
    const paConfig = config.practiceAreas[area];
    if (paConfig) return paConfig.forbiddenStatutes;
  }
  // All statutes from other jurisdictions are forbidden
  const otherJurisdictions = (["DE", "AT", "CH", "EU"] as JurisdictionCode[]).filter(
    (j) => j !== code
  );
  const forbidden = new Set<string>();
  for (const otherJur of otherJurisdictions) {
    const otherConfig = JURISDICTION_CONFIGS[otherJur];
    for (const s of otherConfig.statutes) {
      // Don't forbid statutes that also exist in this jurisdiction (shared labels)
      if (!config.statutes.includes(s)) {
        forbidden.add(s);
      }
    }
  }
  return Array.from(forbidden);
}

/**
 * Resolve a law abbreviation within a jurisdiction context.
 * Returns the resolved full name, or a collision warning if the abbreviation
 * exists in multiple jurisdictions with different meanings.
 */
export function resolveAbbreviation(
  jur: JurisdictionCode | string,
  abbr: string
): JurisdictionResolutionResult {
  const code = normalizeJurisdiction(jur) ?? "DE";
  const collision = COLLISION_MAP.get(abbr.toUpperCase());
  if (collision) {
    const entry = collision.jurisdictions[code];
    if (entry && entry.fullName !== "N/A") {
      // Check if other jurisdictions also have this abbreviation
      const otherJurs = (Object.keys(collision.jurisdictions) as JurisdictionCode[])
        .filter((j) => j !== code && collision.jurisdictions[j].fullName !== "N/A");
      return {
        resolved: entry.fullName,
        collisionWith: otherJurs.length > 0 ? otherJurs[0] : null,
        description: entry.description,
      };
    }
  }
  // No collision — check if it's a valid statute for this jurisdiction
  const config = getJurisdictionConfig(code);
  const cleanAbbr = abbr.replace(/\s*\([A-Z]+\)\s*$/g, "").trim();
  const found = config.statutes.find(
    (s) => s.toUpperCase() === cleanAbbr.toUpperCase()
  );
  return {
    resolved: found ?? null,
    collisionWith: null,
    description: found ? "Gültige Abkürzung in dieser Jurisdiktion" : "Unbekannte Abkürzung",
  };
}

/**
 * Check if a law abbreviation is allowed in the given jurisdiction.
 */
export function isLawAllowed(
  jur: JurisdictionCode | string,
  abbr: string
): boolean {
  const code = normalizeJurisdiction(jur) ?? "DE";
  const config = getJurisdictionConfig(code);
  const cleanAbbr = abbr.replace(/\s*\([A-Z]+\)\s*$/g, "").trim();
  // Check own statutes
  if (
    config.statutes.some((s) => s.toUpperCase() === cleanAbbr.toUpperCase())
  ) {
    return true;
  }
  // EU law is always allowed
  const euConfig = JURISDICTION_CONFIGS.EU;
  if (euConfig.statutes.some((s) => s.toUpperCase() === cleanAbbr.toUpperCase())) {
    return true;
  }
  // Check collision map — if the abbreviation resolves to this jurisdiction, allow it
  const collision = COLLISION_MAP.get(cleanAbbr.toUpperCase());
  if (collision) {
    const entry = collision.jurisdictions[code];
    if (entry && entry.fullName !== "N/A") {
      return true;
    }
  }
  return false;
}

/**
 * Check if a law abbreviation is foreign (from another jurisdiction).
 * EU law is NOT foreign — it applies to all DACH jurisdictions.
 */
export function isForeignLaw(
  jur: JurisdictionCode | string,
  abbr: string
): boolean {
  return !isLawAllowed(jur, abbr);
}

// ── Prompt Builders ───────────────────────────────────────────────────

/**
 * Build the jurisdiction-specific prompt section for injection into system prompts.
 * Includes:
 * - Allowed statutes list
 * - Forbidden statutes list (foreign laws)
 * - Collision warnings
 * - Labor law section (if practice area is labor or general)
 */
export function buildJurisdictionPromptSection(
  jur: JurisdictionCode | string,
  area?: PracticeArea
): string {
  const code = normalizeJurisdiction(jur);
  if (!code) {
    return "WARNUNG: Keine Jurisdiktion bestimmt. Rechtsauskünfte sind blockiert bis die Jurisdiktion geklärt ist.";
  }
  const config = getJurisdictionConfig(code);
  const allowed = area ? getAllowedStatutes(code, area) : config.statutes;
  const forbidden = getForbiddenStatutes(code, area);

  const parts: string[] = [];
  parts.push(`## JURISDIKTION: ${config.longLabel}`);
  parts.push("");
  parts.push("### Erlaubte Gesetze (ausschließlich diese verwenden):");
  parts.push(allowed.join(", "));
  parts.push("");
  if (forbidden.length > 0) {
    parts.push("### VERBOTENE Gesetze (aus anderen Jurisdiktionen — NIEMALS verwenden):");
    parts.push(forbidden.join(", "));
    parts.push("");
  }
  if (config.collisionWarnings.length > 0) {
    parts.push("### ABKÜRZUNGSKOLLISIONEN (besondere Vorsicht):");
    for (const w of config.collisionWarnings) {
      parts.push(`- ${w}`);
    }
    parts.push("");
  }
  // Labor law prompt for labor practice area or general
  if (area === "labor" || (!area && config.laborLawPrompt)) {
    parts.push(config.laborLawPrompt);
    parts.push("");
  }
  parts.push(
    "### EU-RECHT (immer erlaubt): DSGVO, Rom I, Rom II, Brüssel Ibis — EU-Verordnungen gelten in allen DACH-Jurisdiktionen."
  );
  parts.push(
    "### CROSS-BORDER: Fremde Gesetze dürfen NUR bei explizitem Cross-Border-Bezug zitiert werden (z.B. deutsches BGB in einem AT-Fall mit Auslandsbezug). Ohne solchen Bezug: VERBOTEN."
  );

  return parts.join("\n");
}

/**
 * Build collision warnings only (for contexts where full section is too verbose).
 */
export function buildCollisionWarningSection(
  jur: JurisdictionCode | string
): string {
  const code = normalizeJurisdiction(jur);
  if (!code) return "";
  const config = getJurisdictionConfig(code);
  if (config.collisionWarnings.length === 0) return "";
  const parts = ["## ABKÜRZUNGSKOLLISIONEN — VORSICHT:"];
  for (const w of config.collisionWarnings) {
    parts.push(`- ${w}`);
  }
  return parts.join("\n");
}

/**
 * Build the labor law prompt for a specific jurisdiction.
 */
export function buildLaborLawPrompt(
  jur: JurisdictionCode | string
): string {
  const code = normalizeJurisdiction(jur);
  if (!code) return "";
  return getJurisdictionConfig(code).laborLawPrompt;
}

/**
 * Build a concise source list for prompt injection (instead of free-text law names).
 */
export function buildSourceListPrompt(
  jur: JurisdictionCode | string,
  area?: PracticeArea
): string {
  const code = normalizeJurisdiction(jur);
  if (!code) return "Keine Rechtsquellen verfügbar (Jurisdiktion fehlt).";
  const allowed = getAllowedStatutes(code, area);
  const euStatutes = JURISDICTION_CONFIGS.EU.statutes;
  return `Rechtsquellen für ${code}: ${allowed.join(", ")}, EU: ${euStatutes.join(", ")}`;
}
