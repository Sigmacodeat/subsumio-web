/**
 * T2.5 Retrieval-Evaluation — Retrieval-only metrics for legal RAG.
 *
 * Evaluates retrieval quality SEPARATELY from generation.
 * No LLM generation is involved — pure deterministic metrics on retrieved passages.
 *
 * Metrics:
 *   1. Recall@k    — fraction of expected passages found in top-k (passage-level, NOT law-level)
 *   2. Precision@k — fraction of top-k results that are passage-level relevant
 *   3. MRR         — Mean Reciprocal Rank of first passage-level relevant result
 *   4. nDCG@k      — Normalized Discounted Cumulative Gain with graded relevance (0-3)
 *   5. Source-type coverage — fraction of expected source types present in top-k
 *   6. Passage support rate — fraction of expected passages whose supporting text is found in retrieved chunks
 *   7. Negative-authority recall — fraction of queries where NO wrong-authority result appears in top-k
 *
 * Acceptance criteria:
 *   - Retrieval and generation are evaluated separately (this module is retrieval-only)
 *   - Top-20-Law-Hit alone does NOT count as retrieval success — passage-level matching required
 */

import type { EvalCategory } from "./rag-eval";

// ── Source Types ───────────────────────────────────────────────────────

export type SourceType =
  | "statute" // Gesetzliche Norm (BGB, ABGB, ZPO, etc.)
  | "case_law" // Judikatur (BGH, OGH, BGer)
  | "procedure" // Verfahrensrecht / Fristen
  | "contract_clause" // Vertragsklausel
  | "memo" // Schriftsatz / Memo
  | "bulk_review" // Due Diligence / Bulk Review
  | "general"; // Allgemein / verfahrensübergreifend

export const ALL_SOURCE_TYPES: SourceType[] = [
  "statute",
  "case_law",
  "procedure",
  "contract_clause",
  "memo",
  "bulk_review",
  "general",
];

// ── Retrieved Passage ──────────────────────────────────────────────────

/**
 * A single retrieved passage from the search engine.
 * Contains passage-level metadata, not just a slug.
 */
export interface RetrievedPassage {
  /** Full slug, e.g. "legal/norms/de/bgb/433" */
  slug: string;
  /** Section identifier, e.g. "§ 433" or "Art 127" */
  section?: string;
  /** Chunk text content */
  text: string;
  /** Source type classification */
  source_type: SourceType;
  /** Retrieval score (optional, for debugging) */
  score?: number;
  /** Law abbreviation extracted from slug, e.g. "BGB" */
  law?: string;
  /** Jurisdiction extracted from slug, e.g. "DE" */
  jurisdiction?: string;
}

// ── Expected Passage (Fixture) ─────────────────────────────────────────

/**
 * An expected passage in a retrieval fixture.
 * Defines passage-level relevance — NOT just law-level.
 */
export interface ExpectedPassage {
  /** Expected slug, e.g. "legal/norms/de/bgb/433" */
  slug: string;
  /** Expected section, e.g. "§ 433" */
  section?: string;
  /**
   * Text snippet that should appear in the retrieved passage.
   * Used for passage support rate calculation.
   * Case-insensitive substring match.
   */
  supporting_text?: string;
  /**
   * Graded relevance level:
   *   3 = exact passage match (slug + section)
   *   2 = same § but different chunk (slug match, section match, but text may differ)
   *   1 = same law, different § (slug prefix match only)
   * If not specified, inferred from slug/section presence.
   */
  relevance?: 1 | 2 | 3;
}

// ── Negative Authority ─────────────────────────────────────────────────

/**
 * A law or slug pattern that should NOT appear in top-k results.
 * Used for negative-authority recall metric.
 *
 * Example: For a DE query about BGB, ABGB (Austrian law) should not appear.
 */
export interface NegativeAuthority {
  /**
   * Slug prefix or exact slug to match against retrieved passages.
   * If ends with "*", treated as prefix match.
   * Examples: "legal/norms/at/abgb/*", "legal/norms/ch/or/*"
   */
  pattern: string;
  /** Human-readable reason why this is a negative authority */
  reason: string;
}

// ── Retrieval Eval Fixture ─────────────────────────────────────────────

export interface RetrievalEvalFixture {
  /** Unique fixture ID */
  id: string;
  /** Query string */
  query: string;
  /** Jurisdiction */
  jurisdiction: "DE" | "AT" | "CH";
  /** Category */
  category: EvalCategory;
  /**
   * Expected passages — passage-level relevance.
   * At least one expected passage is required.
   * Top-20-Law-Hit alone (without passage match) does NOT count as success.
   */
  expected_passages: ExpectedPassage[];
  /**
   * Source types that should be covered in top-k results.
   * E.g. a statute query should have "statute" in results.
   */
  expected_source_types: SourceType[];
  /**
   * Authorities that should NOT appear in top-k.
   * E.g. ABGB should not appear for DE queries.
   */
  negative_authorities?: NegativeAuthority[];
}

// ── Per-Query Result ───────────────────────────────────────────────────

export interface RetrievalEvalResult {
  queryId: string;
  query: string;
  jurisdiction: string;
  category: string;

  // Retrieved passages (top-k)
  retrievedCount: number;
  retrievedSlugs: string[];
  retrievedSourceTypes: string[];

  // Metrics
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  ndcgAtK: number;
  sourceTypeCoverage: number;
  passageSupportRate: number;
  negativeAuthorityRecall: number;

  // Details for debugging
  passageMatches: PassageMatch[];
  negativeAuthorityHits: NegativeAuthorityHit[];
  missingSourceTypes: string[];
  unsupportedPassages: ExpectedPassage[];

  // Overall pass (all critical metrics pass)
  pass: boolean;
  error?: string;
}

export interface PassageMatch {
  expected: ExpectedPassage;
  retrievedSlug?: string;
  retrievedRank?: number;
  matchLevel: "exact" | "section" | "law" | "none";
  supportingTextFound: boolean;
}

export interface NegativeAuthorityHit {
  pattern: string;
  reason: string;
  matchedSlug: string;
  rank: number;
}

// ── Summary ────────────────────────────────────────────────────────────

export interface RetrievalEvalSummary {
  // Configuration
  totalQueries: number;
  k: number;
  fixtureVersion: string;
  timestamp: string;

  // Aggregate metrics (averaged across all queries)
  overallRecall: number;
  overallPrecision: number;
  overallMrr: number;
  overallNdcg: number;
  overallSourceTypeCoverage: number;
  overallPassageSupportRate: number;
  overallNegativeAuthorityRecall: number;

  // Pass rate (queries where all metrics pass thresholds)
  passRate: number;
  passedQueries: number;

  // Breakdown by jurisdiction
  byJurisdiction: Record<
    string,
    {
      count: number;
      recall: number;
      precision: number;
      mrr: number;
      ndcg: number;
      sourceTypeCoverage: number;
      passageSupportRate: number;
      negativeAuthorityRecall: number;
    }
  >;

  // Breakdown by category
  byCategory: Record<
    string,
    {
      count: number;
      recall: number;
      precision: number;
      mrr: number;
      ndcg: number;
      sourceTypeCoverage: number;
      passageSupportRate: number;
      negativeAuthorityRecall: number;
    }
  >;

  // Per-query results
  results: RetrievalEvalResult[];
}

// ── Options ────────────────────────────────────────────────────────────

export interface RetrievalEvalOptions {
  /** K for all @k metrics (default: 20) */
  k?: number;
  /**
   * Minimum recall@k to pass a query (default: 0.5)
   * At least half of expected passages must be found.
   */
  minRecall?: number;
  /**
   * Minimum passage support rate to pass (default: 0.5)
   * At least half of expected passages with supporting_text must be found.
   */
  minPassageSupport?: number;
  /**
   * Minimum negative-authority recall to pass (default: 1.0)
   * NO wrong-authority results may appear in top-k.
   */
  minNegativeAuthorityRecall?: number;
  /** If true, retriever errors are logged but not thrown */
  tolerateErrors?: boolean;
}

// ── Defaults ───────────────────────────────────────────────────────────

export const DEFAULT_K = 20;
export const DEFAULT_MIN_RECALL = 0.5;
export const DEFAULT_MIN_PASSAGE_SUPPORT = 0.5;
export const DEFAULT_MIN_NEG_AUTHORITY_RECALL = 1.0;
export const RETRIEVAL_FIXTURE_VERSION = "1.0.0";

// ── Retriever Interface ────────────────────────────────────────────────

/**
 * Retriever function — returns retrieved passages for a query.
 * This is the interface the eval harness calls.
 *
 * IMPORTANT: This is retrieval-only. No generation, no LLM synthesis.
 * The retriever should return raw search results with passage metadata.
 */
export type RetrieverFn = (query: string) => Promise<RetrievedPassage[]>;

/**
 * Helper to adapt a slug-only retriever to a passage retriever.
 * Useful for testing with existing slug-based fixtures.
 */
export function adaptSlugRetriever(
  slugRetriever: (query: string) => Promise<string[]>,
  passageLookup: (slug: string) => Omit<RetrievedPassage, "slug"> | undefined
): RetrieverFn {
  return async (query: string) => {
    const slugs = await slugRetriever(query);
    return slugs
      .map((slug) => {
        const meta = passageLookup(slug);
        if (!meta) return undefined;
        return { slug, ...meta };
      })
      .filter((p): p is RetrievedPassage => p !== undefined);
  };
}

// ── Graded Relevance ───────────────────────────────────────────────────

/**
 * Compute graded relevance for a retrieved passage against expected passages.
 *
 * Grading:
 *   3 = exact match (slug + section match)
 *   2 = same slug, section not specified or different chunk
 *   1 = same law (slug prefix match), different §
 *   0 = no match
 */
export function computeGradedRelevance(
  retrieved: RetrievedPassage,
  expected: ExpectedPassage[]
): number {
  let maxRel = 0;

  for (const exp of expected) {
    // Exact slug match
    if (retrieved.slug === exp.slug) {
      if (exp.section && retrieved.section) {
        // Both have sections — check match
        if (normalizeSection(retrieved.section) === normalizeSection(exp.section)) {
          maxRel = Math.max(maxRel, 3);
        } else {
          maxRel = Math.max(maxRel, 2);
        }
      } else if (exp.section || retrieved.section) {
        // One has section, other doesn't — partial match
        maxRel = Math.max(maxRel, 2);
      } else {
        // Neither has section — slug match is best we can do
        maxRel = Math.max(maxRel, 2);
      }
      continue;
    }

    // Same law prefix match (e.g. "legal/norms/de/bgb/433" vs "legal/norms/de/bgb/195")
    const retrievedLaw = extractLawFromSlug(retrieved.slug);
    const expectedLaw = extractLawFromSlug(exp.slug);
    if (
      retrievedLaw &&
      expectedLaw &&
      retrievedLaw.toLowerCase() === expectedLaw.toLowerCase() &&
      retrieved.slug.split("/").slice(0, -1).join("/") ===
        exp.slug.split("/").slice(0, -1).join("/")
    ) {
      maxRel = Math.max(maxRel, 1);
    }
  }

  return maxRel;
}

/**
 * Check if a retrieved passage matches an expected passage at passage level.
 * "Passage level" means slug match (not just law-level prefix match).
 */
export function isPassageMatch(retrieved: RetrievedPassage, expected: ExpectedPassage): boolean {
  if (retrieved.slug !== expected.slug) return false;
  if (expected.section && retrieved.section) {
    return normalizeSection(retrieved.section) === normalizeSection(expected.section);
  }
  return true;
}

/**
 * Check if supporting text is found in retrieved passage text.
 * Case-insensitive substring match.
 */
export function isSupportingTextFound(
  retrieved: RetrievedPassage,
  expected: ExpectedPassage
): boolean {
  if (!expected.supporting_text) return false;
  const textLower = retrieved.text.toLowerCase();
  const expectedLower = expected.supporting_text.toLowerCase();
  return textLower.includes(expectedLower);
}

// ── Negative Authority Matching ────────────────────────────────────────

/**
 * Check if a retrieved slug matches a negative authority pattern.
 * Patterns ending with "*" are prefix matches.
 */
export function matchesNegativeAuthority(slug: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return slug.startsWith(prefix);
  }
  return slug === pattern;
}

// ── Section Normalization ──────────────────────────────────────────────

function normalizeSection(section: string): string {
  return section
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/§/g, "")
    .replace(/art\.?/g, "art")
    .replace(/abs\.?/g, "abs")
    .replace(/satz/g, "s")
    .trim();
}

/**
 * Extract law abbreviation from a slug.
 * E.g. "legal/norms/de/bgb/433" → "BGB"
 */
function extractLawFromSlug(slug: string): string | undefined {
  const parts = slug.split("/");
  // Expected format: legal/norms/{jurisdiction}/{law}/{paragraph}
  if (parts.length >= 4 && parts[0] === "legal" && parts[1] === "norms") {
    return parts[3]?.toUpperCase();
  }
  // Also handle: legal/deadlines/{key}
  if (parts.length >= 3 && parts[0] === "legal" && parts[1] === "deadlines") {
    return parts[2]?.toUpperCase();
  }
  return undefined;
}

// ── nDCG Calculation ───────────────────────────────────────────────────

/**
 * Compute nDCG@k with graded relevance.
 *
 * DCG@k = sum(rel_i / log2(i + 2)) for i in 0..k-1
 * IDCG@k = DCG of ideal ranking (sorted by relevance descending)
 * nDCG@k = DCG@k / IDCG@k
 */
export function computeNdcg(
  retrieved: RetrievedPassage[],
  expected: ExpectedPassage[],
  k: number
): number {
  const topK = retrieved.slice(0, k);

  // Compute graded relevance for each retrieved passage
  const relevances = topK.map((r) => computeGradedRelevance(r, expected));

  // DCG
  let dcg = 0;
  for (let i = 0; i < relevances.length; i++) {
    dcg += relevances[i]! / Math.log2(i + 2);
  }

  // IDCG: ideal ranking = all expected passages sorted by relevance descending
  const idealRelevances = expected
    .map((e) => e.relevance ?? 3)
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  for (let i = 0; i < idealRelevances.length; i++) {
    idcg += idealRelevances[i]! / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

// ── Main Evaluation Function ───────────────────────────────────────────

/**
 * Run retrieval evaluation on a set of fixtures.
 *
 * This is RETRIEVAL-ONLY. No generation, no LLM synthesis.
 * The retriever returns raw search results with passage metadata.
 *
 * @param retriever - Function that returns retrieved passages for a query
 * @param fixtures - Evaluation fixtures with passage-level expectations
 * @param opts - Evaluation options (k, thresholds, etc.)
 * @returns RetrievalEvalSummary with all 7 metrics
 */
export async function runRetrievalEval(
  retriever: RetrieverFn,
  fixtures: RetrievalEvalFixture[],
  opts: RetrievalEvalOptions = {}
): Promise<RetrievalEvalSummary> {
  const K = opts.k ?? DEFAULT_K;
  const minRecall = opts.minRecall ?? DEFAULT_MIN_RECALL;
  const minPassageSupport = opts.minPassageSupport ?? DEFAULT_MIN_PASSAGE_SUPPORT;
  const minNegAuthority = opts.minNegativeAuthorityRecall ?? DEFAULT_MIN_NEG_AUTHORITY_RECALL;

  const results: RetrievalEvalResult[] = [];

  for (const fixture of fixtures) {
    let retrieved: RetrievedPassage[] = [];
    try {
      retrieved = await retriever(fixture.query);
    } catch (err) {
      if (!opts.tolerateErrors) throw err;
      console.warn(
        `[retrieval-eval] retriever error for "${fixture.id}":`,
        err instanceof Error ? err.message : String(err)
      );
    }

    const result = evaluateQuery(fixture, retrieved, K, {
      minRecall,
      minPassageSupport,
      minNegAuthority,
    });
    results.push(result);
  }

  return summarizeResults(results, K, fixtures);
}

// ── Per-Query Evaluation ───────────────────────────────────────────────

function evaluateQuery(
  fixture: RetrievalEvalFixture,
  retrieved: RetrievedPassage[],
  K: number,
  thresholds: {
    minRecall: number;
    minPassageSupport: number;
    minNegAuthority: number;
  }
): RetrievalEvalResult {
  const topK = retrieved.slice(0, K);
  const expected = fixture.expected_passages;

  // ── 1. Recall@k (passage-level) ──────────────────────────────────────
  // Fraction of expected passages found in top-k
  // Passage match = slug match (NOT just law-level prefix match)
  const passageMatches: PassageMatch[] = [];
  let matchedCount = 0;

  for (const exp of expected) {
    const matchIdx = topK.findIndex((r) => isPassageMatch(r, exp));
    const matched = matchIdx >= 0;
    if (matched) matchedCount++;

    const retrievedPassage = matched ? topK[matchIdx] : undefined;
    const supportingTextFound = retrievedPassage
      ? isSupportingTextFound(retrievedPassage, exp)
      : false;

    let matchLevel: PassageMatch["matchLevel"] = "none";
    if (matched) {
      if (exp.section && retrievedPassage?.section) {
        if (normalizeSection(retrievedPassage.section) === normalizeSection(exp.section)) {
          matchLevel = "exact";
        } else {
          matchLevel = "section";
        }
      } else {
        matchLevel = "section";
      }
    }

    passageMatches.push({
      expected: exp,
      retrievedSlug: retrievedPassage?.slug,
      retrievedRank: matched ? matchIdx + 1 : undefined,
      matchLevel,
      supportingTextFound,
    });
  }

  const recallAtK = expected.length > 0 ? matchedCount / expected.length : 0;

  // ── 2. Precision@k (passage-level) ───────────────────────────────────
  // Fraction of top-k results that match ANY expected passage
  const relevantInK = topK.filter((r) => expected.some((e) => isPassageMatch(r, e))).length;
  const precisionAtK = topK.length > 0 ? relevantInK / topK.length : 0;

  // ── 3. MRR (passage-level) ───────────────────────────────────────────
  // Reciprocal rank of first passage-level relevant result
  let mrr = 0;
  for (let i = 0; i < topK.length; i++) {
    if (expected.some((e) => isPassageMatch(topK[i]!, e))) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  // ── 4. nDCG@k (graded relevance) ─────────────────────────────────────
  const ndcgAtK = computeNdcg(topK, expected, K);

  // ── 5. Source-type coverage ──────────────────────────────────────────
  // Fraction of expected source types present in top-k
  const retrievedSourceTypes = new Set(topK.map((r) => r.source_type));
  const expectedSourceTypes = fixture.expected_source_types;
  const presentTypes = expectedSourceTypes.filter((t) => retrievedSourceTypes.has(t));
  const missingSourceTypes = expectedSourceTypes.filter((t) => !retrievedSourceTypes.has(t));
  const sourceTypeCoverage =
    expectedSourceTypes.length > 0 ? presentTypes.length / expectedSourceTypes.length : 1;

  // ── 6. Passage support rate ──────────────────────────────────────────
  // Fraction of expected passages (with supporting_text) whose text is found
  const passagesWithSupportingText = expected.filter((e) => e.supporting_text);
  const supportedCount = passagesWithSupportingText.filter((e) => {
    return topK.some((r) => isSupportingTextFound(r, e));
  }).length;
  const passageSupportRate =
    passagesWithSupportingText.length > 0 ? supportedCount / passagesWithSupportingText.length : 1; // If no supporting_text specified, default to 1 (not penalized)

  const unsupportedPassages = passagesWithSupportingText.filter((e) => {
    return !topK.some((r) => isSupportingTextFound(r, e));
  });

  // ── 7. Negative-authority recall ─────────────────────────────────────
  // Fraction of queries where NO negative authority appears in top-k
  // 1.0 = no wrong-authority results, 0.0 = at least one wrong-authority result
  const negativeAuthorities = fixture.negative_authorities ?? [];
  const negativeAuthorityHits: NegativeAuthorityHit[] = [];

  for (let i = 0; i < topK.length; i++) {
    const passage = topK[i]!;
    for (const negAuth of negativeAuthorities) {
      if (matchesNegativeAuthority(passage.slug, negAuth.pattern)) {
        negativeAuthorityHits.push({
          pattern: negAuth.pattern,
          reason: negAuth.reason,
          matchedSlug: passage.slug,
          rank: i + 1,
        });
      }
    }
  }

  const negativeAuthorityRecall =
    negativeAuthorities.length > 0 ? (negativeAuthorityHits.length === 0 ? 1.0 : 0.0) : 1.0; // If no negative authorities specified, default to 1.0

  // ── Overall pass ─────────────────────────────────────────────────────
  const pass =
    recallAtK >= thresholds.minRecall &&
    passageSupportRate >= thresholds.minPassageSupport &&
    negativeAuthorityRecall >= thresholds.minNegAuthority;

  return {
    queryId: fixture.id,
    query: fixture.query,
    jurisdiction: fixture.jurisdiction,
    category: fixture.category,
    retrievedCount: topK.length,
    retrievedSlugs: topK.map((r) => r.slug),
    retrievedSourceTypes: Array.from(retrievedSourceTypes),
    recallAtK,
    precisionAtK,
    mrr,
    ndcgAtK,
    sourceTypeCoverage,
    passageSupportRate,
    negativeAuthorityRecall,
    passageMatches,
    negativeAuthorityHits,
    missingSourceTypes,
    unsupportedPassages,
    pass,
  };
}

// ── Summary Aggregation ────────────────────────────────────────────────

function summarizeResults(
  results: RetrievalEvalResult[],
  K: number,
  _fixtures: RetrievalEvalFixture[]
): RetrievalEvalSummary {
  const totalQueries = results.length;
  const passedQueries = results.filter((r) => r.pass).length;

  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);

  const overallRecall = avg(results.map((r) => r.recallAtK));
  const overallPrecision = avg(results.map((r) => r.precisionAtK));
  const overallMrr = avg(results.map((r) => r.mrr));
  const overallNdcg = avg(results.map((r) => r.ndcgAtK));
  const overallSourceTypeCoverage = avg(results.map((r) => r.sourceTypeCoverage));
  const overallPassageSupportRate = avg(results.map((r) => r.passageSupportRate));
  const overallNegativeAuthorityRecall = avg(results.map((r) => r.negativeAuthorityRecall));

  // By jurisdiction
  const byJurisdiction: RetrievalEvalSummary["byJurisdiction"] = {};
  for (const jur of ["DE", "AT", "CH"]) {
    const jurResults = results.filter((r) => r.jurisdiction === jur);
    if (jurResults.length > 0) {
      byJurisdiction[jur] = {
        count: jurResults.length,
        recall: avg(jurResults.map((r) => r.recallAtK)),
        precision: avg(jurResults.map((r) => r.precisionAtK)),
        mrr: avg(jurResults.map((r) => r.mrr)),
        ndcg: avg(jurResults.map((r) => r.ndcgAtK)),
        sourceTypeCoverage: avg(jurResults.map((r) => r.sourceTypeCoverage)),
        passageSupportRate: avg(jurResults.map((r) => r.passageSupportRate)),
        negativeAuthorityRecall: avg(jurResults.map((r) => r.negativeAuthorityRecall)),
      };
    }
  }

  // By category
  const byCategory: RetrievalEvalSummary["byCategory"] = {};
  const categories = new Set(results.map((r) => r.category));
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    if (catResults.length > 0) {
      byCategory[cat] = {
        count: catResults.length,
        recall: avg(catResults.map((r) => r.recallAtK)),
        precision: avg(catResults.map((r) => r.precisionAtK)),
        mrr: avg(catResults.map((r) => r.mrr)),
        ndcg: avg(catResults.map((r) => r.ndcgAtK)),
        sourceTypeCoverage: avg(catResults.map((r) => r.sourceTypeCoverage)),
        passageSupportRate: avg(catResults.map((r) => r.passageSupportRate)),
        negativeAuthorityRecall: avg(catResults.map((r) => r.negativeAuthorityRecall)),
      };
    }
  }

  return {
    totalQueries,
    k: K,
    fixtureVersion: RETRIEVAL_FIXTURE_VERSION,
    timestamp: new Date().toISOString(),
    overallRecall,
    overallPrecision,
    overallMrr,
    overallNdcg,
    overallSourceTypeCoverage,
    overallPassageSupportRate,
    overallNegativeAuthorityRecall,
    passRate: totalQueries > 0 ? passedQueries / totalQueries : 0,
    passedQueries,
    byJurisdiction,
    byCategory,
    results,
  };
}

// ── Report Generation ──────────────────────────────────────────────────

/**
 * Generate a human-readable report from the retrieval eval summary.
 */
export function generateRetrievalReport(summary: RetrievalEvalSummary): string {
  const lines: string[] = [];

  lines.push("=== T2.5 Retrieval Evaluation Report ===");
  lines.push("");
  lines.push(`Total Queries: ${summary.totalQueries}`);
  lines.push(`K: ${summary.k}`);
  lines.push(`Fixture Version: ${summary.fixtureVersion}`);
  lines.push(`Timestamp: ${summary.timestamp}`);
  lines.push("");

  lines.push("--- Aggregate Metrics ---");
  lines.push(`Recall@${summary.k}:              ${(summary.overallRecall * 100).toFixed(1)}%`);
  lines.push(`Precision@${summary.k}:           ${(summary.overallPrecision * 100).toFixed(1)}%`);
  lines.push(`MRR:                  ${summary.overallMrr.toFixed(3)}`);
  lines.push(`nDCG@${summary.k}:               ${summary.overallNdcg.toFixed(3)}`);
  lines.push(`Source-type Coverage: ${(summary.overallSourceTypeCoverage * 100).toFixed(1)}%`);
  lines.push(`Passage Support Rate: ${(summary.overallPassageSupportRate * 100).toFixed(1)}%`);
  lines.push(`Negative-Auth Recall: ${(summary.overallNegativeAuthorityRecall * 100).toFixed(1)}%`);
  lines.push("");

  lines.push("--- Pass Rate ---");
  lines.push(
    `Passed: ${summary.passedQueries}/${summary.totalQueries} (${(summary.passRate * 100).toFixed(1)}%)`
  );
  lines.push("");

  if (Object.keys(summary.byJurisdiction).length > 0) {
    lines.push("--- By Jurisdiction ---");
    for (const [jur, data] of Object.entries(summary.byJurisdiction)) {
      lines.push(`  ${jur} (n=${data.count}):`);
      lines.push(
        `    Recall: ${(data.recall * 100).toFixed(1)}% | Precision: ${(data.precision * 100).toFixed(1)}% | MRR: ${data.mrr.toFixed(3)}`
      );
      lines.push(
        `    nDCG: ${data.ndcg.toFixed(3)} | Source Coverage: ${(data.sourceTypeCoverage * 100).toFixed(1)}%`
      );
      lines.push(
        `    Passage Support: ${(data.passageSupportRate * 100).toFixed(1)}% | Neg-Auth Recall: ${(data.negativeAuthorityRecall * 100).toFixed(1)}%`
      );
    }
    lines.push("");
  }

  if (Object.keys(summary.byCategory).length > 0) {
    lines.push("--- By Category ---");
    for (const [cat, data] of Object.entries(summary.byCategory)) {
      lines.push(`  ${cat} (n=${data.count}):`);
      lines.push(
        `    Recall: ${(data.recall * 100).toFixed(1)}% | Precision: ${(data.precision * 100).toFixed(1)}% | MRR: ${data.mrr.toFixed(3)}`
      );
      lines.push(
        `    nDCG: ${data.ndcg.toFixed(3)} | Source Coverage: ${(data.sourceTypeCoverage * 100).toFixed(1)}%`
      );
      lines.push(
        `    Passage Support: ${(data.passageSupportRate * 100).toFixed(1)}% | Neg-Auth Recall: ${(data.negativeAuthorityRecall * 100).toFixed(1)}%`
      );
    }
    lines.push("");
  }

  // Failed queries
  const failed = summary.results.filter((r) => !r.pass);
  if (failed.length > 0) {
    lines.push("--- Failed Queries ---");
    for (const r of failed.slice(0, 10)) {
      lines.push(`  ${r.queryId} [${r.jurisdiction}/${r.category}]:`);
      lines.push(
        `    Recall: ${(r.recallAtK * 100).toFixed(1)}% | Passage Support: ${(r.passageSupportRate * 100).toFixed(1)}% | Neg-Auth: ${(r.negativeAuthorityRecall * 100).toFixed(1)}%`
      );
      if (r.negativeAuthorityHits.length > 0) {
        lines.push(
          `    Negative authority hits: ${r.negativeAuthorityHits.map((h) => `${h.matchedSlug} (rank ${h.rank})`).join(", ")}`
        );
      }
      if (r.missingSourceTypes.length > 0) {
        lines.push(`    Missing source types: ${r.missingSourceTypes.join(", ")}`);
      }
    }
    if (failed.length > 10) {
      lines.push(`  ... and ${failed.length - 10} more`);
    }
  }

  return lines.join("\n");
}

// ── DACH Retrieval Fixtures ────────────────────────────────────────────

/**
 * DACH retrieval evaluation fixtures with passage-level annotations.
 *
 * These fixtures test:
 * - Passage-level recall (not just law-level)
 * - Source-type coverage (statute, case_law, procedure)
 * - Negative-authority recall (no cross-jurisdiction contamination)
 * - Passage support (supporting text found in retrieved chunks)
 */
export const DACH_RETRIEVAL_FIXTURES: RetrievalEvalFixture[] = [
  // ── DE: Statute retrieval with passage-level expectations ───────────
  {
    id: "de-stat-bgb-433",
    query: "Was ist ein Sachmangel beim Kaufvertrag?",
    jurisdiction: "DE",
    category: "statute",
    expected_passages: [
      {
        slug: "legal/norms/de/bgb/433",
        section: "§ 433",
        supporting_text: "Verkäufer hat die Sache frei von Sachmängeln zu verschaffen",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/abgb/*",
        reason: "ABGB (Austrian law) must not appear for DE queries",
      },
    ],
  },
  {
    id: "de-stat-bgb-195",
    query: "Regelmäßige Verjährungsfrist BGB allgemein",
    jurisdiction: "DE",
    category: "statute",
    expected_passages: [
      {
        slug: "legal/norms/de/bgb/195",
        section: "§ 195",
        supporting_text: "die regelmäßige Verjährungsfrist beträgt drei Jahre",
        relevance: 3,
      },
      {
        slug: "legal/norms/de/bgb/199",
        section: "§ 199",
        relevance: 2,
      },
    ],
    expected_source_types: ["statute"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/abgb/*",
        reason: "ABGB (Austrian law) must not appear for DE queries",
      },
      {
        pattern: "legal/norms/ch/or/*",
        reason: "OR (Swiss law) must not appear for DE queries",
      },
    ],
  },
  {
    id: "de-stat-bgb-280",
    query: "Schadensersatz bei Pflichtverletzung aus dem Schuldverhältnis",
    jurisdiction: "DE",
    category: "statute",
    expected_passages: [
      {
        slug: "legal/norms/de/bgb/280",
        section: "§ 280",
        supporting_text: "Schadensersatzanspruch wegen Pflichtverletzung",
        relevance: 3,
      },
      {
        slug: "legal/norms/de/bgb/281",
        section: "§ 281",
        relevance: 2,
      },
    ],
    expected_source_types: ["statute"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/abgb/*",
        reason: "ABGB must not appear for DE queries",
      },
    ],
  },
  // ── DE: Procedure retrieval ─────────────────────────────────────────
  {
    id: "de-proc-zpo-517",
    query: "Wie lange ist die Berufungsfrist nach Zustellung des Urteils?",
    jurisdiction: "DE",
    category: "procedure",
    expected_passages: [
      {
        slug: "legal/norms/de/zpo/517",
        section: "§ 517",
        supporting_text: "Berufung muss innerhalb einer Frist von einem Monat",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute", "procedure"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/zpo/*",
        reason: "AT ZPO must not appear for DE procedure queries",
      },
    ],
  },
  {
    id: "de-proc-zpo-339",
    query: "Einspruch gegen Versäumnisurteil wie viele Tage?",
    jurisdiction: "DE",
    category: "procedure",
    expected_passages: [
      {
        slug: "legal/norms/de/zpo/339",
        section: "§ 339",
        supporting_text: "Einspruch innerhalb einer Notfrist von zwei Wochen",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute", "procedure"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/zpo/*",
        reason: "AT ZPO must not appear for DE procedure queries",
      },
    ],
  },
  // ── DE: Contract clause retrieval ───────────────────────────────────
  {
    id: "de-contract-bgb-309",
    query: "Haftungsbeschränkung in AGB Klausel Wirksamkeit",
    jurisdiction: "DE",
    category: "contract_clause",
    expected_passages: [
      {
        slug: "legal/norms/de/bgb/309",
        section: "§ 309",
        supporting_text: "In Allgemeinen Geschäftsbedingungen ist unwirksam",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute", "contract_clause"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/kschg/*",
        reason: "AT KSchG (Konsumentenschutzgesetz) must not appear for DE AGB queries",
      },
    ],
  },
  // ── AT: Statute retrieval with passage-level expectations ───────────
  {
    id: "at-stat-abgb-1489",
    query: "Verjährungsfrist für Schadenersatz nach österreichischem Recht",
    jurisdiction: "AT",
    category: "statute",
    expected_passages: [
      {
        slug: "legal/norms/at/abgb/1489",
        section: "§ 1489",
        supporting_text: "Verjährung",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute"],
    negative_authorities: [
      {
        pattern: "legal/norms/de/bgb/*",
        reason: "BGB (German law) must not appear for AT queries",
      },
    ],
  },
  {
    id: "at-stat-abgb-1311",
    query: "Schadenersatz bei Körperverletzung österreichisches ABGB",
    jurisdiction: "AT",
    category: "statute",
    expected_passages: [
      {
        slug: "legal/norms/at/abgb/1311",
        section: "§ 1311",
        supporting_text: "Schadenersatz",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute"],
    negative_authorities: [
      {
        pattern: "legal/norms/de/bgb/*",
        reason: "BGB must not appear for AT queries",
      },
      {
        pattern: "legal/norms/ch/or/*",
        reason: "OR must not appear for AT queries",
      },
    ],
  },
  // ── AT: Procedure retrieval ─────────────────────────────────────────
  {
    id: "at-proc-vwgvg-7",
    query: "Bescheidbeschwerde Frist Verwaltungsgericht Österreich",
    jurisdiction: "AT",
    category: "procedure",
    expected_passages: [
      {
        slug: "legal/norms/at/vwgvg/7",
        section: "§ 7",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute", "procedure"],
    negative_authorities: [
      {
        pattern: "legal/norms/de/vwgo/*",
        reason: "DE VwGO must not appear for AT procedure queries",
      },
    ],
  },
  // ── CH: Statute retrieval ───────────────────────────────────────────
  {
    id: "ch-stat-or-127",
    query: "Verjährungsfrist Kaufvertrag nach Schweizer Obligationenrecht",
    jurisdiction: "CH",
    category: "statute",
    expected_passages: [
      {
        slug: "legal/norms/ch/or/127",
        section: "Art. 127",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute"],
    negative_authorities: [
      {
        pattern: "legal/norms/de/bgb/*",
        reason: "BGB must not appear for CH queries",
      },
      {
        pattern: "legal/norms/at/abgb/*",
        reason: "ABGB must not appear for CH queries",
      },
    ],
  },
  // ── General: Fristberechnung ────────────────────────────────────────
  {
    id: "de-gen-bgb-187",
    query: "Wie berechnet man eine Monatsfrist nach BGB?",
    jurisdiction: "DE",
    category: "general",
    expected_passages: [
      {
        slug: "legal/norms/de/bgb/187",
        section: "§ 187",
        relevance: 3,
      },
      {
        slug: "legal/norms/de/bgb/188",
        section: "§ 188",
        relevance: 2,
      },
    ],
    expected_source_types: ["statute", "general"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/abgb/*",
        reason: "ABGB must not appear for DE queries",
      },
    ],
  },
  // ── Memo / Schriftsatz ──────────────────────────────────────────────
  {
    id: "de-memo-zpo-253",
    query: "Aufbau Klagebegründung ZPO Anspruchsbegründung",
    jurisdiction: "DE",
    category: "memo",
    expected_passages: [
      {
        slug: "legal/norms/de/zpo/253",
        section: "§ 253",
        relevance: 3,
      },
    ],
    expected_source_types: ["statute", "memo"],
    negative_authorities: [
      {
        pattern: "legal/norms/at/zpo/*",
        reason: "AT ZPO must not appear for DE memo queries",
      },
    ],
  },
];
