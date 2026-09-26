/**
 * The contradiction probe is bound to one firm source: retrieval, the pairs
 * judged and the stored run never span two firms; find_contradictions reads
 * the latest run of the caller's own source; the HTTP route binds the run to
 * the calling firm and caps it by the firm's daily probe budget.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import express from "express";
import type { Server } from "node:http";
import { setEnvForFile } from "./helpers/with-env.ts";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { mountWebApi } from "../src/commands/web-api.ts";
import { operations, type OperationContext } from "../src/core/operations.ts";
import { runContradictionProbe } from "../src/core/eval-contradictions/runner.ts";
import {
  parseContradictionProbeBody,
  probeDailyBudgetUsd,
} from "../src/core/eval-contradictions/probe-request.ts";
import type { SearchResult } from "../src/core/types.ts";

const SECRET = "test-shared-secret-key-for-subsumio";
let engine: PGLiteEngine;
let server: Server;
let base = "";
let releaseEnv: (() => void) | undefined;

function hit(slug: string, source: string, id: number): SearchResult {
  return {
    slug,
    page_id: id,
    title: slug,
    type: "note",
    chunk_text: `Die Kündigungsfrist beträgt ${id} Monate.`,
    chunk_source: "compiled_truth",
    chunk_id: id,
    chunk_index: 0,
    score: 1,
    stale: false,
    source_id: source,
  } as SearchResult;
}

function run(sourceId: string | undefined, id: string, cost: number, slugs: [string, string]) {
  return engine.writeContradictionsRun({
    run_id: id,
    judge_model: "test",
    prompt_version: "1",
    queries_evaluated: 1,
    queries_with_contradiction: 1,
    total_contradictions_flagged: 1,
    wilson_ci_lower: 0,
    wilson_ci_upper: 1,
    judge_errors_total: 0,
    cost_usd_total: cost,
    duration_ms: 1,
    source_tier_breakdown: {},
    report_json: {
      per_query: [
        {
          contradictions: [
            {
              kind: "cross_slug_chunks",
              severity: "high",
              axis: "Frist",
              confidence: 0.9,
              a: { slug: slugs[0], chunk_id: 1, take_id: null },
              b: { slug: slugs[1], chunk_id: 2, take_id: null },
              resolution_kind: "manual",
              resolution_command: "",
            },
          ],
        },
      ],
    },
    ...(sourceId ? { source_id: sourceId } : {}),
  });
}

beforeAll(async () => {
  releaseEnv = setEnvForFile({ SUBSUMIO_WEB_API_KEY: SECRET });
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  for (const src of ["firm-a", "firm-b"]) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [src]
    );
    for (const slug of ["docs/x", "docs/y"]) {
      await engine.putPage(
        slug,
        { type: "note", title: slug, compiled_truth: "Frist", frontmatter: {} },
        { sourceId: src }
      );
    }
  }
  const app = express();
  mountWebApi(app, engine, { apiKey: SECRET });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}, 60_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await engine?.disconnect();
  releaseEnv?.();
}, 60_000);

describe("runner bound to a source", () => {
  test("hits of other sources never form a pair", async () => {
    const judged: Array<[string, string]> = [];
    const out = await runContradictionProbe({
      engine,
      queries: ["Kündigungsfrist"],
      sourceId: "firm-a",
      budgetUsd: 5,
      yesOverride: true,
      noCache: true,
      searchFn: async () => [
        hit("docs/a1", "firm-a", 1),
        hit("docs/b1", "firm-b", 2),
        hit("docs/a2", "firm-a", 3),
      ],
      judgeFn: async (input) => {
        judged.push([input.a.slug, input.b.slug]);
        return {
          verdict: {
            verdict: "no_contradiction",
            severity: "low",
            axis: "",
            confidence: 0.5,
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        } as never;
      },
    });
    expect(judged).toEqual([["docs/a1", "docs/a2"]]);
    expect(out.report.per_query[0]!.result_count).toBe(2);
  });
});

describe("find_contradictions reads the caller's own runs", () => {
  test("the newer run of another firm does not replace one's own", async () => {
    expect(await run("firm-a", "2099-01-01T00-00-00.000Z", 0.1, ["docs/x", "docs/y"])).toBe(true);
    // Newer run of firm-b over the same slugs (they exist in both sources).
    expect(await run("firm-b", "2099-01-02T00-00-00.000Z", 0.1, ["docs/y", "docs/x"])).toBe(true);
    const op = operations.find((o) => o.name === "find_contradictions")!;
    const ctx = (sourceId: string, remote: boolean) =>
      ({
        engine,
        config: {},
        logger: console,
        dryRun: false,
        remote,
        sourceId,
      }) as unknown as OperationContext;
    const trend = await engine.loadContradictionsTrend(30, { sourceIds: ["firm-a"] });
    expect(trend.map((r) => r.source_id)).toEqual(["firm-a"]);
    const a = (await op.handler(ctx("firm-a", true), {})) as {
      contradictions: Array<{ a: { slug: string } }>;
      run_id?: string;
    };
    expect(a.run_id).toBe("2099-01-01T00-00-00.000Z");
    expect(a.contradictions.map((c) => c.a.slug)).toEqual(["docs/x"]);
    const b = (await op.handler(ctx("firm-b", true), {})) as { run_id?: string };
    expect(b.run_id).toBe("2099-01-02T00-00-00.000Z");
    // A source without any run sees nothing.
    const none = (await op.handler(ctx("firm-c", true), {})) as { contradictions: unknown[] };
    expect(none.contradictions).toEqual([]);
  });
});

describe("probe request binding and budget", () => {
  test("the source comes from the route, the budget is clamped to what is left", () => {
    const out = parseContradictionProbeBody(
      { recent_hours: 24, budget_usd: 0.5, source_id: "firm-b" },
      { sourceId: "firm-a", maxBudgetUsd: 0.2 }
    );
    expect("args" in out).toBe(true);
    if (!("args" in out)) return;
    expect(out.args).toContain("--source");
    expect(out.args[out.args.indexOf("--source") + 1]).toBe("firm-a");
    expect(out.args).not.toContain("firm-b");
    expect(out.args[out.args.indexOf("--budget-usd") + 1]).toBe("0.2");
    expect(out.args).toContain("--recent-hours");
    expect(
      parseContradictionProbeBody({ doc_type: "brief" }, { sourceId: "a", maxBudgetUsd: 0 })
    ).toEqual({ error: "probe_budget_exhausted" });
    expect(parseContradictionProbeBody({ recent_hours: 0 })).toEqual({
      error: "invalid_recent_hours",
    });
  });

  test("daily budget default and env override", () => {
    expect(probeDailyBudgetUsd({})).toBe(2);
    expect(probeDailyBudgetUsd({ CONTRADICTION_PROBE_DAILY_BUDGET_USD: "0.75" })).toBe(0.75);
    expect(probeDailyBudgetUsd({ CONTRADICTION_PROBE_DAILY_BUDGET_USD: "x" })).toBe(2);
  });

  test("a firm whose daily budget is used up gets 429, others still run", async () => {
    // Spend today: firm-spent used up its whole budget.
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ('firm-spent', 'firm-spent', '{}'::jsonb) ON CONFLICT (id) DO NOTHING`
    );
    expect(await run("firm-spent", `spent-${now}`, 5, ["docs/x", "docs/y"])).toBe(true);
    const probe = (source: string) =>
      fetch(`${base}/api/admin/contradiction-probe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-subsumio-api-key": SECRET,
          "x-subsumio-source": source,
        },
        body: JSON.stringify({ doc_type: "no_such_type" }),
      });
    expect((await probe("firm-spent")).status).toBe(429);
    // Budget left, but nothing to check in this source: the probe ran and
    // stopped early.
    expect((await probe("firm-a")).status).toBe(422);
  });
});
