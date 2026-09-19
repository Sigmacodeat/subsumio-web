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
