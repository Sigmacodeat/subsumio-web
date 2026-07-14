/**
 * LAB-DACH v3 — Review Queue
 *
 * Routes cross-judge results to a human review queue.
 *
 * Queue entry criteria:
 *   (a) Judge disagreement between the two cross-vendor judges
 *   (b) Status uncertain / not_judgeable / judge_error
 *   (c) ANY criterion with severity "critical" (always human, even on agreement)
 *
 * Auto-resolved (NOT queued):
 *   - Unanimous pass/fail with exclusively verified citations
 *   - Marked with judge_provenance='llm_cross_judge' (never 'human')
 *
 * Human verdicts are persisted as Goldtasks (split='dev' or 'test', NEVER holdout)
 * with reviewed_by + reviewed_at + reviewer_type='human_jurist'.
 *
 * Provenance:
 *   reviewer_type: 'human_jurist' | 'llm_cross_judge'
 *   Public benchmark claims may ONLY count human-reviewed tasks.
 */

import type { Task, SplitType } from "./types.ts";
import type { CrossJudgeResult, CrossJudgeCriterionResult, ModelAnswer } from "./cross-judge.ts";

// ── Types ─────────────────────────────────────────────────────────────

/** Why this item is in the review queue. */
export type ReviewReason =
  | "judge_disagreement"
  | "uncertain_or_not_judgeable"
  | "critical_criterion_requires_human"
  | "grounding_failure";

/** Provenance for a verdict — strictly separated. */
export type ReviewerType = "human_jurist" | "llm_cross_judge";

/** A single item in the review queue. */
export interface ReviewQueueItem {
  /** Unique queue item ID. */
  id: string;
  /** Task ID being reviewed. */
  task_id: string;
  /** The task itself (for display). */
  task: Task;
  /** Answer from model A. */
  answer_a: ModelAnswer;
  /** Answer from model B. */
  answer_b: ModelAnswer;
  /** Cross-judge result for answer A (judged by model B). */
  judge_a: CrossJudgeResult;
  /** Cross-judge result for answer B (judged by model A). */
  judge_b: CrossJudgeResult;
  /** Reasons this item is in the queue. */
  review_reasons: ReviewReason[];
  /** Whether the two judges disagreed. */
  disagreement: boolean;
  /** Queue item status. */
  status: "pending" | "resolved" | "skipped";
  /** Timestamp when added to queue. */
  queued_at: string;
  /** Human verdict (set when resolved). */
  human_verdict?: HumanVerdict;
}

/** A human jurist's verdict on a review queue item. */
export interface HumanVerdict {
  /** Which answer the jurist chose (or both, or neither). */
  decision: "pass_a" | "pass_b" | "pass_both" | "fail_both" | "edit";
  /** The jurist's final answer text (if edited). */
  edited_text?: string;
  /** Which criteria the jurist marked as passed. */
  passed_criteria: string[];
  /** Which criteria the jurist marked as failed. */
  failed_criteria: string[];
  /** Jurist's notes/reasoning. */
  notes: string;
  /** Reviewer name. */
  reviewer_name: string;
  /** ISO timestamp of the verdict. */
  reviewed_at: string;
  /** Provenance: always 'human_jurist' for human verdicts. */
  reviewer_type: "human_jurist";
  /** Split for the resulting goldtask: 'dev' or 'test' (NEVER 'holdout'). */
  split: "dev" | "test";
}

/** Result of persisting a human verdict as a goldtask. */
export interface PersistedGoldTask {
  /** The task ID of the new/updated goldtask. */
  task_id: string;
  /** The split (dev or test, never holdout). */
  split: "dev" | "test";
  /** Reviewer type. */
  reviewer_type: "human_jurist";
  /** Whether this was a new task or an update to an existing one. */
  created: boolean;
}

// ── Queue Construction ────────────────────────────────────────────────

/**
 * Build review queue items from cross-judge session results.
 *
 * Only items that need human review are queued. Auto-resolved items
 * (unanimous pass/fail, all citations verified, no critical criteria)
 * are NOT queued.
 *
 * IMPORTANT: Tasks with split='holdout' are NEVER queued — this code
 * path does not touch the holdout split.
 */
export function buildReviewQueue(
  sessions: Array<{
    task: Task;
    answer_a: ModelAnswer;
    answer_b: ModelAnswer;
    judge_a: CrossJudgeResult;
    judge_b: CrossJudgeResult;
    disagreement: boolean;
    needs_review: boolean;
    review_reasons: string[];
  }>
): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = [];

  for (const session of sessions) {
    // CRITICAL: Never queue holdout tasks
    if (session.task.split === "holdout") {
      throw new Error(
        `Review queue violation: task ${session.task.id} has split='holdout'. ` +
          `The review queue must NEVER touch holdout tasks.`
      );
    }

    if (!session.needs_review) continue;

    items.push({
      id: `review-${session.task.id}-${Date.now()}`,
      task_id: session.task.id,
      task: session.task,
      answer_a: session.answer_a,
      answer_b: session.answer_b,
      judge_a: session.judge_a,
      judge_b: session.judge_b,
      review_reasons: session.review_reasons as ReviewReason[],
      disagreement: session.disagreement,
      status: "pending",
      queued_at: new Date().toISOString(),
    });
  }

  return items;
}

// ── Auto-Resolution Check ─────────────────────────────────────────────

/**
 * Check if a cross-judge result can be auto-resolved (no human review needed).
 *
 * Auto-resolved conditions:
 *   1. No disagreement between judges
 *   2. No uncertain/not_judgeable/judge_error statuses
 *   3. No critical criteria (critical always needs human)
 *   4. All citations verified (grounding passed)
 *
 * Auto-resolved items get reviewer_type='llm_cross_judge' (NEVER 'human').
 */
export function canAutoResolve(
  judgeA: CrossJudgeResult,
  judgeB: CrossJudgeResult,
  disagreement: boolean
): boolean {
  if (disagreement) return false;
  if (judgeA.has_uncertain || judgeB.has_uncertain) return false;
  if (judgeA.has_critical || judgeB.has_critical) return false;
  if (!judgeA.answer.grounding.all_verified) return false;
  if (!judgeB.answer.grounding.all_verified) return false;
  return true;
}

// ── Human Verdict Persistence ─────────────────────────────────────────

/**
 * Persist a human verdict as a goldtask.
 *
 * The resulting goldtask:
 *   - split: 'dev' or 'test' (NEVER 'holdout' — enforced by type)
 *   - review_status: 'approved'
 *   - reviewed_by: the jurist's name
 *   - reviewed_at: ISO timestamp
 *   - reviewer_type: 'human_jurist' (on the reviewer metadata)
 *   - reference_output: the jurist's final answer (edited or chosen)
 *
 * @param item The review queue item
 * @param verdict The human verdict
 * @param existingTasks Map of existing task IDs (to detect updates vs creates)
 * @returns Persistence result
 */
export function persistHumanVerdict(
  item: ReviewQueueItem,
  verdict: HumanVerdict,
  existingTasks: Map<string, Task>
): PersistedGoldTask {
  // Guard: never persist with holdout split
  // verdict.split is typed as 'dev' | 'test' so it can never be 'holdout',
  // but we still check item.task.split as a runtime safety net.
  if (item.task.split === "holdout") {
    throw new Error(
      `Persistence violation: cannot persist human verdict for task with split='holdout'. ` +
        `Human verdicts must use 'dev' or 'test' split only.`
    );
  }

  const taskId = item.task_id;
  const exists = existingTasks.has(taskId);

  // The reference output is the jurist's chosen/edited answer
  const referenceOutput = verdict.edited_text ??
    (verdict.decision === "pass_a" ? item.answer_a.text :
     verdict.decision === "pass_b" ? item.answer_b.text :
     verdict.decision === "pass_both" ? item.answer_a.text : // prefer A on both-pass
     "");

  // Build the updated/new task
  const task: Task = {
    ...item.task,
    split: verdict.split,
    review_status: "approved",
    reviewed_by: verdict.reviewer_name,
    created_at: item.task.created_at ?? new Date().toISOString(),
    updated_at: verdict.reviewed_at,
    reference_output: referenceOutput || item.task.reference_output,
    reviewer: {
      name: verdict.reviewer_name,
      role: "Jurist (Human Review)",
      reviewed_at: verdict.reviewed_at,
    },
  };

  existingTasks.set(taskId, task);

  return {
    task_id: taskId,
    split: verdict.split,
    reviewer_type: "human_jurist",
    created: !exists,
  };
}

// ── Queue Stats ───────────────────────────────────────────────────────

export interface QueueStats {
  total: number;
  pending: number;
  resolved: number;
  skipped: number;
  by_reason: Record<ReviewReason, number>;
  by_disagreement: number;
}

export function computeQueueStats(items: ReviewQueueItem[]): QueueStats {
  const byReason: Record<ReviewReason, number> = {
    judge_disagreement: 0,
    uncertain_or_not_judgeable: 0,
    critical_criterion_requires_human: 0,
    grounding_failure: 0,
  };

  for (const item of items) {
    for (const reason of item.review_reasons) {
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
  }

  return {
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    resolved: items.filter((i) => i.status === "resolved").length,
    skipped: items.filter((i) => i.status === "skipped").length,
    by_reason: byReason,
    by_disagreement: items.filter((i) => i.disagreement).length,
  };
}

// ── Holdout Guard ─────────────────────────────────────────────────────

/**
 * Assert that no holdout tasks are present in a list of tasks.
 * This is a structural guard to ensure the review workflow never touches holdout.
 */
export function assertNoHoldout(tasks: Task[]): void {
  const holdoutTasks = tasks.filter((t) => t.split === "holdout");
  if (holdoutTasks.length > 0) {
    throw new Error(
      `Holdout guard violation: ${holdoutTasks.length} holdout task(s) found in input. ` +
        `Holdout tasks must NEVER be processed by the review workflow. ` +
        `IDs: ${holdoutTasks.map((t) => t.id).join(", ")}`
    );
  }
}
