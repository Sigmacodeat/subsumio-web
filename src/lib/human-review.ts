/**
 * Human Review Feedback für Subsumio.
 *
 * Anwälte können AI-Antworten bewerten: korrekt, falsch, unvollständig.
 * Das Feedback fließt in:
 *   - Eval-Fälle (als zukünftige Goldenset-Einträge)
 *   - Quality Reports (als Human-Review-Signal)
 *   - Review Queue (für wiederkehrende Probleme)
 *
 * Persistence: Brain-Page unter "monitoring/ai-review-feedback".
 * Das ermöglicht mandantenisolierte, auditierbare Speicherung ohne
 * zusätzliche relationale Tabelle (Paket 0B-konform).
 */

import type { EvalCategory } from "@/lib/rag-eval";

// ── Types ─────────────────────────────────────────────────────────────

export type ReviewVerdict = "correct" | "incorrect" | "incomplete";

export interface HumanReviewFeedback {
  id: string;
  /** The AI response that was reviewed. */
  source_endpoint: string;
  /** The query/prompt that produced the response. */
  query: string;
  /** The AI answer text (truncated for storage). */
  answer_excerpt: string;
  /** The attorney's verdict. */
  verdict: ReviewVerdict;
  /** Free-text comment from the attorney. */
  comment?: string;
  /** Which citations were flagged as wrong by the attorney. */
  flagged_citations?: string[];
  /** Suggested correct answer (if attorney provided one). */
  suggested_correction?: string;
  /** Category for eval integration. */
  category?: EvalCategory;
  /** Jurisdiction. */
  jurisdiction?: "DE" | "AT" | "CH";
  /** Reviewer user ID. */
  reviewer_id: string;
  /** Review timestamp. */
  reviewed_at: string;
  /** Whether this feedback has been promoted to a golden-set entry. */
  promoted_to_fixture: boolean;
}

export interface ReviewFeedbackSummary {
  total: number;
  correct: number;
  incorrect: number;
  incomplete: number;
  /** Accuracy rate = correct / total (0–1). */
  accuracy_rate: number;
  /** Most recently reviewed items. */
  recent: HumanReviewFeedback[];
  /** Endpoints with highest error rates. */
  by_endpoint: Record<string, { total: number; incorrect: number; incomplete: number }>;
}

// ── Persistence (Brain-page based) ────────────────────────────────────

const FEEDBACK_SLUG = "monitoring/ai-review-feedback";

interface FeedbackPage {
  frontmatter: {
    feedback: HumanReviewFeedback[];
  };
}

export async function loadFeedback(
  engineUrl: string,
  engineHeaders: Record<string, string>
): Promise<HumanReviewFeedback[]> {
  try {
    const res = await fetch(`${engineUrl}/api/pages/${FEEDBACK_SLUG}`, {
      headers: engineHeaders,
    });
    if (!res.ok) return [];
    const page = (await res.json()) as FeedbackPage;
    const feedback = page.frontmatter?.feedback;
    if (!Array.isArray(feedback)) return [];
    return feedback;
  } catch {
    return [];
  }
}

export async function saveFeedback(
  engineUrl: string,
  engineHeaders: Record<string, string>,
  feedback: HumanReviewFeedback[]
): Promise<void> {
  try {
    await fetch(`${engineUrl}/api/pages`, {
      method: "POST",
      headers: { ...engineHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: FEEDBACK_SLUG,
        title: "AI Review Feedback",
        type: "system",
        content: "Automatisch verwaltete Human-Review-Feedback-Daten.",
        frontmatter: { feedback },
      }),
    });
  } catch {
    // Non-fatal — feedback is best-effort persistence
  }
}

// ── Submit feedback ───────────────────────────────────────────────────

export async function submitFeedback(
  engineUrl: string,
  engineHeaders: Record<string, string>,
  input: Omit<HumanReviewFeedback, "id" | "reviewed_at" | "promoted_to_fixture">
): Promise<HumanReviewFeedback> {
  const existing = await loadFeedback(engineUrl, engineHeaders);

  const entry: HumanReviewFeedback = {
    ...input,
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    reviewed_at: new Date().toISOString(),
    promoted_to_fixture: false,
  };

  // Prepend new entry, keep max 500 entries to avoid unbounded growth
  const updated = [entry, ...existing].slice(0, 500);
  await saveFeedback(engineUrl, engineHeaders, updated);

  return entry;
}

// ── Summarize feedback ────────────────────────────────────────────────

export function summarizeFeedback(feedback: HumanReviewFeedback[]): ReviewFeedbackSummary {
  const total = feedback.length;
  const correct = feedback.filter((f) => f.verdict === "correct").length;
  const incorrect = feedback.filter((f) => f.verdict === "incorrect").length;
  const incomplete = feedback.filter((f) => f.verdict === "incomplete").length;

  const by_endpoint: ReviewFeedbackSummary["by_endpoint"] = {};
  for (const f of feedback) {
    if (!by_endpoint[f.source_endpoint]) {
      by_endpoint[f.source_endpoint] = { total: 0, incorrect: 0, incomplete: 0 };
    }
    by_endpoint[f.source_endpoint].total++;
    if (f.verdict === "incorrect") by_endpoint[f.source_endpoint].incorrect++;
    if (f.verdict === "incomplete") by_endpoint[f.source_endpoint].incomplete++;
  }

  return {
    total,
    correct,
    incorrect,
    incomplete,
    accuracy_rate: total > 0 ? correct / total : 0,
    recent: feedback.slice(0, 20),
    by_endpoint,
  };
}

// ── Promote to fixture ────────────────────────────────────────────────

export interface PromotableFeedback {
  query: string;
  expectedSlugs: string[];
  category: EvalCategory;
  jurisdiction?: "DE" | "AT" | "CH";
  source: string;
}

/**
 * Convert an incorrect/incomplete review into a potential golden-set entry.
 * The attorney's suggested correction is used to identify expected slugs.
 */
export function promoteToFixture(
  feedback: HumanReviewFeedback,
  expectedSlugs: string[]
): PromotableFeedback | null {
  if (feedback.verdict === "correct") return null;
  if (feedback.promoted_to_fixture) return null;

  return {
    query: feedback.query,
    expectedSlugs,
    category: feedback.category ?? "general",
    jurisdiction: feedback.jurisdiction,
    source: `human-review:${feedback.id}`,
  };
}

/**
 * Mark a feedback entry as promoted to the golden set.
 */
export async function markPromoted(
  engineUrl: string,
  engineHeaders: Record<string, string>,
  feedbackId: string
): Promise<void> {
  const existing = await loadFeedback(engineUrl, engineHeaders);
  const updated = existing.map((f) =>
    f.id === feedbackId ? { ...f, promoted_to_fixture: true } : f
  );
  await saveFeedback(engineUrl, engineHeaders, updated);
}
