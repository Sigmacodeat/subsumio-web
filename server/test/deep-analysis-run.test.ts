/**
 * Deep Analysis (async arm): run-state parsing and the job handler's
 * cancel / failure / result posture.
 */

import { describe, it, expect } from "bun:test";
import {
  newDeepAnalysisRunState,
  parseDeepAnalysisRunState,
  deepAnalysisRunSummary,
  deepAnalysisRunMarkdown,
  type DeepAnalysisRunState,
} from "../src/core/legal/deep-analysis-run.ts";

function state(overrides: Partial<DeepAnalysisRunState> = {}): DeepAnalysisRunState {
  return {
    ...newDeepAnalysisRunState({
      run_slug: "deep_analysis/20260920-abc123",
      title: "Tiefenanalyse",
      docs: [{ slug: "legal/documents/a", title: "Vertrag A" }],
      jurisdiction: "at",
      case_slug: "legal/cases/2026-001",
      source_id: "kanzlei-1",
      created_by_user_id: "u1",
      matter_scope: ["legal/cases/2026-001"],
    }),
    ...overrides,
  };
}

describe("deep analysis run state", () => {
  it("starts queued with no report and no cancel", () => {
    const s = state();
    expect(s.status).toBe("queued");
    expect(s.phase).toBe("queued");
    expect(s.report).toBeNull();
    expect(s.cancel_requested).toBe(false);
    expect(s.source_id).toBe("kanzlei-1");
  });

  it("round-trips through frontmatter", () => {
    const s = state({ status: "running", phase: "analysing", job_id: "42" });
    const parsed = parseDeepAnalysisRunState(JSON.parse(JSON.stringify(s)));
    expect(parsed).not.toBeNull();
    expect(parsed!.status).toBe("running");
    expect(parsed!.phase).toBe("analysing");
    expect(parsed!.docs).toEqual(s.docs);
    expect(parsed!.matter_scope).toEqual(["legal/cases/2026-001"]);
  });

  it("falls back to safe values on a corrupt blob instead of throwing", () => {
    expect(parseDeepAnalysisRunState(null)).toBeNull();
    expect(parseDeepAnalysisRunState({ docs: "nope" })).toBeNull();
    const odd = parseDeepAnalysisRunState({ docs: [{ slug: "a" }], status: "weird", phase: "x" });
    expect(odd!.status).toBe("queued");
    expect(odd!.phase).toBe("queued");
    expect(odd!.docs).toEqual([{ slug: "a", title: "a" }]);
  });

  it("never exposes the tenant or ACL stamps to the browser", () => {
    const summary = deepAnalysisRunSummary(state()) as Record<string, unknown>;
    expect(summary.source_id).toBeUndefined();
    expect(summary.matter_scope).toBeUndefined();
    expect(summary.created_by_user_id).toBeUndefined();
    expect(summary.phase_label).toBe("In der Warteschlange");
    expect(summary.run_slug).toBe("deep_analysis/20260920-abc123");
  });

  it("summarises the run as markdown, including the failure reason", () => {
    const md = deepAnalysisRunMarkdown(state({ status: "failed", error: "LLM down" }));
    expect(md).toContain("Status: failed");
    expect(md).toContain("Fehler: LLM down");
  });
});

// ── Handler posture ──────────────────────────────────────────
// A fake engine with just the three calls the run helpers make, so the
// cancel path can be tested without a database or a model.

import { makeDeepAnalysisHandler } from "../src/core/minions/handlers/deep-analysis.ts";
import type { BrainEngine } from "../src/core/engine.ts";
import type { MinionJobContext } from "../src/core/minions/types.ts";

function fakeEngine(initial: DeepAnalysisRunState) {
  const store = new Map<string, Record<string, unknown>>([
    [initial.run_slug, { ...(initial as unknown as Record<string, unknown>) }],
  ]);
  const engine = {
    async getPage(slug: string) {
      const fm = store.get(slug);
      return fm ? { slug, type: "deep_analysis_run", frontmatter: fm } : null;
    },
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const tx = {
        async executeRaw(sql: string, params: unknown[]) {
          if (/^SELECT/i.test(sql.trim())) {
            const fm = store.get(String(params[1]));
            return fm ? [{ frontmatter: fm }] : [];
          }
          store.set(String(params[3]), params[0] as Record<string, unknown>);
          return [];
        },
      };
      return fn(tx);
    },
  } as unknown as BrainEngine;
  return { engine, store };
}

function jobCtx(data: Record<string, unknown>): MinionJobContext {
  return {
    id: 7,
    data,
    signal: new AbortController().signal,
    updateProgress: async () => {},
  } as unknown as MinionJobContext;
}

describe("deep-analysis handler", () => {
  it("ends a run that was cancelled before the model started, without spending", async () => {
    const { engine, store } = fakeEngine(state({ cancel_requested: true }));
    const handler = makeDeepAnalysisHandler({ engine });
    const result = await handler(
      jobCtx({ run_slug: "deep_analysis/20260920-abc123", _source_id: "kanzlei-1" })
    );
    expect(result.status).toBe("cancelled");
    expect(result.spent).toBe(false);
    const after = store.get("deep_analysis/20260920-abc123")!;
    expect(after.status).toBe("cancelled");
    expect(after.report).toBeNull();
  });

  it("does not redo a finished run", async () => {
    const { engine } = fakeEngine(state({ status: "done" }));
    const handler = makeDeepAnalysisHandler({ engine });
    const result = await handler(
      jobCtx({ run_slug: "deep_analysis/20260920-abc123", _source_id: "kanzlei-1" })
    );
    expect(result.skipped).toBe(true);
  });

  it("refuses a job without a run, and one whose run is gone", async () => {
    const { engine } = fakeEngine(state());
    const handler = makeDeepAnalysisHandler({ engine });
    await expect(handler(jobCtx({}))).rejects.toThrow(/run_slug/);
    await expect(
      handler(jobCtx({ run_slug: "deep_analysis/missing", _source_id: "kanzlei-1" }))
    ).rejects.toThrow(/not found/);
  });
});
