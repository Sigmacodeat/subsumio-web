/**
 * judikatur-citations — extract §-references from an OGH decision's RIS
 * "Norm" field and turn them into citation-graph edges (decision → statute §).
 *
 * WHY: RIS-OGD decisions carry a structured "Norm" section listing exactly
 * which §§ the decision is ABOUT (e.g. "ABGB §1249;\nABGB §1254;"), one per
 * line, immediately before "Rechtssatz". This is far more reliable than
 * extracting citations from free-text — it's RIS's own classification, not
 * an inference. Reuses the same `links` table + link_source='citation-graph'
 * provenance as server/src/core/legal/citation-graph.ts (statute-to-statute),
 * just with link_type='judikatur-cites' to distinguish decision→statute edges
 * from statute→statute ones.
 *
 * Pure + deterministic: no I/O, no engine, no page existence checks (the
 * import script validates against the actual imported statute pages so a
 * historical abbreviation that no longer matches a current code — e.g. "HGB"
 * before its 2007 rename to "UGB" — never produces a phantom edge).
 */

export interface NormReference {
  /** Statute abbreviation as printed by RIS, e.g. "ABGB", "StGB", "ZPO". */
  code: string;
  /** Bare paragraph ref, e.g. "1249", "125", "268". */
  ref: string;
}

/** A "Norm" section line: `<CODE> §<N>[suffix] [Abs<N>] [RIS classifier]... ;`.
 *  The classifier suffix (roman numerals, letters, "Abs N") is RIS's internal
 *  taxonomy, not part of the citation, and is deliberately NOT captured. */
const NORM_LINE = /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]*)\s+§+\s*(\d+[a-z]*)/;

/**
 * Extract §-references from a decision's "Norm" section. Expects the section
 * to start with a line that is exactly "Norm" and end at the next blank line
 * or "Rechtssatz" line (mirrors the RIS-OGD markdown shape written by
 * scripts/ingest-at-judikatur.ts / bulk-import-ogh-judikate.ts).
 */
export function extractNormReferences(body: string): NormReference[] {
  const lines = body.split("\n");
  const normIdx = lines.findIndex((l) => l.trim() === "Norm");
  if (normIdx === -1) return [];

  const refs: NormReference[] = [];
  const seen = new Set<string>();
  for (let i = normIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line === "Rechtssatz") break;
    const m = line.match(NORM_LINE);
    if (!m) continue;
    const code = m[1];
    const ref = m[2];
    const key = `${code}-${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ code, ref });
  }
  return refs;
}

/** Inline §-reference pattern: "§ 1152 ABGB", "§§ 12, 13 StGB", "Paragraph 6 Abs. 1 AngG".
 *  Used for VfGH/VwGH decisions which don't have a structured "Norm" section. */
const INLINE_PATTERNS: RegExp[] = [
  /§+\s*(\d+[a-z]?)\s*(?:Abs\.?\s*\d+)?\s+(?:des\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
  /Paragraph\s+(\d+[a-z]?)\s*,?\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
  /§+\s*(\d+[a-z]?)\s+(?:Abs\.?\s*\d+\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,10})/g,
];

/** Statute codes that are in our AT inventory — fail-closed: only these produce edges. */
const KNOWN_AT_CODES = new Set([
  "ABGB", "AHG", "AktG", "ALVG", "AMG", "AngG", "ArbVG", "ARG",
  "ASVG", "AsylG", "AußStrG", "AufenthG", "AuslBG", "AVG", "AVRAG",
  "AWG", "AZG", "B-VG", "BAO", "BBG", "BDG", "BewG", "BRAG",
  "BuAG", "BVerGG", "ChemG", "DSG", "E-GovG", "ECG", "EheG",
  "Eiwog", "EO", "EPG", "EstG", "ForstG", "FPG", "GebG", "GewO",
  "GlBG", "GmbHG", "GOG", "GRestG", "GukG", "GWG", "IO", "JGG",
  "JN", "KAG", "KartG", "KSchG", "KStG", "MedienG", "MRG", "MSchG",
  "N-G", "PatG", "PStG", "RAO", "SMG", "SPG", "StBG", "StGB",
  "StPO", "StRegG", "StVO", "TilgG", "TKG", "TschG", "UGB", "UrhG",
  "UStG", "UWG", "VBVG", "VKGG", "VStG", "VVG", "WaffG", "WEG",
  "WRG", "ZPO", "ZustG",
]);

/**
 * Extract §-references from free-text (VfGH/VwGH decisions).
 * Scans the entire body for inline patterns like "§ 1152 ABGB".
 * Fail-closed: only returns references to known AT statute codes.
 */
export function extractInlineNormReferences(body: string): NormReference[] {
  const refs: NormReference[] = [];
  const seen = new Set<string>();

  for (const pattern of INLINE_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(body)) !== null) {
      const ref = m[1];
      const code = m[2];
      if (!KNOWN_AT_CODES.has(code)) continue;
      const key = `${code}-${ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ code, ref });
    }
  }

  return refs;
}

/**
 * Unified extraction: tries "Norm" section first (OGH), falls back to
 * inline scanning (VfGH/VwGH). Returns deduplicated references.
 */
export function extractAllNormReferences(body: string): NormReference[] {
  const structured = extractNormReferences(body);
  if (structured.length > 0) return structured;
  return extractInlineNormReferences(body);
}
