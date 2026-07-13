/**
 * EPIC 8 — T8.4 Queue Reliability: Dead Letter Queue (DLQ)
 *
 * Stores jobs that have reached terminal failure state ("dead") with
 * full context for debugging and potential reprocessing.
 *
 * The DLQ is separate from the main job queue so dead jobs don't
 * clutter the active queue but remain queryable for ops and audit.
 */

import { randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────

export type DeadLetterReason =
  | "max_attempts_exceeded"
  | "max_stalled_exceeded"
  | "timeout_exceeded"
  | "wall_clock_timeout_exceeded"
  | "permanent_error"
  | "cancelled"
  | "mandatory_check_failed";

export interface DeadLetterEntry {
  id: string;
  original_job_id: number;
  job_name: string;
  queue: string;
  reason: DeadLetterReason;
  error_text: string;
  stacktrace: string[];
  data: Record<string, unknown>;
  attempts_made: number;
  stalled_counter: number;
  retry_class: "transient" | "permanent" | "infrastructure";
  parent_job_id: number | null;
  was_mandatory: boolean;
  brain_id?: string;
  created_at: string;
  /** When the job was originally submitted. */
  original_created_at: string;
}

export interface DeadLetterStats {
  total: number;
  by_reason: Record<DeadLetterReason, number>;
  by_queue: Record<string, number>;
  by_retry_class: Record<string, number>;
  mandatory_count: number;
  recent: DeadLetterEntry[];
}

// ── Store ──────────────────────────────────────────────────────────────

/**
 * In-memory DLQ store. In production this would be backed by a
 * `subsumio_dead_letter_jobs` table.
 */
const dlq: DeadLetterEntry[] = [];

/**
 * Reset the DLQ — for testing only.
 */
export function _resetDLQ(): void {
  dlq.length = 0;
}

// ── Public API ─────────────────────────────────────────────────────────

export interface EnqueueDeadLetterOpts {
  original_job_id: number;
  job_name: string;
  queue: string;
  reason: DeadLetterReason;
  error_text: string;
  stacktrace?: string[];
  data?: Record<string, unknown>;
  attempts_made: number;
  stalled_counter: number;
  retry_class: "transient" | "permanent" | "infrastructure";
  parent_job_id?: number | null;
  was_mandatory?: boolean;
  brain_id?: string;
  original_created_at: string;
}

/**
 * Enqueue a dead job into the DLQ. Returns the created entry.
 */
export function enqueueDeadLetter(opts: EnqueueDeadLetterOpts): DeadLetterEntry {
  const entry: DeadLetterEntry = {
    id: randomUUID(),
    original_job_id: opts.original_job_id,
    job_name: opts.job_name,
    queue: opts.queue,
    reason: opts.reason,
    error_text: opts.error_text,
    stacktrace: opts.stacktrace ?? [],
    data: opts.data ?? {},
    attempts_made: opts.attempts_made,
    stalled_counter: opts.stalled_counter,
    retry_class: opts.retry_class,
    parent_job_id: opts.parent_job_id ?? null,
    was_mandatory: opts.was_mandatory ?? false,
    brain_id: opts.brain_id,
    created_at: new Date().toISOString(),
    original_created_at: opts.original_created_at,
  };
  dlq.push(entry);
  return entry;
}

/**
 * List dead letter entries with optional filters.
 */
export function listDeadLetters(opts?: {
  queue?: string;
  reason?: DeadLetterReason;
  limit?: number;
}): DeadLetterEntry[] {
  let entries = [...dlq];
  if (opts?.queue) entries = entries.filter((e) => e.queue === opts.queue);
  if (opts?.reason) entries = entries.filter((e) => e.reason === opts.reason);
  const limit = opts?.limit ?? 50;
  return entries.slice(-limit).reverse();
}

/**
 * Get a dead letter entry by original job id.
 */
export function getDeadLetterByJobId(jobId: number): DeadLetterEntry | undefined {
  return dlq.find((e) => e.original_job_id === jobId);
}

/**
 * Get aggregated stats for the DLQ.
 */
export function getDeadLetterStats(): DeadLetterStats {
  const byReason = {} as Record<DeadLetterReason, number>;
  const byQueue: Record<string, number> = {};
  const byRetryClass: Record<string, number> = {};
  let mandatoryCount = 0;

  for (const entry of dlq) {
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
    byQueue[entry.queue] = (byQueue[entry.queue] ?? 0) + 1;
    byRetryClass[entry.retry_class] = (byRetryClass[entry.retry_class] ?? 0) + 1;
    if (entry.was_mandatory) mandatoryCount++;
  }

  return {
    total: dlq.length,
    by_reason: byReason,
    by_queue: byQueue,
    by_retry_class: byRetryClass,
    mandatory_count: mandatoryCount,
    recent: [...dlq].slice(-20).reverse(),
  };
}

/**
 * Remove a dead letter entry (after reprocessing or cleanup).
 */
export function removeDeadLetter(id: string): boolean {
  const idx = dlq.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  dlq.splice(idx, 1);
  return true;
}

/**
 * Get the total count of dead letter entries.
 */
export function getDLQSize(): number {
  return dlq.length;
}
