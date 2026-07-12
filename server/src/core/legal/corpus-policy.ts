/** Sources known to be non-canonical or stub-sized and excluded from production ingestion. */
export const QUARANTINED_LEGAL_SOURCES = new Set<string>([
  "at/brag.md",
  "de/stberg.md",
  "de/bewg.md",
  "de/lstdv.md",
  "de/stbvv.md",
  "de/ao-index.md",
  "de/gewstg.md",
  "de/grestg.md",
  "de/erbstg.md",
  "ch/schkg.md",
  "ch/bgfa.md",
  "ch/zpo.md",
  "ch/uwg.md",
  "ch/bvg.md",
  "ch/dsg.md",
  "ch/vwvg.md",
  "at/n-g.md",
  "at/tilgg.md",
  "at/ahg.md",
  "at/vvg.md",
  "eu/romi.md",
  "eu/brusselsibis.md",
  "eu/romii.md",
]);

export function isQuarantinedLegalSource(path: string): boolean {
  return QUARANTINED_LEGAL_SOURCES.has(path);
}
