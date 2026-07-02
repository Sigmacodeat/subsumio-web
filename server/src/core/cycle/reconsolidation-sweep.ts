/**
 * v0.45 — Reconsolidation sweep cycle phase.
 *
 * Finds facts with expired labile windows (labile_until < now()) and
 * clears the labile_until field, effectively "freezing" the memory again.
 * This is the cleanup phase for the reconsolidation mechanism — when a
 * fact's labile window opens (on retrieval) but no update is applied
 * within the window, the sweep closes it.
 *
 * Runs AFTER engram_maturation and BEFORE embed.
 */

import type { BrainEngine } from "../engine.ts";
import type { PhaseResult } from "../cycle.ts";

export async function runPhaseReconsolidationSweep(
  engine: BrainEngine,
  opts: { dryRun: boolean; signal?: AbortSignal }
): Promise<PhaseResult> {
  if (opts.dryRun) {
    return {
      phase: "reconsolidation_sweep" as never,
      status: "skipped",
      duration_ms: 0,
      summary: "dry-run: reconsolidation_sweep phase skipped",
      details: { dryRun: true, reason: "no_dry_run_support" },
    };
  }

  try {
    const { listSources } = await import("../sources-ops.ts");
    const sources = await listSources(engine);

    let totalSwept = 0;
    let totalStillLabile = 0;

    for (const source of sources) {
      if (opts.signal?.aborted) break;

      const expired = await engine.findExpiredLabileFacts(source.id, { limit: 500 });
      if (expired.length === 0) continue;

      // Clear labile_until for expired facts — they're frozen again.
      for (const fact of expired) {
        if (opts.signal?.aborted) break;
        // The labile window expired without any update being applied.
        // Clear it unconditionally — the memory is re-consolidated as-is.
        await engine.clearLabileWindow(fact.id);
        totalSwept++;
      }
    }

    return {
      phase: "reconsolidation_sweep" as never,
      status: "ok",
      duration_ms: 0,
      summary:
        totalSwept === 0
          ? "no expired labile windows found"
          : `${totalSwept} fact(s) re-consolidated (${totalStillLabile} still labile)`,
      details: {
        sources_walked: sources.length,
        facts_swept: totalSwept,
        facts_still_labile: totalStillLabile,
      },
    };
  } catch (e) {
    return {
      phase: "reconsolidation_sweep" as never,
      status: "fail",
      duration_ms: 0,
      summary: "reconsolidation_sweep phase failed",
      details: {},
      error: {
        class: (e as Error).constructor.name,
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
      },
    };
  }
}
