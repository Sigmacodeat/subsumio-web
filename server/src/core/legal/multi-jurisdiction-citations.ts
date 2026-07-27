/**
 * Multi-Jurisdiction Citation Extraction — DE/CH/EU court decisions
 *
 * WHY: `judikatur-citations.ts` is AT-specific (RIS "Norm" section + AT code
 * validation). DE decisions cite statutes inline ("§ 823 BGB", "Art. 2 GG"),
 * CH decisions use "Art. 41 OR", "Art. 2 ZGB". EU decisions cite regulations
 * and directives by article number.
 *
 * This module provides:
 *   - Per-jurisdiction code maps (DE_CODE_MAP, CH_CODE_MAP, EU_CODE_MAP)
 *   - Inline citation extraction for DE/CH/EU text
 *   - Slug resolution: `legal/statutes/<jur>/<abbr>/p-<N>` or `art-<N>`
 *
 * Fail-closed: only references to codes we hold in our corpus produce edges.
 */

export interface CrossNormReference {
  /** Statute abbreviation as printed in the decision, e.g. "BGB", "StGB", "OR". */
  code: string;
  /** Bare paragraph/article ref, e.g. "823", "211", "41". */
  ref: string;
  /** Jurisdiction: "de", "ch", "eu". */
  jurisdiction: string;
  /** Resolved statute slug prefix: `legal/statutes/de/bgb` etc. */
  statuteSlug: string;
}

// ── DE Code Map ──────────────────────────────────────────────────────────────

/** DE statute codes → our slug abbreviation (matches law-corpus/de/ filenames). */
export const DE_CODE_MAP: Record<string, string> = {
  BGB: "bgb",
  StGB: "stgb",
  StPO: "stpo",
  ZPO: "zpo",
  HGB: "hgb",
  GG: "gg",
  AO: "ao",
  EstG: "estg",
  KStG: "kstg",
  GewStG: "gewstg",
  UStG: "ustg",
  InsO: "inso",
  ZVG: "zvg",
  UWG: "uwg",
  BDSG: "bdsg",
  BauGB: "baugb",
  BetrVG: "betrvg",
  BewG: "bewg",
  ErbStG: "erbstg",
  FamFG: "famfg",
  GewO: "gewo",
  GmbHG: "gmbhg",
  GRestG: "grestg",
  PatG: "patg",
  RVG: "rvg",
  UrhG: "urhg",
  VwGO: "vwgo",
  AstG: "astg",
  EStDV: "estdv",
  UStDV: "ustdv",
  SolZG: "solzg",
  LStDV: "lstdv",
  StBerG: "stberg",
  StBVV: "stbvv",
  DSRL: "dsrl",
  DSGVO: "dsgvo",
};

// ── CH Code Map ──────────────────────────────────────────────────────────────

/** CH statute codes → our slug abbreviation (matches law-corpus/ch/ filenames). */
export const CH_CODE_MAP: Record<string, string> = {
  OR: "or",
  ZGB: "zgb",
  StGB: "stgb",
  StPO: "stpo",
  ZPO: "zpo",
  UWG: "uwg",
  VwVG: "vwvg",
  BVG: "bvg",
  DBG: "dbg",
  DSG: "dsg",
  MWSTG: "mwstg",
  SchKG: "schkg",
  BGFA: "bgfa",
  STHG: "sthg",
  ZG: "zg",
};

// ── EU Code Map ──────────────────────────────────────────────────────────────

/** EU regulations/directives → our slug abbreviation (matches law-corpus/eu/ filenames). */
export const EU_CODE_MAP: Record<string, string> = {
  DSGVO: "dsgvo",
  DSRL: "dsrl",
  EPrivacy: "eprivacy",
  DAC6: "dac6",
  MwStSystRL: "mwst-systemrichtlinie",
  BrusselsIbis: "brusselsibis",
  EUCO: "euco",
};

// ── Known Code Sets (for fast lookup) ─────────────────────────────────────────

const DE_CODES = new Set(Object.keys(DE_CODE_MAP));
const CH_CODES = new Set(Object.keys(CH_CODE_MAP));
const EU_CODES = new Set(Object.keys(EU_CODE_MAP));

// ── Citation Patterns ────────────────────────────────────────────────────────

/** DE inline patterns: "§ 823 BGB", "§§ 211, 212 StGB", "Art. 2 GG", "Art. 2 Abs. 1 GG". */
const DE_PATTERNS: RegExp[] = [
  /§+\s*(\d+[a-z]?)\s*(?:Abs\.?\s*\d+)?\s+(?:des\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
  /Art\.?\s+(\d+[a-z]?)\s*(?:Abs\.?\s*\d+)?\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
  /§+\s*(\d+[a-z]?)\s+(?:Abs\.?\s*\d+\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
];

/** CH inline patterns: "Art. 41 OR", "Art. 2 Abs. 1 ZGB", "Art. 122 StGB". */
const CH_PATTERNS: RegExp[] = [
  /Art\.?\s+(\d+[a-z]?)\s*(?:Abs\.?\s*\d+)?\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
  /§+\s*(\d+[a-z]?)\s*(?:Abs\.?\s*\d+)?\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
];

/** EU inline patterns: "Art. 5 DSGVO", "Art. 6 Abs. 1 DSGVO", "Art. 1 RL 95/46/EG". */
const EU_PATTERNS: RegExp[] = [
  /Art\.?\s+(\d+[a-z]?)\s*(?:Abs\.?\s*\d+)?\s+(DSGVO|DSRL|EPrivacy|DAC6|MwStSystRL|BrusselsIbis|EUCO)/g,
];

// ── Extraction Functions ─────────────────────────────────────────────────────

/**
 * Extract statute references from a DE court decision body.
 * Scans for inline "§ N BGB" / "Art. N GG" patterns.
 * Fail-closed: only returns references to known DE statute codes.
 */
export function extractDENormReferences(body: string): CrossNormReference[] {
  return extractInline(body, DE_PATTERNS, DE_CODES, "de", DE_CODE_MAP);
}

/**
 * Extract statute references from a CH court decision body.
 * Scans for inline "Art. N OR" / "Art. N ZGB" patterns.
 * Fail-closed: only returns references to known CH statute codes.
 */
export function extractCHNormReferences(body: string): CrossNormReference[] {
  return extractInline(body, CH_PATTERNS, CH_CODES, "ch", CH_CODE_MAP);
}

/**
 * Extract regulation references from an EU court decision body.
 * Scans for "Art. N DSGVO" etc.
 * Fail-closed: only returns references to known EU regulations.
 */
export function extractEUNormReferences(body: string): CrossNormReference[] {
  return extractInline(body, EU_PATTERNS, EU_CODES, "eu", EU_CODE_MAP);
}

/**
 * Unified multi-jurisdiction extraction.
 * Pass the jurisdiction ("de", "ch", "eu") and the decision body.
 * Returns references with resolved statute slugs.
 */
export function extractMultiJurisdictionNormReferences(
  body: string,
  jurisdiction: string
): CrossNormReference[] {
  switch (jurisdiction) {
    case "de":
      return extractDENormReferences(body);
    case "ch":
      return extractCHNormReferences(body);
    case "eu":
      return extractEUNormReferences(body);
    default:
      return [];
  }
}

// ── Internal ─────────────────────────────────────────────────────────────────

function extractInline(
  body: string,
  patterns: RegExp[],
  knownCodes: Set<string>,
  jurisdiction: string,
  codeMap: Record<string, string>
): CrossNormReference[] {
  const refs: CrossNormReference[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(body)) !== null) {
      const ref = m[1];
      const code = m[2];
      if (!knownCodes.has(code)) continue;
      const key = `${code}-${ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const abbr = codeMap[code];
      if (!abbr) continue;
      // CH uses "art-" prefix for Artikel, DE uses "p-" for Paragraphen
      const sectionPrefix = jurisdiction === "ch" || jurisdiction === "eu" ? "art-" : "p-";
      refs.push({
        code,
        ref,
        jurisdiction,
        statuteSlug: `legal/statutes/${jurisdiction}/${abbr}/${sectionPrefix}${ref}`,
      });
    }
  }

  return refs;
}
