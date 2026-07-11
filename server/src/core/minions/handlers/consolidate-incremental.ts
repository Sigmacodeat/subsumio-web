/**
 * v0.46 — `consolidate-incremental` minion handler.
 *
 * Post-ingest Hindsight trigger: after `importFromContent` lands a page,
 * this handler runs `extract_facts` + `consolidate` for just the affected
 * entity slugs — without acquiring the cycle lock or scanning the entire
 * brain. This means newly ingested facts are promoted to takes within
 * seconds instead of waiting for the next dream cycle (typically overnight).
 *
 * Pipeline:
 *   1. runExtractFacts(slugs) — reconciles `## Facts` fences on the
 *      newly imported pages into the facts table.
 *   2. runPhaseConsolidate(affectedSlugs) — clusters unconsolidated facts
 *      for those entities and promotes them to takes. Age gate is 0
 *      (immediate) in incremental mode.
 *
 * Safety:
 *   - Semantic upsert (D-CDX-4) in consolidate.ts prevents duplicate
 *     takes if the full dream cycle runs concurrently.
 *   - `consolidateFact` is idempotent (checks `consolidated_at IS NULL`).
 *   - No cycle lock needed — the Minion queue provides job-level
 *     serialization, and the idempotency key prevents duplicate jobs
 *     for the same (source, slug) pair.
 *   - Fail-open: if this handler fails, the next dream cycle will
 *     consolidate everything in the full scan. Incremental is a
 *     latency optimization, not a correctness requirement.
 */

import type { BrainEngine } from "../../engine.ts";
import type { MinionJobContext } from "../types.ts";

export interface ConsolidateIncrementalJobData {
  /** Entity slugs to consolidate (e.g. the slug of the ingested page). */
  affectedSlugs: string[];
  /** Source ID for multi-source brains. Default 'default'. */
  sourceId?: string;
  /** Optional brain dir for filesystem-dependent extract_facts. */
  brainDir?: string;
  /** Audit string from the submitter (e.g. 'ingest_capture', 'post_upload'). */
  reason?: string;
}

export interface ConsolidateIncrementalResult {
  status: "success" | "no_work" | "aborted";
  affectedSlugs: string[];
  factsExtracted: number;
  factsConsolidated: number;
  takesWritten: number;
}

function parseParams(data: Record<string, unknown>): ConsolidateIncrementalJobData {
  const affectedSlugs = data.affectedSlugs;
  if (!Array.isArray(affectedSlugs) || affectedSlugs.length === 0) {
    throw new Error(
      "consolidate-incremental: data.affectedSlugs is required and must be a non-empty array"
    );
  }
  const sourceId = typeof data.sourceId === "string" ? data.sourceId : undefined;
  const brainDir = typeof data.brainDir === "string" ? data.brainDir : undefined;
  const reason = typeof data.reason === "string" ? data.reason : undefined;
  return { affectedSlugs, sourceId, brainDir, reason };
}

export function makeConsolidateIncrementalHandler(engine: BrainEngine) {
  return async function consolidateIncrementalHandler(
    job: MinionJobContext
  ): Promise<ConsolidateIncrementalResult> {
    const { affectedSlugs, sourceId, brainDir, reason } = parseParams(job.data);
    const effectiveSourceId = sourceId ?? "default";

    // Phase 1: extract_facts for the affected slugs only.
    // Reconciles `## Facts` fences on the newly imported pages into the
    // facts table. This is the same function the dream cycle calls, but
    // scoped to just our slugs — no brain-wide walk.
    let factsExtracted = 0;
    try {
      const { runExtractFacts } = await import("../../cycle/extract-facts.ts");
      const xfResult = await runExtractFacts(engine, {
        slugs: affectedSlugs,
        sourceId: effectiveSourceId,
        brainDir,
        signal: job.signal,
      });
      factsExtracted = xfResult.factsInserted;
    } catch (err) {
      // Fail-open: if extract_facts fails, still try to consolidate
      // existing facts for these entities. The error is logged but
      // non-fatal — the dream cycle will reconcile fences later.
      console.error(
        `[consolidate-incremental] extract_facts failed for ${affectedSlugs.join(", ")}: ` +
          (err instanceof Error ? err.message : String(err))
      );
    }

    // Phase 2: consolidate facts → takes for the affected entities only.
    // Age gate defaults to 0 in incremental mode (immediate promotion).
    let factsConsolidated = 0;
    let takesWritten = 0;
    try {
      const { runPhaseConsolidate } = await import("../../cycle/phases/consolidate.ts");
      const result = await runPhaseConsolidate(engine, {
        affectedSlugs,
        signal: job.signal,
      });
      if (result.status === "ok" && result.details) {
        factsConsolidated =
          (result.details as { facts_consolidated?: number }).facts_consolidated ?? 0;
        takesWritten = (result.details as { takes_written?: number }).takes_written ?? 0;
      }
    } catch (err) {
      // Fail-open: if consolidate fails, the next dream cycle will
      // pick up these facts in the full scan. Non-fatal.
      console.error(
        `[consolidate-incremental] consolidate failed for ${affectedSlugs.join(", ")}: ` +
          (err instanceof Error ? err.message : String(err))
      );
    }

    const status =
      factsConsolidated > 0 || factsExtracted > 0
        ? "success"
        : job.signal.aborted
          ? "aborted"
          : "no_work";

    if (reason) {
      console.log(
        `[consolidate-incremental] ${reason}: ${status} — ` +
          `${factsExtracted} facts extracted, ${factsConsolidated} consolidated into ${takesWritten} takes ` +
          `for slugs: ${affectedSlugs.join(", ")}`
      );
    }

    return {
      status,
      affectedSlugs,
      factsExtracted,
      factsConsolidated,
      takesWritten,
    };
  };
}
