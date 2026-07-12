import type { SearchResult } from "../../core/types.ts";

/**
 * Weighted reciprocal-rank fusion. The original legal question remains the
 * primary signal; expansion may promote corroborated results but cannot simply
 * replace a strong literal/semantic match from the original query.
 */
export function fuseLegalSearchResults(
  original: SearchResult[],
  expanded: SearchResult[],
  limit: number,
  originalWeight = 2
): SearchResult[] {
  const fused = new Map<string, { item: SearchResult; score: number }>();
  const add = (items: SearchResult[], weight: number) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const score = weight / (60 + i + 1);
      const prior = fused.get(item.slug);
      if (prior) prior.score += score;
      else fused.set(item.slug, { item, score });
    }
  };

  add(original, originalWeight);
  add(expanded, 1);
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || a.item.slug.localeCompare(b.item.slug))
    .slice(0, limit)
    .map(({ item, score }) => ({ ...item, score }));
}
