/**
 * Does a search query cite a source the way a lawyer writes it — a §, an
 * article, a statute abbreviation, a case number, an ECLI?
 *
 * Only then can the keyword arm add something the vector arm misses. For a
 * question in plain words it mostly returns texts that happen to share a
 * word, and fused into the ranking it pushes the right hits down: on the
 * Austrian-law bake-off (330 questions) today's fusion halved nDCG@10 for
 * every embedding model (src/eval/embedding-bakeoff).
 */
export function isCitationQuery(q: string): boolean {
  return (
    /§\s*\d/.test(q) ||
    /\bArt\.?\s*\d/.test(q) ||
    /\b(?:ABGB|UGB|ZPO|StGB|StPO|B-VG|ASVG|EO|IO|JN|AVG|BAO|VStG|EStG|UStG|KSchG|MRG|WEG|AngG|ArbVG|GmbHG|AktG|DSG|EheG|AußStrG|GewO)\b/.test(
      q
    ) ||
    /\b[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]*[a-zäöüß]G\b/.test(q) ||
    /\b\d+\s?Ob\s?\d+\/\d+/.test(q) ||
    /\bR[ao]\s?\d{4}\/\d+/.test(q) ||
    /\bRS\d{7}\b/.test(q) ||
    /\bECLI:/.test(q)
  );
}

/**
 * The court-decision identifiers in a query, as RIS writes them: the ECLI
 * and the RIS document number.
 *
 * A lawyer pastes "ECLI:AT:OGH0002:2019:RS0132425" and expects that one
 * decision. German full-text search splits the string into pieces and
 * matched nothing for 13 of 18 sampled ECLIs, although every page was in
 * the corpus — so the identifier is looked up exactly instead of searched.
 * Rechtssatz numbers (RS0132425) are found by the keyword arm (12 of 12 in
 * the same sample) and need no special path.
 */
export function decisionIdentifiers(q: string): string[] {
  const out = new Set<string>();
  for (const m of q.matchAll(/ECLI:[A-Z]{2}:[A-Z0-9]+:\d{4}:[A-Z0-9._-]+/gi)) {
    out.add(m[0].toUpperCase());
  }
  for (const m of q.matchAll(/\bJ[A-Z]{2}_[A-Z0-9_]+\b/g)) out.add(m[0]);
  return [...out];
}
