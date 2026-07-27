#!/usr/bin/env bun
/**
 * run-rag-optimizer.ts — CLI harness for one-click RAG optimization.
 *
 * Usage:
 *   bun run scripts/run-rag-optimizer.ts --baseline
 *   bun run scripts/run-rag-optimizer.ts --sweep <baselineId> [--config default]
 *   bun run scripts/run-rag-optimizer.ts --apply <runId>
 *   bun run scripts/run-rag-optimizer.ts --rollback <runId>
 *   bun run scripts/run-rag-optimizer.ts --history
 *   bun run scripts/run-rag-optimizer.ts --auto
 */

import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway, reconfigureGatewayWithEngine } from "../src/core/ai/gateway.ts";
import {
  runBaseline,
  runSweep,
  getDefaultSweepConfig,
  recommendRun,
  applyRun,
  rollbackToRun,
  getHistory,
  getRun,
  loadActiveParams,
} from "../src/core/legal/rag-optimizer.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "../test/fixtures/at-legal-retrieval.jsonl");

function usage() {
  console.log(
    `Usage: bun run scripts/run-rag-optimizer.ts [command] [options]\n` +
      `  --baseline              Run baseline benchmark\n` +
      `  --sweep <baselineId>    Run parameter sweep against a baseline\n` +
      `  --config <name>         Sweep config name (default: default)\n` +
      `  --apply <runId>         Apply a completed run\n` +
      `  --rollback <runId>      Rollback to a completed run\n` +
      `  --history               List recent optimization runs\n` +
      `  --auto                  Baseline + default sweep + apply if Hit@5 improves\n`
  );
}

async function connectEngine() {
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";
  const cfg = loadConfig();
  if (!cfg) {
    throw new Error("No gbrain config found. Set ~/.gbrain/config.json or DATABASE_URL.");
  }
  const databaseUrl = process.env.DATABASE_URL ?? cfg.database_url;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL not set in env or config.");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {
    // non-fatal
  }
  configureGateway(buildGatewayConfig(cfg));
  return { pool, engine };
}

async function main() {
  const args = process.argv.slice(2);
  let command: string | null = null;
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      usage();
      process.exit(0);
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      if (
        !command &&
        (key === "baseline" ||
          key === "sweep" ||
          key === "apply" ||
          key === "rollback" ||
          key === "history" ||
          key === "auto")
      ) {
        command = key;
      }
    }
  }

  if (!command) {
    usage();
    process.exit(1);
  }

  const { pool, engine } = await connectEngine();
  try {
    if (command === "baseline") {
      const params = {
        hnswEfSearch: 64,
        llmRerankEnabled: true,
        llmRerankTopNIn: 50,
        fixturePath: FIXTURE,
        topK: 8,
      };
      const run = await runBaseline(engine, pool, params, {
        onProgress: (idx, total) => console.error(`[optimizer] baseline ${idx}/${total}`),
      });
      console.log(
        JSON.stringify(
          { id: run.id, params: run.params, aggregate: run.results?.aggregate },
          null,
          2
        )
      );
    } else if (command === "sweep") {
      const baselineId = Number(flags.sweep);
      if (!Number.isFinite(baselineId)) {
        console.error("--sweep requires a numeric baseline ID");
        process.exit(1);
      }
      const configName = flags.config ?? "default";
      const configs = await getDefaultSweepConfig(pool);
      // For named configs, a generic helper isn't provided; use default for now.
      const sweepConfig = configs?.param_grid;
      if (!sweepConfig) {
        console.error("No sweep grid found");
        process.exit(1);
      }
      const runs = await runSweep(engine, pool, {
        baselineId,
        grid: sweepConfig as Record<string, unknown[]>,
        baseParams: { fixturePath: FIXTURE, topK: 8 },
        onProgress: (done, total, current) =>
          console.error(`[optimizer] sweep ${done}/${total} — run ${current.id}`),
      });
      const baseline = await getRun(pool, baselineId);
      const best = recommendRun(runs, baseline);
      console.log(
        JSON.stringify(
          {
            runs: runs.map((r) => ({
              id: r.id,
              params: r.params,
              aggregate: r.results?.aggregate,
            })),
            best: best
              ? { id: best.id, params: best.params, aggregate: best.results?.aggregate }
              : null,
          },
          null,
          2
        )
      );
    } else if (command === "apply") {
      const runId = Number(flags.apply);
      const run = await applyRun(engine, pool, runId);
      console.log(JSON.stringify({ applied: run.id, params: run.params }, null, 2));
    } else if (command === "rollback") {
      const runId = Number(flags.rollback);
      const run = await rollbackToRun(engine, pool, runId);
      console.log(JSON.stringify({ rolled_back_to: run.id, params: run.params }, null, 2));
    } else if (command === "history") {
      const runs = await getHistory(pool, { limit: 20 });
      console.log(JSON.stringify(runs, null, 2));
    } else if (command === "auto") {
      const active = await loadActiveParams(engine);
      const baselineParams = active ?? {
        hnswEfSearch: 64,
        llmRerankEnabled: false,
        fixturePath: FIXTURE,
        topK: 8,
      };
      const baseline = await runBaseline(engine, pool, baselineParams, {
        onProgress: (idx, total) => console.error(`[optimizer] baseline ${idx}/${total}`),
      });
      const sweepGrid = (await getDefaultSweepConfig(pool))?.param_grid as
        | Record<string, unknown[]>
        | undefined;
      if (!sweepGrid) {
        console.log(
          JSON.stringify({ baseline, message: "No sweep config; skipping optimization." })
        );
        return;
      }
      const runs = await runSweep(engine, pool, {
        baselineId: baseline.id,
        grid: sweepGrid,
        baseParams: { fixturePath: FIXTURE, topK: 8 },
        onProgress: (done, total, current) =>
          console.error(`[optimizer] auto-sweep ${done}/${total} — run ${current.id}`),
      });
      const best = recommendRun(runs, baseline);
      const baselineHit5 = baseline.results?.aggregate.hit_at_5 ?? 0;
      const bestHit5 = best?.results?.aggregate.hit_at_5 ?? 0;
      if (best && bestHit5 > baselineHit5 + 0.05) {
        await applyRun(engine, pool, best.id);
        console.log(
          JSON.stringify(
            { applied: best.id, baseline_hit_at_5: baselineHit5, new_hit_at_5: bestHit5 },
            null,
            2
          )
        );
      } else {
        console.log(
          JSON.stringify(
            {
              message: "No statistically meaningful improvement; no change applied.",
              baseline_hit_at_5: baselineHit5,
              best_hit_at_5: bestHit5,
            },
            null,
            2
          )
        );
      }
    }
  } finally {
    await engine.disconnect?.();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[rag-optimizer] Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
