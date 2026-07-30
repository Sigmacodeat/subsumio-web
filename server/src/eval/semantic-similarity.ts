/**
 * Semantic Similarity Metrics for Legal Answer Evaluation
 *
 * Implements lightweight, dependency-free metrics for comparing
 * generated answers against gold/reference answers:
 *
 * - ROUGE-1 (unigram overlap): precision, recall, F1
 * - ROUGE-2 (bigram overlap): precision, recall, F1
 * - ROUGE-L (longest common subsequence): F1
 * - Jaccard similarity (token set overlap)
 * - Citation overlap (§ references matched)
 *
 * No external dependencies — pure TypeScript, runs in Bun/Node.
 *
 * For BERTScore or embedding-based similarity, use the existing
 * embedding infrastructure (text-embedding-3-small) via the
 * `computeEmbeddingSimilarity()` function below.
 */

// ── Tokenization ─────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s§]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function ngrams(tokens: string[], n: number): string[] {
  const grams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.push(tokens.slice(i, i + n).join(" "));
  }
  return grams;
}

// ── ROUGE-N ──────────────────────────────────────────────────────────

export interface RougeResult {
  precision: number;
  recall: number;
  f1: number;
}

export function rougeN(reference: string, candidate: string, n: number = 1): RougeResult {
  const refTokens = tokenize(reference);
  const candTokens = tokenize(candidate);

  const refGrams = ngrams(refTokens, n);
  const candGrams = ngrams(candTokens, n);

  if (refGrams.length === 0 || candGrams.length === 0) {
    return { precision: 0, recall: 0, f1: 0 };
  }

  // Count overlapping n-grams (with multiplicity)
  const refCounts = new Map<string, number>();
  for (const g of refGrams) {
    refCounts.set(g, (refCounts.get(g) ?? 0) + 1);
  }

  const candCounts = new Map<string, number>();
  for (const g of candGrams) {
    candCounts.set(g, (candCounts.get(g) ?? 0) + 1);
  }

  let overlap = 0;
  for (const [g, count] of candCounts) {
    const refCount = refCounts.get(g) ?? 0;
    overlap += Math.min(count, refCount);
  }

  const precision = overlap / candGrams.length;
  const recall = overlap / refGrams.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1 };
}

// ── ROUGE-L (LCS) ────────────────────────────────────────────────────

function longestCommonSubsequence(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;

  // Use rolling array for O(min(m,n)) space
  const dp: number[] = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
      } else {
        dp[j] = Math.max(dp[j], dp[j - 1]);
      }
      prev = temp;
    }
  }
  return dp[n];
}

export function rougeL(reference: string, candidate: string): RougeResult {
  const refTokens = tokenize(reference);
  const candTokens = tokenize(candidate);

  if (refTokens.length === 0 || candTokens.length === 0) {
    return { precision: 0, recall: 0, f1: 0 };
  }

  const lcsLen = longestCommonSubsequence(refTokens, candTokens);
  const precision = lcsLen / candTokens.length;
  const recall = lcsLen / refTokens.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return { precision, recall, f1 };
}

// ── Jaccard Similarity ───────────────────────────────────────────────

export function jaccardSimilarity(reference: string, candidate: string): number {
  const refTokens = new Set(tokenize(reference));
  const candTokens = new Set(tokenize(candidate));

  if (refTokens.size === 0 && candTokens.size === 0) return 1.0;
  if (refTokens.size === 0 || candTokens.size === 0) return 0;

  let intersection = 0;
  for (const t of candTokens) {
    if (refTokens.has(t)) intersection++;
  }
  const union = refTokens.size + candTokens.size - intersection;
  return intersection / union;
}

// ── Citation Overlap ─────────────────────────────────────────────────

export interface CitationOverlapResult {
  expected_citations: number;
  found_citations: number;
  precision: number;
  recall: number;
  f1: number;
  missing: string[];
  extra: string[];
}

export function citationOverlap(reference: string, candidate: string): CitationOverlapResult {
  const citationPattern =
    /§\s*(\d+[a-z]?)\s*(BGB|ABGB|StGB|ZPO|StPO|UWG|HGB|InsO|AO|EStG|UStG|GewStG|KStG|ErbStG|BewG|GrEStG|GG|BauGB|BDSG|BetrVG|FamFG|GewO|GmbHG|UrhG|VwGO|ZVG|EheG|UGB|EVG|ArbVG|ASVG|AVG|KartG|DSG|BVG|OR|ZGB|DSGVO)/gi;

  const extractCitations = (text: string): Set<string> => {
    const citations = new Set<string>();
    let match: RegExpExecArray | null;
    const pattern = new RegExp(citationPattern.source, "gi");
    while ((match = pattern.exec(text)) !== null) {
      citations.add(`${match[2].toUpperCase()}§${match[1]}`);
    }
    return citations;
  };

  const refCitations = extractCitations(reference);
  const candCitations = extractCitations(candidate);

  const expected = refCitations.size;
  const found = [...candCitations].filter((c) => refCitations.has(c)).length;
  const missing = [...refCitations].filter((c) => !candCitations.has(c));
  const extra = [...candCitations].filter((c) => !refCitations.has(c));

  const precision = candCitations.size > 0 ? found / candCitations.size : 0;
  const recall = expected > 0 ? found / expected : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    expected_citations: expected,
    found_citations: found,
    precision,
    recall,
    f1,
    missing,
    extra,
  };
}

// ── Embedding-based Similarity (optional, requires embedding infrastructure) ──

export interface EmbeddingSimilarityOpts {
  /** Embedding function (returns float array) */
  embedFn: (text: string) => Promise<number[]>;
}

export async function computeEmbeddingSimilarity(
  reference: string,
  candidate: string,
  opts: EmbeddingSimilarityOpts
): Promise<number> {
  const [refEmb, candEmb] = await Promise.all([opts.embedFn(reference), opts.embedFn(candidate)]);

  if (refEmb.length === 0 || candEmb.length === 0) return 0;
  if (refEmb.length !== candEmb.length) {
    throw new Error(`Embedding dimension mismatch: ${refEmb.length} vs ${candEmb.length}`);
  }

  // Cosine similarity
  let dotProduct = 0;
  let refNorm = 0;
  let candNorm = 0;
  for (let i = 0; i < refEmb.length; i++) {
    dotProduct += refEmb[i] * candEmb[i];
    refNorm += refEmb[i] * refEmb[i];
    candNorm += candEmb[i] * candEmb[i];
  }

  const denominator = Math.sqrt(refNorm) * Math.sqrt(candNorm);
  return denominator > 0 ? dotProduct / denominator : 0;
}

// ── Composite Score ──────────────────────────────────────────────────

export interface SemanticScore {
  rouge_1: RougeResult;
  rouge_2: RougeResult;
  rouge_l: RougeResult;
  jaccard: number;
  citation_overlap: CitationOverlapResult;
  /** Weighted composite (0-1) */
  composite: number;
}

export function computeSemanticScore(reference: string, candidate: string): SemanticScore {
  const r1 = rougeN(reference, candidate, 1);
  const r2 = rougeN(reference, candidate, 2);
  const rL = rougeL(reference, candidate);
  const jacc = jaccardSimilarity(reference, candidate);
  const cites = citationOverlap(reference, candidate);

  // Weighted composite: ROUGE-1 F1 (30%), ROUGE-L F1 (20%), Jaccard (20%), Citation F1 (30%)
  const composite = r1.f1 * 0.3 + rL.f1 * 0.2 + jacc * 0.2 + cites.f1 * 0.3;

  return {
    rouge_1: r1,
    rouge_2: r2,
    rouge_l: rL,
    jaccard: jacc,
    citation_overlap: cites,
    composite,
  };
}

// ── Batch Evaluation ─────────────────────────────────────────────────

export interface BatchSemanticResult {
  question_id: string;
  score: SemanticScore;
}

export function computeSemanticBatch(
  items: Array<{ question_id: string; reference: string; candidate: string }>
): BatchSemanticResult[] {
  return items.map((item) => ({
    question_id: item.question_id,
    score: computeSemanticScore(item.reference, item.candidate),
  }));
}

// ── Summary Report ───────────────────────────────────────────────────

export function formatSemanticReport(results: BatchSemanticResult[]): string {
  const n = results.length;
  if (n === 0) return "No results to report.";

  const avgR1F1 = results.reduce((s, r) => s + r.score.rouge_1.f1, 0) / n;
  const avgR2F1 = results.reduce((s, r) => s + r.score.rouge_2.f1, 0) / n;
  const avgRLF1 = results.reduce((s, r) => s + r.score.rouge_l.f1, 0) / n;
  const avgJaccard = results.reduce((s, r) => s + r.score.jaccard, 0) / n;
  const avgCitationF1 = results.reduce((s, r) => s + r.score.citation_overlap.f1, 0) / n;
  const avgComposite = results.reduce((s, r) => s + r.score.composite, 0) / n;

  const lines: string[] = [];
  lines.push("=== Semantic Similarity Report ===");
  lines.push("");
  lines.push(`Total answers evaluated: ${n}`);
  lines.push("");
  lines.push(`ROUGE-1 F1:   ${avgR1F1.toFixed(3)}`);
  lines.push(`ROUGE-2 F1:   ${avgR2F1.toFixed(3)}`);
  lines.push(`ROUGE-L F1:   ${avgRLF1.toFixed(3)}`);
  lines.push(`Jaccard:      ${avgJaccard.toFixed(3)}`);
  lines.push(`Citation F1:  ${avgCitationF1.toFixed(3)}`);
  lines.push(`Composite:    ${avgComposite.toFixed(3)}`);
  lines.push("");

  // Missing citations summary
  const allMissing = results.flatMap((r) =>
    r.score.citation_overlap.missing.map((m) => ({ qid: r.question_id, citation: m }))
  );
  if (allMissing.length > 0) {
    lines.push("--- Missing Citations (sample) ---");
    for (const m of allMissing.slice(0, 10)) {
      lines.push(`  [${m.qid}] ${m.citation}`);
    }
    if (allMissing.length > 10) {
      lines.push(`  ... and ${allMissing.length - 10} more`);
    }
  }

  return lines.join("\n");
}
