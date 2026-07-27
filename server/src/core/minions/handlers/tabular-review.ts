/**
 * `tabular-review` Minion job handler — the async arm of Tabular Review.
 *
 * Submitted (with allowProtectedSubmit) by the trusted web-api routes
 * POST /api/legal/tabular-review/start and .../{slug}/retry. The run state
 * lives on a `tabular_review` brain page (see core/legal/tabular-review.ts);
 * this handler processes the run's pending rows:
 *
 *   1. Load the run state; target rows = status "pending" (optionally
 *      intersected with data.only_slugs for retries).
 *   2. Per document: read the page through the ACL/matter-scope/ethical-wall
 *      enforcing get_page op (same posture as the sync route), then ONE chat
 *      call over all questions with quote-grounded cells
 *      (reviewTabularDocumentQuotes).
 *   3. After EVERY document the row is persisted via patchTabularRun
 *      (transactional frontmatter update), so the polling GET route sees
 *      row-level progress live.
 *   4. Finish: terminal status (done | partial), finished_at, actual spend,
 *      and the markdown summary refresh.
 *
 * Failure posture:
 *   - Per-document errors are ISOLATED: the row becomes status=error with
 *     the message, the run continues. No single document aborts the run.
 *   - BudgetExhausted (BudgetTracker ceiling via withBudgetTracker) stops the
 *     worker pool; unprocessed target rows are marked "budget_exhausted" and
 *     the run ends partial.
 *   - Abort (timeout/cancel): remaining target rows become "job_aborted",
 *     run status failed, handler rethrows so the queue records the failure.
 *   - Unexpected job-level errors: run status failed is persisted
 *     best-effort, then rethrown so the queue retries per max_attempts (the
 *     handler is resumable — a retry re-processes only pending rows).
 *   - Missing/corrupt run page is UnrecoverableError (retrying is pointless).
 *
 * Rate limiting: every chat call holds an "anthropic:messages" rate lease
 * (cross-worker provider guard, same key the subagent handler uses); the
 * internal worker pool is capped at data.concurrency (default 4, max 8).
 */

import type { MinionJobContext } from "../types.ts";
import { UnrecoverableError } from "../types.ts";
import type { BrainEngine } from "../../engine.ts";
import { acquireLease, releaseLease } from "../rate-leases.ts";
import { resolveLeaseCap } from "./subagent.ts";
import { BudgetTracker, BudgetExhausted } from "../../budget/budget-tracker.ts";
import { withBudgetTracker } from "../../ai/gateway.ts";
import { defaultLegalLLM, type LegalLLM } from "../../legal/llm-util.ts";
import { invokeOp } from "../../../commands/web-api.ts";
import {
  patchTabularRun,
  readTabularRun,
  reviewTabularDocumentQuotes,
  terminalTabularRunStatus,
  type TabularRowState,
  type TabularRunState,
} from "../../legal/tabular-review.ts";

const RATE_LEASE_KEY = "anthropic:messages";
/** Lease TTL per chat call — one clipped-document chat call is bounded. */
const LEASE_TTL_MS = 300_000;
const LEASE_POLL_ATTEMPTS = 60;
const MAX_ROW_ERROR_LEN = 300;

export interface TabularReviewJobData {
  /** Run-state page slug: tabular_review/<id>. Required. */
  run_slug?: string;
  /** Retry subset: only these row slugs are processed (must be pending). */
  only_slugs?: string[];
  /** Internal worker-pool concurrency (clamped 1..8, default from run state). */
  concurrency?: number;
  /** Optional USD ceiling override; default = 2.5× the persisted estimate. */
  max_cost_usd?: number;
  /** Tenant stamp (matches the run page's source_id). */
  _source_id?: string;
  /** Request-context stamps from the submitting route — the job reads
   *  documents with the same ACL/matter posture as the caller. */
  matter_scope?: string[] | "all";
  acl_groups?: string[] | "all";
  user_id?: string;
}

function clampConcurrency(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) return Math.max(1, Math.min(fallback, 8));
  return Math.max(1, Math.min(n, 8));
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

export function makeTabularReviewHandler(opts: { engine: BrainEngine }) {
  const engine = opts.engine;

  return async function tabularReviewHandler(
    ctx: MinionJobContext
  ): Promise<Record<string, unknown>> {
    const data = (ctx.data ?? {}) as TabularReviewJobData;
    if (!data.run_slug || typeof data.run_slug !== "string") {
      throw new UnrecoverableError("tabular-review: data.run_slug is required (string)");
    }
    const runSlug = data.run_slug;
    const sourceId =
      typeof data._source_id === "string" && data._source_id ? data._source_id : "default";

    const state = await readTabularRun(engine, runSlug, sourceId);
    if (!state) {
      throw new UnrecoverableError(
        `tabular-review: run page not found or corrupt: ${runSlug} (source ${sourceId})`
      );
    }

    const onlySet =
      Array.isArray(data.only_slugs) && data.only_slugs.length > 0
        ? new Set(data.only_slugs.map((s) => String(s)))
        : null;
    const isTarget = (r: TabularRowState) =>
      r.status === "pending" && (!onlySet || onlySet.has(r.slug));
    const targets = state.rows.filter(isTarget);

    // Nothing to do (e.g. retry with no matching pending rows): recompute the
    // terminal status so a stale "queued/running" can't wedge the GET view.
    if (targets.length === 0) {
      const final = await patchTabularRun(
        engine,
        runSlug,
        sourceId,
        (s) => {
          s.status = terminalTabularRunStatus(s);
          if (!s.finished_at) s.finished_at = new Date().toISOString();
        },
        { refreshMarkdown: true }
      );
      return {
        run_slug: runSlug,
        status: final?.status ?? state.status,
        processed: 0,
        note: "nothing_to_do",
      };
    }

    const llm = await defaultLegalLLM();
    if (!llm) {
      // Terminal configuration problem — retrying the job won't help. Mark
      // the target rows error and finish partial instead of throwing.
      await patchTabularRun(
        engine,
        runSlug,
        sourceId,
        (s) => {
          for (const r of s.rows) {
            if (isTarget(r)) {
              r.status = "error";
              r.error = "llm_unavailable: no chat provider configured";
              r.cells = [];
            }
          }
          s.status = "partial";
          s.error = "llm_unavailable: no chat provider configured";
          s.finished_at = new Date().toISOString();
        },
        { refreshMarkdown: true }
      );
      return { run_slug: runSlug, status: "partial", processed: 0, error: "llm_unavailable" };
    }

    // Typed aliases for the nested closure below — TS control-flow narrowing
    // does not flow into hoisted nested function declarations.
    const runState: TabularRunState = state;
    const reviewLlm: LegalLLM = llm;

    try {
      return await runTargets();
    } catch (err) {
      // Unexpected job-level failure (DB outage, …): persist failed so the
      // GET view is honest, then rethrow — the queue retries per max_attempts
      // and a later attempt resumes the still-pending rows.
      try {
        await patchTabularRun(
          engine,
          runSlug,
          sourceId,
          (s) => {
            s.status = "failed";
            s.error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
            s.finished_at = new Date().toISOString();
          },
          { refreshMarkdown: true }
        );
      } catch {
        // state persistence must not mask the original error
      }
      throw err;
    }

    async function runTargets(): Promise<Record<string, unknown>> {
      const concurrency = clampConcurrency(data.concurrency, runState.concurrency || 4);
      const costCap =
        typeof data.max_cost_usd === "number" && data.max_cost_usd > 0
          ? data.max_cost_usd
          : Math.max(runState.estimate.approx_usd * 2.5, 0.5);
      const budget = new BudgetTracker({
        maxCostUsd: costCap,
        label: `tabular-review/${runSlug}`,
      });
      const maxConcurrentProvider = resolveLeaseCap(process.env.GBRAIN_ANTHROPIC_MAX_INFLIGHT);

      await patchTabularRun(engine, runSlug, sourceId, (s) => {
        s.status = "running";
        if (!s.started_at) s.started_at = new Date().toISOString();
        s.job_id = String(ctx.id);
        s.error = null;
      });

      const stats = { done: 0, failed: 0 };
      let budgetStopped = false;

      const acquireChatLease = async (): Promise<number> => {
        for (let attempt = 0; attempt < LEASE_POLL_ATTEMPTS; attempt++) {
          if (ctx.signal.aborted) throw new Error("job_aborted");
          const res = await acquireLease(engine, RATE_LEASE_KEY, ctx.id, maxConcurrentProvider, {
            ttlMs: LEASE_TTL_MS,
          });
          if (res.acquired && res.leaseId != null) return res.leaseId;
          await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error(`rate lease "${RATE_LEASE_KEY}" unavailable after ${LEASE_POLL_ATTEMPTS}s`);
      };

      const processRow = async (row: TabularRowState): Promise<void> => {
        try {
          // Read through the op layer so matter-scope, document ACL and the
          // ethical wall apply exactly as in the synchronous route.
          const pageRaw = await invokeOp(
            engine,
            "get_page",
            { slug: row.slug },
            sourceId,
            undefined,
            data.matter_scope,
            data.acl_groups,
            data.user_id
          );
          const page = pageRaw as Record<string, unknown>;
          const title = String(page.title ?? row.title);
          const text = String(page.compiled_truth ?? page.content ?? "");

          let result: Awaited<ReturnType<typeof reviewTabularDocumentQuotes>>;
          if (!text.trim()) {
            result = await reviewTabularDocumentQuotes(reviewLlm, {
              slug: row.slug,
              title,
              questions: runState.questions,
              text,
            });
          } else {
            const leaseId = await acquireChatLease();
            try {
              result = await reviewTabularDocumentQuotes(reviewLlm, {
                slug: row.slug,
                title,
                questions: runState.questions,
                text,
              });
            } finally {
              await releaseLease(engine, leaseId).catch(() => {});
            }
          }
          row.title = result.title;
          row.cells = result.cells;
          row.status = "done";
          row.error = null;
          stats.done++;
        } catch (e) {
          if (e instanceof BudgetExhausted) budgetStopped = true;
          row.status = "error";
          row.error = (e instanceof Error ? e.message : String(e)).slice(0, MAX_ROW_ERROR_LEN);
          row.cells = [];
          stats.failed++;
        }
        // Persist after EVERY document — the GET route polls row-level state.
        await patchTabularRun(engine, runSlug, sourceId, (s) => {
          const idx = s.rows.findIndex((r) => r.slug === row.slug);
          if (idx >= 0) s.rows[idx] = { ...row };
        });
        await ctx
          .updateProgress({
            step: stats.done + stats.failed,
            total: targets.length,
            message: `${row.slug} ${row.status}`,
          })
          .catch(() => {});
      };

      // Internal worker pool (default 4, max 8) — mirrors the sync route's
      // concurrency posture while the rate lease guards cross-job provider load.
      const queue = [...targets];
      await withBudgetTracker(budget, async () => {
        const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
          for (;;) {
            if (ctx.signal.aborted || budgetStopped) break;
            const row = queue.shift();
            if (!row) break;
            await processRow(row);
          }
        });
        await Promise.all(workers);
      });

      const now = new Date().toISOString();

      if (ctx.signal.aborted) {
        await patchTabularRun(
          engine,
          runSlug,
          sourceId,
          (s) => {
            for (const r of s.rows) {
              if (isTarget(r)) {
                r.status = "error";
                r.error = "job_aborted";
                r.cells = [];
              }
            }
            s.status = "failed";
            s.error = "job aborted (timeout or cancellation)";
            s.finished_at = now;
            s.cost_spent_usd = round4(budget.totalSpent);
          },
          { refreshMarkdown: true }
        );
        throw new Error("tabular-review: job aborted (timeout or cancellation)");
      }

      const final = await patchTabularRun(
        engine,
        runSlug,
        sourceId,
        (s) => {
          if (budgetStopped) {
            for (const r of s.rows) {
              if (isTarget(r)) {
                r.status = "error";
                r.error = "budget_exhausted";
                r.cells = [];
              }
            }
            s.error = `budget exhausted at $${budget.totalSpent.toFixed(4)} (cap $${costCap.toFixed(2)})`;
          }
          s.status = terminalTabularRunStatus(s);
          s.finished_at = now;
          s.cost_spent_usd = round4(budget.totalSpent);
        },
        { refreshMarkdown: true }
      );

      return {
        run_slug: runSlug,
        status: final?.status ?? "partial",
        processed: stats.done + stats.failed,
        done: stats.done,
        failed: stats.failed,
        cost_spent_usd: round4(budget.totalSpent),
      };
    }
  };
}
