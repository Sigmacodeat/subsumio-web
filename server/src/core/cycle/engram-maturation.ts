/**
 * v0.45 — Engram Maturation cycle phase.
 *
 * Walks facts with activation_strength < 1.0 and updates their activation
 * based on the sigmoid maturation curve. Also handles one-time backfill
 * of pre-v119 facts (activation_strength = 0.0) that are older than 7 days.
 *
 * Runs AFTER consolidate (so newly-consolidated facts get matured) and
 * BEFORE embed (so activation changes are visible to retrieval).
 *
 * Always enabled — this is a core memory phase, not opt-in.
 */

import type { BrainEngine } from "../engine.ts";
import type { PhaseResult } from "../cycle.ts";
import { computeActivation, shouldBackfill } from "../engram-maturation.ts";

export async function runPhaseEngramMaturation(
  engine: BrainEngine,
  opts: { dryRun: boolean; signal?: AbortSignal }
): Promise<PhaseResult> {
  if (opts.dryRun) {
    return {
      phase: "engram_maturation",
      status: "skipped",
      duration_ms: 0,
      summary: "dry-run: engram_maturation phase skipped",
      details: { dryRun: true, reason: "no_dry_run_support" },
    };
  }

  try {
    const { listSources } = await import("../sources-ops.ts");
    const sources = await listSources(engine);

    let totalMatured = 0;
    let totalBackfilled = 0;
    let totalSilent = 0;
    let totalImplicit = 0;
    let totalExplicit = 0;

    for (const source of sources) {
      if (opts.signal?.aborted) break;

      // Step 1: Backfill pre-v119 facts that are older than 7 days.
      const backfilled = await engine.backfillFactActivation(source.id);
      totalBackfilled += backfilled;

      // Step 2: Update activation for remaining maturing facts.
      const maturing = await engine.findMaturingFacts(source.id, { limit: 1000 });
      if (maturing.length === 0) continue;

      const now = new Date();
      const updates: Array<{ id: number; activation_strength: number }> = [];

      for (const fact of maturing) {
        if (opts.signal?.aborted) break;

        // Skip facts that are already at 1.0 (shouldn't happen due to
        // the WHERE clause, but be defensive).
        if (fact.activation_strength >= 1.0) continue;

        // If the fact was backfilled (old + still 0.0), skip — the
        // backfill call above already handled it.
        if (fact.activation_strength === 0.0 && shouldBackfill(fact.created_at, now)) {
          continue;
        }

        const newActivation = computeActivation(fact.created_at, now);
        updates.push({ id: fact.id, activation_strength: newActivation });

        if (newActivation < 0.03) totalSilent++;
        else if (newActivation < 0.5) totalImplicit++;
        else totalExplicit++;
      }

      if (updates.length > 0) {
        const updated = await engine.batchUpdateFactActivation(updates);
        totalMatured += updated;
      }
    }

    const summary =
      totalBackfilled > 0
        ? `${totalMatured} fact(s) matured, ${totalBackfilled} backfilled (${totalSilent} silent, ${totalImplicit} implicit, ${totalExplicit} explicit)`
        : `${totalMatured} fact(s) matured (${totalSilent} silent, ${totalImplicit} implicit, ${totalExplicit} explicit)`;

    return {
      phase: "engram_maturation",
      status: "ok",
      duration_ms: 0,
      summary,
      details: {
        sources_walked: sources.length,
        facts_matured: totalMatured,
        facts_backfilled: totalBackfilled,
        silent: totalSilent,
        implicit: totalImplicit,
        explicit: totalExplicit,
      },
    };
  } catch (e) {
    return {
      phase: "engram_maturation",
      status: "fail",
      duration_ms: 0,
      summary: "engram_maturation phase failed",
      details: {},
      error: {
        class: (e as Error).constructor.name,
        code: "INTERNAL_ERROR",
        message: (e as Error).message,
      },
    };
  }
}
