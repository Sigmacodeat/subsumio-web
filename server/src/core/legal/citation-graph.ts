/**
 * citation-graph — extract §-to-§ cross-reference edges from already-split
 * statute sections, for the generic `links` table's citation-graph provenance
 * (see migrate.ts: "external derivers (e.g. 'citation-graph') stamp their own
 * tag without a gbrain migration").
 *
 * WHY: a statute's §§ constantly cross-reference each other ("§ 1295 ABGB"
 * cites "§ 1489", "§ 1497"), but that's currently only prose — nothing lets
 * the brain TRAVERSE "which §§ does this one depend on / get cited by". The
 * engine already has a generic recursive graph walk (relationalFanout, the
 * 4th RRF search arm) built for exactly this shape of query; this module
 * only needs to POPULATE `links` rows for it to traverse.
 *
 * v1 covered WITHIN-STATUTE citations only (§ 1295 → § 1489, both ABGB). v2
 * (extractCrossCodeCitations below) adds CROSS-code citations: Austrian legal
 * prose reliably prints these as `§ N [Abs. M] <CODE>` — the code abbreviation
 * directly follows the § number (e.g. "§ 364 Abs. 3 ABGB", "§ 29 IO",
 * "§ 433 Abs. 1 ZPO"). Only abbreviations in the caller-supplied allowlist are
 * accepted (real statute abbreviations we hold pages for); everything else —
 * "Abs" itself, a capitalized word starting the next sentence, a code we
 * don't carry — is silently skipped. Same fail-closed principle as the
 * within-statute path: a missed cross-reference costs nothing, a wrong one
 * would be a hallucinated citation.
 *
 * Pure + deterministic: no I/O, no engine. The import script
 * (scripts/import-citation-graph.ts) does the I/O via engine.addLinksBatch.
 */

import type { StatuteSection } from "./split-statute.ts";

export interface CitationEdge {
  /** Section ref of the CITING §, e.g. "1295". */
  fromRef: string;
  /** Section ref of the CITED §, e.g. "1489". */
  toRef: string;
  /** Short surrounding text snippet for the edge's `context` column. */
  context: string;
}

/** Matches `§ N[suffix]` or `§§ N[suffix] (und|bis|,) M[suffix] ...` — German
 *  legal prose lists a range/enumeration after a single `§§` marker (e.g.
 *  "§§ 29 und 30", "§§ 21 bis 25"), so trailing `und`/`bis`/`,`-joined numbers
 *  without their own `§` prefix are still captured as separate citations. */
const CITATION_REF = /§§?\s*(\d+[a-z]*)((?:\s*(?:und|bis|,)\s*\d+[a-z]*)*)/g;

/** Splits the optional trailing `und 30`/`bis 25`/`, 31` tail of a citation
 *  match into its individual ref numbers. */
function splitTrailingRefs(tail: string): string[] {
  if (!tail) return [];
  const out: string[] = [];
  for (const m of tail.matchAll(/(\d+[a-z]*)/g)) out.push(m[1]);
  return out;
}

/** Cap on citations extracted per section — a section listing dozens of
 *  refs (e.g. a repeal/transition clause enumerating "§§ 1 bis 50") is noise,
 *  not a meaningful dependency graph; real substantive citations are sparse. */
const MAX_EDGES_PER_SECTION = 15;

/** Snippet radius (chars) around a citation match, for the edge's `context`. */
const CONTEXT_RADIUS = 60;

/**
 * Extract §→§ citation edges from a statute's already-split sections.
 * Only emits edges where the cited ref is a KNOWN section of the same
 * statute (rejects citations to non-existent/out-of-corpus §§, which are
 * either OCR noise or cross-code references out of v1 scope) and where the
 * cited ref differs from the citing section itself (no self-loops).
 */
export function extractCitations(sections: StatuteSection[]): CitationEdge[] {
  const knownRefs = new Set(sections.map((s) => s.ref));
  const edges: CitationEdge[] = [];

  for (const section of sections) {
    const seenInSection = new Set<string>();
    let count = 0;
    for (const m of section.body.matchAll(CITATION_REF)) {
      if (count >= MAX_EDGES_PER_SECTION) break;
      const refs = [m[1], ...splitTrailingRefs(m[2] ?? "")];
      const start = Math.max(0, (m.index ?? 0) - CONTEXT_RADIUS);
      const end = Math.min(section.body.length, (m.index ?? 0) + m[0].length + CONTEXT_RADIUS);
      const context = section.body.slice(start, end).replace(/\s+/g, " ").trim();

      for (const toRef of refs) {
        if (count >= MAX_EDGES_PER_SECTION) break;
        if (toRef === section.ref) continue; // self-reference (own heading echo)
        if (!knownRefs.has(toRef)) continue; // not a real § in this statute
        if (seenInSection.has(toRef)) continue; // dedupe within one section
        seenInSection.add(toRef);
        count++;
        edges.push({ fromRef: section.ref, toRef, context });
      }
    }
  }
  return edges;
}

export interface CrossCodeCitationEdge {
  /** Section ref of the CITING §, in the statute being scanned. */
  fromRef: string;
  /** Section ref of the CITED § in the OTHER statute. */
  toRef: string;
  /** The other statute's abbr key (matches import-statutes-split.ts's `abbr`
   *  field, e.g. "zpo", "io", "asvg") — already resolved via the allowlist. */
  toAbbr: string;
  /** Short surrounding text snippet for the edge's `context` column. */
  context: string;
}

/** `§ N[suffix] [Abs. M[suffix]] <Code>` — the code directly follows the §
 *  number (optionally after an "Abs." qualifier). Captures the § ref and the
 *  following capitalized word as a candidate code; the caller's allowlist
 *  does the real validation (this regex alone would also match ordinary
 *  capitalized German words starting the next clause). */
const CROSS_CODE_REF =
  /§+\s*(\d+[a-z]*)\s+(?:Abs\.?\s*\d+[a-z]*\s+)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,15})\b/g;

/**
 * Extract §→§ citations that point to a DIFFERENT statute (e.g. "§ 29 IO"
 * cited from inside ABGB). `knownAbbrs` maps the abbreviation AS PRINTED IN
 * RIS PROSE (e.g. "ZPO", "IO", "AußStrG") to our internal slug abbr (e.g.
 * "zpo", "io", "au-strg") for every statute we hold pages for — anything not
 * in this map is ignored, never guessed. `ownAbbr` (our slug form) excludes
 * same-code matches, which extractCitations already covers.
 */
export function extractCrossCodeCitations(
  sections: StatuteSection[],
  ownAbbr: string,
  knownAbbrs: Record<string, string>
): CrossCodeCitationEdge[] {
  const edges: CrossCodeCitationEdge[] = [];

  for (const section of sections) {
    const seenInSection = new Set<string>();
    let count = 0;
    for (const m of section.body.matchAll(CROSS_CODE_REF)) {
      if (count >= MAX_EDGES_PER_SECTION) break;
      const toRef = m[1];
      const printedCode = m[2];
      const toAbbr = knownAbbrs[printedCode];
      if (!toAbbr) continue; // not a recognized statute abbreviation
      if (toAbbr === ownAbbr) continue; // same-code, extractCitations' job
      const key = `${toAbbr}-${toRef}`;
      if (seenInSection.has(key)) continue;
      seenInSection.add(key);
      count++;

      const start = Math.max(0, (m.index ?? 0) - CONTEXT_RADIUS);
      const end = Math.min(section.body.length, (m.index ?? 0) + m[0].length + CONTEXT_RADIUS);
      const context = section.body.slice(start, end).replace(/\s+/g, " ").trim();

      edges.push({ fromRef: section.ref, toRef, toAbbr, context });
    }
  }
  return edges;
}
