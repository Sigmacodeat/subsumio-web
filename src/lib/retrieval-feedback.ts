/**
 * Retrieval Feedback Loop — P1-BRAIN-009
 * ========================================
 * Captures user feedback on search/retrieval results and feeds it
 * back into eval and ranking improvement.
 *
 * Feedback types:
 *   - relevant: Result was helpful and on-topic
 *   - irrelevant: Result appeared but wasn't what the user needed
 *   - outdated: Result contains stale/superseded information
 *   - wrong: Result contains factual errors
 *
 * Architecture:
 *   - FeedbackStore: In-memory store (Phase 1), will migrate to DB
 *   - submitFeedback(): Record a single feedback event
 *   - getFeedbackStats(): Aggregate stats for eval/ranking tuning
 *   - getFeedbackForQuery(): All feedback for a specific query
 *   - getNegativeSignals(): Results that consistently get negative feedback
 *   - exportForEval(): Export feedback as qrels-compatible format
 *   - applyFeedbackBoosts: Score adjustments based on accumulated feedback
 */

// ── Types ─────────────────────────────────────────────────────────────

export type FeedbackType = "relevant" | "irrelevant" | "outdated" | "wrong";

export type FeedbackSeverity = "low" | "medium" | "high";

export interface RetrievalFeedback {
  id: string;
  /** The query that produced the result */
  query: string;
  /** Hash of the query for privacy-preserving aggregation */
  query_hash: string;
  /** The result slug that received feedback */
  result_slug: string;
  /** The result title at time of feedback (for context) */
  result_title: string;
  /** Type of feedback */
  feedback_type: FeedbackType;
  /** Severity (user-perceived) */
  severity: FeedbackSeverity;
  /** Optional comment from the user */
  comment?: string;
  /** User ID who gave the feedback */
  user_id: string;
  /** Brain ID for tenant isolation */
  brain_id: string;
  /** Org ID for tenant isolation */
  org_id: string;
  /** When the feedback was submitted */
  created_at: string;
  /** The search mode that produced the result */
  search_mode?: string;
  /** The result's rank position when feedback was given */
  rank_position?: number;
  /** The result's score when feedback was given */
  result_score?: number;
}

export interface FeedbackStats {
  total_feedback: number;
  by_type: Record<FeedbackType, number>;
  by_severity: Record<FeedbackSeverity, number>;
  unique_queries: number;
  unique_results: number;
  /** Results with most negative feedback */
  problematic_results: Array<{
    result_slug: string;
    result_title: string;
    negative_count: number;
    feedback_types: FeedbackType[];
  }>;
  /** Queries with lowest satisfaction */
  problematic_queries: Array<{
    query_hash: string;
    query: string;
    negative_count: number;
    positive_count: number;
    satisfaction_rate: number;
  }>;
  /** Overall satisfaction rate (relevant / total) */
  satisfaction_rate: number;
}

export interface FeedbackBoostSignal {
  result_slug: string;
  /** Net score adjustment: positive = boost, negative = demote */
  boost: number;
  /** Confidence based on feedback count */
  confidence: number;
  /** Reason for the boost */
  reason: string;
}

export interface QrelsExportEntry {
  query_id: string;
  query: string;
  relevant_slugs: string[];
  irrelevant_slugs: string[];
  outdated_slugs: string[];
  wrong_slugs: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function hashQuery(query: string): string {
  // Simple hash for aggregation (not cryptographic — just for grouping)
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    const char = query.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `q${Math.abs(hash).toString(36)}`;
}

const POSITIVE_TYPES: FeedbackType[] = ["relevant"];
const NEGATIVE_TYPES: FeedbackType[] = ["irrelevant", "outdated", "wrong"];

const SEVERITY_WEIGHT: Record<FeedbackSeverity, number> = {
  low: 0.5,
  medium: 1.0,
  high: 2.0,
};

const FEEDBACK_TYPE_WEIGHT: Record<FeedbackType, number> = {
  relevant: 1.0,
  irrelevant: -0.5,
  outdated: -0.8,
  wrong: -1.5,
};

// ── Feedback Store ────────────────────────────────────────────────────

const feedbackStore = new Map<string, RetrievalFeedback>();

export function submitFeedback(
  feedback: Omit<RetrievalFeedback, "id" | "query_hash" | "created_at">
): RetrievalFeedback {
  const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const query_hash = hashQuery(feedback.query);
  const created_at = new Date().toISOString();

  const entry: RetrievalFeedback = {
    ...feedback,
    id,
    query_hash,
    created_at,
  };

  feedbackStore.set(id, entry);
  return entry;
}

export function getFeedback(id: string): RetrievalFeedback | undefined {
  return feedbackStore.get(id);
}

export function getAllFeedback(): RetrievalFeedback[] {
  return Array.from(feedbackStore.values());
}

export function getFeedbackForQuery(query: string): RetrievalFeedback[] {
  const qhash = hashQuery(query);
  return getAllFeedback().filter((f) => f.query_hash === qhash);
}

export function getFeedbackForSlug(slug: string): RetrievalFeedback[] {
  return getAllFeedback().filter((f) => f.result_slug === slug);
}

export function clearFeedbackStore(): void {
  feedbackStore.clear();
}

// ── Tenant-Isolated Access ────────────────────────────────────────────

export function getFeedbackForOrg(orgId: string): RetrievalFeedback[] {
  return getAllFeedback().filter((f) => f.org_id === orgId);
}

export function getFeedbackForBrain(brainId: string): RetrievalFeedback[] {
  return getAllFeedback().filter((f) => f.brain_id === brainId);
}

// ── Stats ─────────────────────────────────────────────────────────────

export function getFeedbackStats(feedback: RetrievalFeedback[] = getAllFeedback()): FeedbackStats {
  const byType: Record<FeedbackType, number> = {
    relevant: 0,
    irrelevant: 0,
    outdated: 0,
    wrong: 0,
  };
  const bySeverity: Record<FeedbackSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };

  const queries = new Set<string>();
  const results = new Set<string>();
  const queryMap = new Map<string, { query: string; positive: number; negative: number }>();
  const resultMap = new Map<
    string,
    { title: string; negative: number; types: Set<FeedbackType> }
  >();

  for (const f of feedback) {
    byType[f.feedback_type]++;
    bySeverity[f.severity]++;
    queries.add(f.query_hash);
    results.add(f.result_slug);

    // Query aggregation
    const qEntry = queryMap.get(f.query_hash) ?? { query: f.query, positive: 0, negative: 0 };
    if (POSITIVE_TYPES.includes(f.feedback_type)) qEntry.positive++;
    else qEntry.negative++;
    queryMap.set(f.query_hash, qEntry);

    // Result aggregation
    const rEntry = resultMap.get(f.result_slug) ?? {
      title: f.result_title,
      negative: 0,
      types: new Set(),
    };
    if (NEGATIVE_TYPES.includes(f.feedback_type)) {
      rEntry.negative++;
      rEntry.types.add(f.feedback_type);
    }
    resultMap.set(f.result_slug, rEntry);
  }

  const total = feedback.length;
  const positiveCount = byType.relevant;
  const satisfactionRate = total > 0 ? positiveCount / total : 0;

  const problematicResults = Array.from(resultMap.entries())
    .filter(([_, v]) => v.negative > 0)
    .map(([slug, v]) => ({
      result_slug: slug,
      result_title: v.title,
      negative_count: v.negative,
      feedback_types: Array.from(v.types),
    }))
    .sort((a, b) => b.negative_count - a.negative_count)
    .slice(0, 20);

  const problematicQueries = Array.from(queryMap.entries())
    .map(([hash, v]) => ({
      query_hash: hash,
      query: v.query,
      negative_count: v.negative,
      positive_count: v.positive,
      satisfaction_rate: v.positive + v.negative > 0 ? v.positive / (v.positive + v.negative) : 0,
    }))
    .filter((q) => q.negative_count > 0)
    .sort((a, b) => a.satisfaction_rate - b.satisfaction_rate)
    .slice(0, 20);

  return {
    total_feedback: total,
    by_type: byType,
    by_severity: bySeverity,
    unique_queries: queries.size,
    unique_results: results.size,
    problematic_results: problematicResults,
    problematic_queries: problematicQueries,
    satisfaction_rate: satisfactionRate,
  };
}

// ── Boost Signals for Ranking ─────────────────────────────────────────

export function getFeedbackBoosts(
  feedback: RetrievalFeedback[] = getAllFeedback()
): FeedbackBoostSignal[] {
  const slugScores = new Map<
    string,
    { slug: string; title: string; netScore: number; count: number }
  >();

  for (const f of feedback) {
    const entry = slugScores.get(f.result_slug) ?? {
      slug: f.result_slug,
      title: f.result_title,
      netScore: 0,
      count: 0,
    };
    const weight = FEEDBACK_TYPE_WEIGHT[f.feedback_type] * SEVERITY_WEIGHT[f.severity];
    entry.netScore += weight;
    entry.count++;
    slugScores.set(f.result_slug, entry);
  }

  return Array.from(slugScores.values())
    .filter((e) => e.count >= 2) // Need at least 2 feedbacks for a signal
    .map((e) => ({
      result_slug: e.slug,
      boost: Math.max(-0.5, Math.min(0.5, e.netScore / e.count)), // Clamp [-0.5, +0.5]
      confidence: Math.min(1, e.count / 10), // Full confidence at 10+ feedbacks
      reason:
        e.netScore > 0
          ? `${e.count} feedback events, net positive`
          : e.netScore < 0
            ? `${e.count} feedback events, net negative`
            : `${e.count} feedback events, neutral`,
    }))
    .sort((a, b) => Math.abs(b.boost) - Math.abs(a.boost));
}

// ── Eval Export (qrels-compatible) ────────────────────────────────────

export function exportForEval(
  feedback: RetrievalFeedback[] = getAllFeedback()
): QrelsExportEntry[] {
  const queryGroups = new Map<string, QrelsExportEntry>();

  for (const f of feedback) {
    const entry = queryGroups.get(f.query_hash) ?? {
      query_id: f.query_hash,
      query: f.query,
      relevant_slugs: [],
      irrelevant_slugs: [],
      outdated_slugs: [],
      wrong_slugs: [],
    };

    switch (f.feedback_type) {
      case "relevant":
        if (!entry.relevant_slugs.includes(f.result_slug)) entry.relevant_slugs.push(f.result_slug);
        break;
      case "irrelevant":
        if (!entry.irrelevant_slugs.includes(f.result_slug))
          entry.irrelevant_slugs.push(f.result_slug);
        break;
      case "outdated":
        if (!entry.outdated_slugs.includes(f.result_slug)) entry.outdated_slugs.push(f.result_slug);
        break;
      case "wrong":
        if (!entry.wrong_slugs.includes(f.result_slug)) entry.wrong_slugs.push(f.result_slug);
        break;
    }

    queryGroups.set(f.query_hash, entry);
  }

  return Array.from(queryGroups.values()).sort((a, b) => a.query_id.localeCompare(b.query_id));
}

// ── Validation ────────────────────────────────────────────────────────

export function validateFeedback(
  feedback: Omit<RetrievalFeedback, "id" | "query_hash" | "created_at">
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!feedback.query || feedback.query.trim().length === 0) {
    errors.push("query is required");
  }
  if (!feedback.result_slug || feedback.result_slug.trim().length === 0) {
    errors.push("result_slug is required");
  }
  if (!feedback.user_id) {
    errors.push("user_id is required");
  }
  if (!feedback.brain_id) {
    errors.push("brain_id is required");
  }
  if (!feedback.org_id) {
    errors.push("org_id is required");
  }

  const validTypes: FeedbackType[] = ["relevant", "irrelevant", "outdated", "wrong"];
  if (!validTypes.includes(feedback.feedback_type)) {
    errors.push(`feedback_type must be one of: ${validTypes.join(", ")}`);
  }

  const validSeverities: FeedbackSeverity[] = ["low", "medium", "high"];
  if (!validSeverities.includes(feedback.severity)) {
    errors.push(`severity must be one of: ${validSeverities.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
