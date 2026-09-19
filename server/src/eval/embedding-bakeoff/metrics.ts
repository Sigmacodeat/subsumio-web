/**
 * Embedding bake-off: ranking and scoring, pure functions.
 *
 * Relevance is judged per PAGE (a § or a decision), not per chunk: a lawyer
 * needs the right norm, and which Absatz-chunk surfaced it does not matter.
 */

export interface RankingMetrics {
  recall1: number;
  recall5: number;
  recall10: number;
  mrr10: number;
  ndcg10: number;
}

/** Collapse a chunk ranking into a page ranking, keeping first appearance. */
export function pagesFromChunks(
  rankedChunkIds: readonly number[],
  pageOfChunk: ReadonlyMap<number, number>
): number[] {
  const seen = new Set<number>();
  const pages: number[] = [];
  for (const id of rankedChunkIds) {
    const page = pageOfChunk.get(id);
    if (page === undefined || seen.has(page)) continue;
    seen.add(page);
    pages.push(page);
  }
  return pages;
}

/**
 * The production hybrid ranking (search/hybrid.ts): chunk-level RRF with
 * 1/(k + rank), scores normalized to the best one, then blended
 * 0.7 · RRF + 0.3 · cosine (cosineReScore). Returns chunk ids, best first.
 */
export function productionHybrid(
  denseChunkIds: readonly number[],
  keywordChunkIds: readonly number[],
  cosineOf: (chunkId: number) => number,
  k = 60
): number[] {
  const rrf = new Map<number, number>();
  for (const list of [denseChunkIds, keywordChunkIds]) {
    list.forEach((id, rank) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (k + rank)));
  }
  const max = Math.max(0, ...rrf.values());
  return [...rrf.entries()]
    .map(([id, score]) => [id, 0.7 * (max > 0 ? score / max : 0) + 0.3 * cosineOf(id)] as const)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id]) => id);
}

/**
 * Does the question cite a source the way a lawyer writes it? Only then can
 * the keyword arm add something the vector arm misses (an exact § or case
 * number); for a question in plain words it mostly adds noise.
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

/** Recall@k, MRR@10 and nDCG@10 with binary relevance. */
export function scoreRanking(
  rankedPages: readonly number[],
  gold: ReadonlySet<number>
): RankingMetrics {
  const hitAt = (k: number) => {
    let hits = 0;
    for (const p of rankedPages.slice(0, k)) if (gold.has(p)) hits++;
    return gold.size === 0 ? 0 : hits / Math.min(gold.size, k);
  };
  let mrr = 0;
  for (let i = 0; i < Math.min(10, rankedPages.length); i++) {
    if (gold.has(rankedPages[i]!)) {
      mrr = 1 / (i + 1);
      break;
    }
  }
  let dcg = 0;
  for (let i = 0; i < Math.min(10, rankedPages.length); i++) {
    if (gold.has(rankedPages[i]!)) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(10, gold.size); i++) idcg += 1 / Math.log2(i + 2);
  return {
    recall1: hitAt(1),
    recall5: hitAt(5),
    recall10: hitAt(10),
    mrr10: mrr,
    ndcg10: idcg === 0 ? 0 : dcg / idcg,
  };
}

export function meanMetrics(rows: readonly RankingMetrics[]): RankingMetrics {
  const n = Math.max(rows.length, 1);
  const sum = (f: (r: RankingMetrics) => number) => rows.reduce((s, r) => s + f(r), 0) / n;
  return {
    recall1: sum((r) => r.recall1),
    recall5: sum((r) => r.recall5),
    recall10: sum((r) => r.recall10),
    mrr10: sum((r) => r.mrr10),
    ndcg10: sum((r) => r.ndcg10),
  };
}

/**
 * Paired bootstrap on per-query differences. Returns the mean difference
 * (a − b) and its 95 % interval; an interval that excludes 0 means the gap
 * is not luck of the question sample. Seeded, so reports are reproducible.
 */
export function pairedBootstrap(
  a: readonly number[],
  b: readonly number[],
  resamples = 2000,
  seed = 42
): { diff: number; lo: number; hi: number } {
  if (a.length !== b.length) throw new Error("pairedBootstrap: unequal lengths");
  const n = a.length;
  if (n === 0) return { diff: 0, lo: 0, hi: 0 };
  const d = a.map((x, i) => x - b[i]!);
  const mean = d.reduce((s, x) => s + x, 0) / n;
  let state = seed >>> 0;
  const rand = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[Math.floor(rand() * n)]!;
    means.push(s / n);
  }
  means.sort((x, y) => x - y);
  return {
    diff: mean,
    lo: means[Math.floor(0.025 * resamples)]!,
    hi: means[Math.floor(0.975 * resamples) - 1]!,
  };
}

/** L2-normalize in place after cutting to `dims` (Matryoshka truncation). */
export function truncateAndNormalize(v: ArrayLike<number>, dims: number): Float32Array {
  const n = Math.min(dims, v.length);
  const out = new Float32Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    out[i] = v[i]!;
    norm += out[i]! * out[i]!;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < n; i++) out[i]! /= norm;
  return out;
}

/**
 * Exact nearest neighbours by dot product over normalized vectors stored in
 * one flat array (row i = docs[i*dims .. i*dims+dims]). Brute force on
 * purpose: an approximate index would add its own recall loss and blur the
 * model comparison.
 */
export function topKDot(
  query: Float32Array,
  docs: Float32Array,
  dims: number,
  k: number
): number[] {
  const count = docs.length / dims;
  const bestIdx = new Int32Array(k).fill(-1);
  const bestScore = new Float32Array(k).fill(-Infinity);
  for (let row = 0; row < count; row++) {
    let s = 0;
    const off = row * dims;
    for (let j = 0; j < dims; j++) s += query[j]! * docs[off + j]!;
    if (s <= bestScore[k - 1]!) continue;
    let pos = k - 1;
    while (pos > 0 && bestScore[pos - 1]! < s) {
      bestScore[pos] = bestScore[pos - 1]!;
      bestIdx[pos] = bestIdx[pos - 1]!;
      pos--;
    }
    bestScore[pos] = s;
    bestIdx[pos] = row;
  }
  return [...bestIdx].filter((i) => i >= 0);
}
