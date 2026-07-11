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
