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
 *   - Feedback is persisted as standalone engine pages of type
 *     `retrieval_feedback` under `retrieval-feedback/<orgId>/<ts>-<rand>`
 *     (same standalone-page pattern as `time_entry` in time-tracking.ts).
 *     Every function takes the route's server brain client
 *     (`createServerBrainClient(ctx.headers)`) so the engine applies the
 *     source isolation and matter access rules — no anonymous reads.
 *   - submitFeedback(): Write one feedback page
 *   - getFeedbackForOrg()/getFeedbackForBrain(): Tenant-isolated reads
 *   - getFeedbackStats(): Aggregate stats for eval/ranking tuning
 *   - getFeedbackBoosts: Score adjustments based on accumulated feedback
 *   - exportForEval(): Export feedback as qrels-compatible format
 */

import { listAllPagesOfType } from "@/lib/time-tracking";

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

// ── Engine persistence ────────────────────────────────────────────────

/**
 * Minimal engine surface the feedback store needs. The route's
 * `createServerBrainClient(ctx.headers)` satisfies it structurally — the
 * identity-bearing headers make the engine scope every call to the
 * caller's own brain/source (tenant isolation is not a filter we apply
 * here, it is enforced server-side).
 */
export interface FeedbackEngineClient {
  listPages(opts: { type: string; limit: number; offset: number }): Promise<unknown[]>;
  createPage(page: {
    slug: string;
    title: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  }): Promise<unknown>;
}

export const FEEDBACK_PAGE_TYPE = "retrieval_feedback";
export const FEEDBACK_SLUG_PREFIX = "retrieval-feedback/";

/**
 * Upper bound of feedback pages read per request — the same paging cap as
 * `listAllPagesOfType` applies to `time_entry`. Stats stay org-scoped; the
 * cap only guards against pathological growth.
 */
export const FEEDBACK_LIST_MAX = 5_000;

const FEEDBACK_TYPES: FeedbackType[] = ["relevant", "irrelevant", "outdated", "wrong"];
const FEEDBACK_SEVERITIES: FeedbackSeverity[] = ["low", "medium", "high"];

function slugPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "default";
}

/**
 * Maps a `retrieval_feedback` page back to the entry shape. Pages that are
 * tombstoned or carry no recognizable feedback payload are skipped — a
 * hand-edited or half-migrated page must not poison the stats.
 */
export function feedbackFromPage(page: {
  slug: string;
  frontmatter?: unknown;
}): RetrievalFeedback | null {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  if (fm.status === "tombstoned") return null;
  const type = fm.feedback_type;
  if (!FEEDBACK_TYPES.includes(type as FeedbackType)) return null;
  const severity = fm.severity;
  const query = String(fm.query ?? "");
  return {
    id: typeof fm.id === "string" && fm.id ? fm.id : page.slug,
    query,
    query_hash: String(fm.query_hash ?? hashQuery(query)),
    result_slug: String(fm.result_slug ?? ""),
    result_title: String(fm.result_title ?? ""),
    feedback_type: type as FeedbackType,
    severity: FEEDBACK_SEVERITIES.includes(severity as FeedbackSeverity)
      ? (severity as FeedbackSeverity)
      : "medium",
    comment: typeof fm.comment === "string" && fm.comment ? fm.comment : undefined,
    user_id: String(fm.user_id ?? ""),
    brain_id: String(fm.brain_id ?? ""),
    org_id: String(fm.org_id ?? ""),
    created_at: String(fm.created_at ?? ""),
    search_mode: typeof fm.search_mode === "string" ? fm.search_mode : undefined,
    rank_position: typeof fm.rank_position === "number" ? fm.rank_position : undefined,
    result_score: typeof fm.result_score === "number" ? fm.result_score : undefined,
  };
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

// ── Feedback Store (engine-backed) ────────────────────────────────────

/**
 * Writes one feedback event as a `retrieval_feedback` page. The slug is
 * org-prefixed (`retrieval-feedback/<orgId>/<ts>-<rand>`), so listings can
 * later be narrowed by slug prefix and the id doubles as the page slug.
 * Throws when the engine write fails — the route maps that to a 5xx, a
 * silently dropped vote would corrupt the eval signal.
 */
export async function submitFeedback(
  brain: FeedbackEngineClient,
  feedback: Omit<RetrievalFeedback, "id" | "query_hash" | "created_at">
): Promise<RetrievalFeedback> {
  const id = `${FEEDBACK_SLUG_PREFIX}${slugPart(feedback.org_id)}/${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const entry: RetrievalFeedback = {
    ...feedback,
    id,
    query_hash: hashQuery(feedback.query),
    created_at: new Date().toISOString(),
  };

  await brain.createPage({
    slug: id,
    title: `Retrieval-Feedback: ${feedback.feedback_type} → ${feedback.result_slug}`,
    type: FEEDBACK_PAGE_TYPE,
    // The comment doubles as the page body so full-text search over pages
    // can find free-text feedback; listings read everything from fm.
    content: feedback.comment ?? "",
    frontmatter: {
      type: FEEDBACK_PAGE_TYPE,
      ...entry,
    },
  });

  return entry;
}

async function listAllFeedback(
  brain: Pick<FeedbackEngineClient, "listPages">,
  limit: number
): Promise<RetrievalFeedback[]> {
  const cap = Math.min(Math.max(1, Math.floor(limit)), FEEDBACK_LIST_MAX);
  // listAllPagesOfType reads in fixed batches of 100 — a cap under 100 (or a
  // non-multiple) still fetches a whole batch, so clamp the result here.
  const pages = (await listAllPagesOfType(brain, FEEDBACK_PAGE_TYPE, cap)).slice(0, cap);
  return pages
    .map(feedbackFromPage)
    .filter((f): f is RetrievalFeedback => f !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// ── Tenant-Isolated Access ────────────────────────────────────────────

/**
 * All feedback of one org. The brain client is already source-scoped via
 * the caller's ctx.headers; the `org_id` match keeps multi-org brains
 * (shared corpora) from leaking a sister org's votes.
 */
export async function getFeedbackForOrg(
  brain: Pick<FeedbackEngineClient, "listPages">,
  orgId: string,
  opts: { limit?: number } = {}
): Promise<RetrievalFeedback[]> {
  const all = await listAllFeedback(brain, opts.limit ?? FEEDBACK_LIST_MAX);
  return all.filter((f) => f.org_id === orgId);
}

export async function getFeedbackForBrain(
  brain: Pick<FeedbackEngineClient, "listPages">,
  brainId: string,
  opts: { limit?: number } = {}
): Promise<RetrievalFeedback[]> {
  const all = await listAllFeedback(brain, opts.limit ?? FEEDBACK_LIST_MAX);
  return all.filter((f) => f.brain_id === brainId);
}

export function getFeedbackForQuery(
  feedback: RetrievalFeedback[],
  query: string
): RetrievalFeedback[] {
  const qhash = hashQuery(query);
  return feedback.filter((f) => f.query_hash === qhash);
}

export function getFeedbackForSlug(
  feedback: RetrievalFeedback[],
  slug: string
): RetrievalFeedback[] {
  return feedback.filter((f) => f.result_slug === slug);
}

// ── Stats ─────────────────────────────────────────────────────────────

export function getFeedbackStats(feedback: RetrievalFeedback[] = []): FeedbackStats {
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

export function getFeedbackBoosts(feedback: RetrievalFeedback[] = []): FeedbackBoostSignal[] {
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

export function exportForEval(feedback: RetrievalFeedback[] = []): QrelsExportEntry[] {
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

  if (!FEEDBACK_TYPES.includes(feedback.feedback_type)) {
    errors.push(`feedback_type must be one of: ${FEEDBACK_TYPES.join(", ")}`);
  }

  if (!FEEDBACK_SEVERITIES.includes(feedback.severity)) {
    errors.push(`severity must be one of: ${FEEDBACK_SEVERITIES.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}
