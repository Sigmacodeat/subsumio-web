/**
 * `deep-analysis` Minion job handler — the async arm of Deep Analysis.
 *
 * Submitted (with allowProtectedSubmit) by the trusted web-api route
 * POST /api/legal/deep-analysis/start after matter-scope validation. The run
 * state lives on a `deep_analysis_run` brain page (core/legal/deep-analysis-run.ts);
 * this handler fills it:
 *
 *   1. Load the run state (missing/corrupt → UnrecoverableError: a retry
 *      cannot help).
 *   2. Honour a cancel that arrived before the model call: status cancelled,
 *      nothing spent.
 *   3. Run the analysis (one chat call over all documents, quote-grounded)
 *      with the submitter's own source/matter scope, under a provider rate
 *      lease like every other chat job.
 *   4. Persist report, phase and terminal status. A cancel that arrives while
 *      the model is answering is recorded as `cancel_too_late`: the answer was
 *      paid for, so it is kept rather than thrown away.
 *
 * Failure posture: any error is persisted on the run (status failed, message)
 * and rethrown, so the queue counts the attempt and the polling browser sees
 * the reason instead of a run stuck at "running".
 */

import type { MinionJobContext } from "../types.ts";
import { UnrecoverableError } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import { acquireLease, releaseLease } from "../rate-leases.ts";
import { resolveLeaseCap } from "./subagent.ts";
import { deepAnalysis } from "../../legal/deep-analysis.ts";
import {
  patchDeepAnalysisRun,
  readDeepAnalysisRun,
  type DeepAnalysisRunState,
} from "../../legal/deep-analysis-run.ts";

const RATE_LEASE_KEY = "anthropic:messages";
const LEASE_TTL_MS = 600_000;
const LEASE_POLL_ATTEMPTS = 60;
const MAX_ERROR_LEN = 300;

export interface DeepAnalysisJobData {
  /** Run-state page slug: deep_analysis/<id>. Required. */
  run_slug?: string;
  _source_id?: string;
}

function short(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, MAX_ERROR_LEN);
}

export function makeDeepAnalysisHandler(opts: { engine: BrainEngine }) {
  const engine = opts.engine;

  return async function deepAnalysisHandler(
    ctx: MinionJobContext
  ): Promise<Record<string, unknown>> {
    const data = (ctx.data ?? {}) as DeepAnalysisJobData;
    if (!data.run_slug || typeof data.run_slug !== "string") {
      throw new UnrecoverableError("deep-analysis: data.run_slug is required (string)");
    }
    const runSlug = data.run_slug;
    const sourceId =
      typeof data._source_id === "string" && data._source_id ? data._source_id : "default";

    const state = await readDeepAnalysisRun(engine, runSlug, sourceId);
    if (!state) {
      throw new UnrecoverableError(`deep-analysis: run state not found (${runSlug})`);
    }
    if (state.status === "done" || state.status === "cancelled") {
      return { run_slug: runSlug, status: state.status, skipped: true };
    }

    // Cancelled before any spend.
    if (state.cancel_requested) {
      await patchDeepAnalysisRun(engine, runSlug, sourceId, (s) => {
        s.status = "cancelled";
        s.phase = "finished";
        s.finished_at = new Date().toISOString();
      });
      return { run_slug: runSlug, status: "cancelled", spent: false };
    }

    await patchDeepAnalysisRun(engine, runSlug, sourceId, (s) => {
      s.status = "running";
      s.phase = "loading";
      s.started_at = new Date().toISOString();
      s.job_id = String(ctx.id);
    });
    await ctx.updateProgress({ phase: "loading", documents: state.docs.length });

    // One provider lease for the single long chat call, like every other
    // chat job (cross-worker guard against provider rate limits).
    const maxConcurrentProvider = resolveLeaseCap(process.env.GBRAIN_ANTHROPIC_MAX_INFLIGHT);
    let leaseId: number | null = null;
    for (let attempt = 0; attempt < LEASE_POLL_ATTEMPTS && leaseId === null; attempt++) {
      if (ctx.signal.aborted) throw new Error("job_aborted");
      const res = await acquireLease(engine, RATE_LEASE_KEY, ctx.id, maxConcurrentProvider, {
        ttlMs: LEASE_TTL_MS,
      });
      if (res.acquired && res.leaseId != null) leaseId = res.leaseId;
      else await new Promise((r) => setTimeout(r, 1000));
    }
    if (leaseId === null) {
      throw new Error(`rate lease "${RATE_LEASE_KEY}" unavailable after ${LEASE_POLL_ATTEMPTS}s`);
    }
    let report: Awaited<ReturnType<typeof deepAnalysis>>;
    try {
      await patchDeepAnalysisRun(engine, runSlug, sourceId, (s) => {
        s.phase = "analysing";
      });
      await ctx.updateProgress({ phase: "analysing", documents: state.docs.length });
      report = await deepAnalysis(engine, {
        slugs: state.docs.map((d) => d.slug),
        sourceId,
        ...(state.prompt ? { prompt: state.prompt } : {}),
        jurisdiction: state.jurisdiction,
      });
    } catch (e) {
      await patchDeepAnalysisRun(engine, runSlug, sourceId, (s) => {
        s.status = "failed";
        s.phase = "finished";
        s.error = short(e);
        s.finished_at = new Date().toISOString();
      }).catch(() => {});
      throw e;
    } finally {
      await releaseLease(engine, leaseId).catch(() => {});
    }

    const finished = await patchDeepAnalysisRun(engine, runSlug, sourceId, (s) => {
      // The model has already answered: keep the result even if a cancel came
      // in meanwhile, and say that the cancel was too late.
      if (s.cancel_requested) s.cancel_too_late = true;
      s.report = report;
      s.status = "done";
      s.phase = "finished";
      s.error = null;
      s.finished_at = new Date().toISOString();
    });
    await ctx.updateProgress({ phase: "finished", documents: state.docs.length });

    return {
      run_slug: runSlug,
      status: "done",
      document_count: report.document_count,
      findings: report.findings.length,
      cancel_too_late: (finished as DeepAnalysisRunState | null)?.cancel_too_late === true,
    };
  };
}
