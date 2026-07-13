/**
 * LAB-DACH v3 — Aggregated Retrieval Qrels
 *
 * Centralizes all retrieval qrels from gold tasks into a single
 * evaluation-ready format. Each entry maps a task_id to its relevant
 * and hard-negative source slugs with grades and reasons.
 *
 * Usage:
 *   import { ALL_QRELS } from "./retrieval-qrels.ts";
 *   const taskQrels = ALL_QRELS.find(q => q.task_id === "gold-de-lit-001");
 */

import type { TaskQrels } from "./types.ts";
import { GOLD_DE_LITIGATION } from "./gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "./gold-tasks-de-criminal.ts";
import { GOLD_AT_LITIGATION } from "./gold-tasks-at-litigation.ts";
import { ALL_GOLD_CH } from "./gold-tasks-ch.ts";

export interface AggregatedQrels {
  task_id: string;
  jurisdiction: string;
  legal_area: string;
  qrels: TaskQrels;
}

function aggregate(tasks: typeof GOLD_DE_LITIGATION): AggregatedQrels[] {
  return tasks
    .filter((t) => t.qrels !== undefined)
    .map((t) => ({
      task_id: t.id,
      jurisdiction: t.jurisdiction,
      legal_area: t.legal_area,
      qrels: t.qrels!,
    }));
}

/** Base qrels — DE/AT only (T2.3 evaluation). Excludes CH (T10.2 scaling). */
export const BASE_QRELS: AggregatedQrels[] = [
  ...aggregate(GOLD_DE_LITIGATION),
  ...aggregate(GOLD_DE_CRIMINAL),
  ...aggregate(GOLD_AT_LITIGATION),
];

/** All qrels — includes CH gold tasks (T10.2 scaling). */
export const ALL_QRELS: AggregatedQrels[] = [...BASE_QRELS, ...aggregate(ALL_GOLD_CH)];

/** Total count of base qrels entries (DE/AT only) */
export const BASE_TOTAL_QRELS = BASE_QRELS.length;

/** Total count of all qrels entries (including CH) */
export const TOTAL_QRELS = ALL_QRELS.length;

/** Total count of relevant (positive) qrel entries across all tasks */
export const TOTAL_RELEVANT = ALL_QRELS.reduce((sum, q) => sum + q.qrels.relevant.length, 0);

/** Total count of hard negative qrel entries across all tasks */
export const TOTAL_HARD_NEGATIVES = ALL_QRELS.reduce(
  (sum, q) => sum + q.qrels.hard_negatives.length,
  0
);

/** Get qrels for a specific task by ID */
export function getQrelsForTask(taskId: string): AggregatedQrels | undefined {
  return ALL_QRELS.find((q) => q.task_id === taskId);
}

/** Get all relevant slugs for a task */
export function getRelevantSlugs(taskId: string): string[] {
  const q = getQrelsForTask(taskId);
  return q ? q.qrels.relevant.map((r) => r.slug) : [];
}

/** Get all hard negative slugs for a task */
export function getHardNegativeSlugs(taskId: string): string[] {
  const q = getQrelsForTask(taskId);
  return q ? q.qrels.hard_negatives.map((r) => r.slug) : [];
}
