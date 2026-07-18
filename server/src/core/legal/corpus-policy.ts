/**
 * Sources excluded from production ingestion, with WHY:
 *  - "policy"   — deliberately excluded (duplicate import path, reference
 *                 index, …); the file itself may be perfectly healthy.
 *  - "degraded" — the file is a stub/broken fetch; fixing it (real official
 *                 text) means deleting its entry (the set may only shrink).
 * The corpus-integrity tripwire only demands removal of recovered "degraded"
 * entries; "policy" entries stay regardless of file health.
 */
export const QUARANTINED_LEGAL_SOURCE_REASONS: Record<string, "policy" | "degraded"> = {
  "de/ao-index.md": "policy", // reference index, not a real law (AO fulltext is in de/ao.md)
  "at/uwg.md": "policy", // already imported as monolith (slug: uwg), not in FILES list
  // NOTE: the CH files zpo/bgfa/bvg/dsg/schkg/uwg/vwvg (+ dbg/mwstg/zg/sthg)
  // pass the structural stub heuristic (frontmatter + real body) but carry
  // only a Kurztext (~2-7KB) instead of the full statute — the fulltext
  // Fedlex fetch is tracked as an open corpus task, NOT via this quarantine.
};

export const QUARANTINED_LEGAL_SOURCES = new Set<string>(
  Object.keys(QUARANTINED_LEGAL_SOURCE_REASONS)
);

export function isQuarantinedLegalSource(path: string): boolean {
  return QUARANTINED_LEGAL_SOURCES.has(path);
}
