/**
 * LAB-DACH v3 — CLI Entry Point
 *
 * Runs the full LAB-DACH benchmark and writes:
 *   - report.md
 *   - report.json
 *   - receipts/<task-id>.json
 *
 * Subcommands:
 *   (default)     Run the full E2E benchmark
 *   review        Run the human review queue flow (cross-judge → human verdict → goldtask)
 *
 * Usage:
 *   bun run server/src/eval/lab-dach/cli.ts --mock
 *   bun run server/src/eval/lab-dach/cli.ts --mock --task lab-dach-de-001
 *   bun run server/src/eval/lab-dach/cli.ts --mock --corpus /path/to/law-corpus --output /tmp/my-run
 *   bun run server/src/eval/lab-dach/cli.ts --gold-tasks at-litigation --split dev --max-cost-usd 5
 *   bun run server/src/eval/lab-dach/cli.ts review --mock --reviewer "Dr. Schmidt"
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runE2E } from "./e2e-harness.ts";
import { ALL_SAMPLE_TASKS } from "./sample-tasks.ts";
import { generateFullReport, writeReport, writeJSONReport } from "./report.ts";
import { writeReceipt } from "./receipt.ts";
import { runReviewFlow } from "./review-cli.ts";
import { createGatewayChatFn, BudgetExceededError } from "./gateway-adapter.ts";
import { configureGateway } from "../../core/ai/gateway.ts";
import type { AIGatewayConfig } from "../../core/ai/types.ts";
import { GOLD_AT_LITIGATION } from "./gold-tasks-at-litigation.ts";
import { GOLD_DE_LITIGATION } from "./gold-tasks-de-litigation.ts";
import { GOLD_DE_CRIMINAL } from "./gold-tasks-de-criminal.ts";
import { ALL_GOLD_CH } from "./gold-tasks-ch.ts";
import type { Task, SplitType } from "./types.ts";

function parseArgs(argv: string[]): {
  mockMode: boolean;
  taskId?: string;
  corpusRoot?: string;
  outputDir?: string;
  modelId?: string;
  provider?: string;
  maxCostUsd?: number;
  judgeModelId?: string;
  judgeProvider?: string;
  split?: SplitType;
  goldTasks?: string;
  holdoutPath?: string;
  retrieval?: "live" | "file";
} {
  const args = argv;
  const mockMode = args.includes("--mock");
  const taskId = getArgValue(args, "--task");
  const corpusRoot = getArgValue(args, "--corpus");
  const outputDir = getArgValue(args, "--output");
  const modelId = getArgValue(args, "--model");
  const provider = getArgValue(args, "--provider");
  const maxCostUsdStr = getArgValue(args, "--max-cost-usd");
  const maxCostUsd = maxCostUsdStr ? parseFloat(maxCostUsdStr) : undefined;
  const judgeModelId = getArgValue(args, "--judge-model");
  const judgeProvider = getArgValue(args, "--judge-provider");
  const splitStr = getArgValue(args, "--split");
  const split = (splitStr === "dev" || splitStr === "test" || splitStr === "holdout") ? splitStr : undefined;
  const goldTasks = getArgValue(args, "--gold-tasks");
  const holdoutPath = getArgValue(args, "--holdout-path");
  const retrievalStr = getArgValue(args, "--retrieval");
  const retrieval = retrievalStr === "live" || retrievalStr === "file" ? retrievalStr : undefined;
  return { mockMode, taskId, corpusRoot, outputDir, modelId, provider, maxCostUsd, judgeModelId, judgeProvider, split, goldTasks, holdoutPath, retrieval };
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function printHelp(): void {
  console.log(`LAB-DACH v3 CLI

Subcommands:
  (default)        Run the full E2E benchmark
  review           Run the human review queue flow

Options (default):
  --mock              Run with mock LLM (offline, no network)
  --task <id>         Run a single task by ID
  --gold-tasks <set>  Use gold task set: at-litigation, de-litigation, de-criminal, ch-all, all
  --split <s>         Filter tasks by split: dev, test, holdout (default: all)
  --corpus <path>     Path to law-corpus (default: /Users/msc/subsumio-web/law-corpus)
  --output <path>     Output directory for report and receipts
  --model <id>        Model ID override (default: deepseek/deepseek-v4-flash)
  --provider <p>      Provider override (default: openrouter)
  --max-cost-usd <n>  Max cumulative cost in USD — aborts if exceeded (live mode only)
  --judge-model <id>  Judge model ID (live mode only)
  --judge-provider <p> Judge provider (live mode only)
  --retrieval <mode>  Retrieval backend: live (real hybrid search engine) or file
                      (naive corpus grep). Default: live in non-mock, file in mock.

Options (review):
  --mock              Run with mock LLM (offline, no network)
  --reviewer <name>   Reviewer name (required for human verdicts)
  --split <s>         Target split for goldtasks: dev or test (default: dev)
  --output <path>     Output directory for review results
  --queue <path>      Path to existing queue file (skip cross-judge, resume review)
  --holdout-path <p>  Load holdout tasks from external file (verified against manifest)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  // Subcommand dispatch
  const subcommand = args[0] && !args[0].startsWith("--") ? args[0] : undefined;

  if (subcommand === "review") {
    const reviewArgs = args.slice(1);
    await runReviewFlow(reviewArgs);
    return;
  }

  const { mockMode, taskId, corpusRoot, outputDir, modelId, provider, maxCostUsd, judgeModelId, judgeProvider, split, goldTasks, holdoutPath, retrieval } = parseArgs(args);

  // Determine task set
  let tasks: Task[];
  if (taskId) {
    tasks = ALL_SAMPLE_TASKS.filter((t) => t.id === taskId);
    if (tasks.length === 0) {
      // Try gold tasks
      const allGold = [...GOLD_DE_LITIGATION, ...GOLD_DE_CRIMINAL, ...GOLD_AT_LITIGATION, ...ALL_GOLD_CH];
      tasks = allGold.filter((t) => t.id === taskId);
      if (tasks.length === 0) {
        console.error(`Unknown task: ${taskId}`);
        console.error(`Known sample tasks: ${ALL_SAMPLE_TASKS.map((t) => t.id).join(", ")}`);
        console.error(`Known gold tasks: ${allGold.map((t) => t.id).join(", ")}`);
        process.exit(1);
      }
    }
  } else if (goldTasks) {
    const goldSets: Record<string, Task[]> = {
      "at-litigation": GOLD_AT_LITIGATION,
      "de-litigation": GOLD_DE_LITIGATION,
      "de-criminal": GOLD_DE_CRIMINAL,
      "ch-all": ALL_GOLD_CH,
      "all": [...GOLD_DE_LITIGATION, ...GOLD_DE_CRIMINAL, ...GOLD_AT_LITIGATION, ...ALL_GOLD_CH],
    };
    tasks = goldSets[goldTasks] ?? ALL_SAMPLE_TASKS;
    if (tasks === ALL_SAMPLE_TASKS && goldTasks !== "sample") {
      console.error(`Unknown gold task set: ${goldTasks}`);
      console.error(`Available: ${Object.keys(goldSets).join(", ")}, sample`);
      process.exit(1);
    }
  } else {
    tasks = ALL_SAMPLE_TASKS;
  }

  // Filter by split if specified
  if (split) {
    tasks = tasks.filter((t) => t.split === split);
    if (tasks.length === 0) {
      console.error(`No tasks found with split: ${split}`);
      process.exit(1);
    }
  }

  // Guard: holdout split is forbidden in live mode (sealed set)
  if (!mockMode && split === "holdout") {
    console.error("⛔ Holdout split is forbidden in live mode. Use --split dev or --split test.");
    process.exit(1);
  }

  const defaultCorpus = "/Users/msc/subsumio-web/law-corpus";
  const resolvedCorpus = corpusRoot ?? defaultCorpus;

  console.log(`LAB-DACH v3 CLI`);
  console.log(`  Mode: ${mockMode ? "mock (offline)" : "LIVE ⚠️"}`);
  console.log(`  Tasks: ${tasks.map((t) => t.id).join(", ")}`);
  console.log(`  Corpus: ${resolvedCorpus}`);
  if (split) console.log(`  Split: ${split}`);
  if (maxCostUsd !== undefined) console.log(`  Max cost: $${maxCostUsd.toFixed(2)}`);

  // Resolve retrieval backend. Default: live (real engine) in non-mock, file in mock.
  const retrievalMode = retrieval ?? (mockMode ? "file" : "live");
  console.log(`  Retrieval: ${retrievalMode === "live" ? "live engine (hybrid search)" : "file fallback (naive grep)"}`);

  // For live mode: configure gateway and create adapter
  let chatFn: ((opts: import("./rubric-judge.ts").ChatOpts) => Promise<import("./rubric-judge.ts").ChatResult>) | undefined;
  let adapterStats: import("./gateway-adapter.ts").GatewayAdapterStats | undefined;
  if (!mockMode) {
    const gatewayConfig: AIGatewayConfig = {
      chat_model: modelId ?? "openrouter:deepseek/deepseek-chat",
      embedding_model: "openrouter:openai/text-embedding-3-small",
      embedding_dimensions: 1536,
      env: { ...process.env } as Record<string, string | undefined>,
    };
    configureGateway(gatewayConfig);

    const adapter = createGatewayChatFn({
      modelId: modelId ?? "openrouter:deepseek/deepseek-chat",
      maxCostUsd,
    });
    chatFn = adapter.chatFn;
    adapterStats = adapter.stats;
  }

  // Build the real retrieval searchFn when requested (connects to the configured
  // production engine). The naive file fallback was the live-001 0/7 root cause.
  let searchFn: import("./agent-tools.ts").ToolContext["searchFn"];
  let disconnectEngine: (() => Promise<void>) | undefined;
  if (retrievalMode === "live") {
    const { createLiveEngineSearch } = await import("./retrieval-adapter.ts");
    const handle = await createLiveEngineSearch({ llmRerank: true });
    searchFn = handle.searchFn;
    disconnectEngine = handle.disconnect;
  }

  let runResult;
  try {
    runResult = await runE2E({
      tasks,
      mockMode,
      corpusRoot: resolvedCorpus,
      modelId,
      provider,
      chatFn,
      searchFn,
      maxCostUsd,
      judgeModelId,
      judgeProvider,
      holdoutPath,
    });
  } finally {
    if (disconnectEngine) await disconnectEngine();
  }

  const resolvedOutputDir = outputDir ?? `/tmp/lab-dach-runs/${runResult.run_id}`;
  mkdirSync(resolvedOutputDir, { recursive: true });

  // Write report and JSON summary
  writeReport(runResult, join(resolvedOutputDir, "report.md"));
  writeJSONReport(runResult, join(resolvedOutputDir, "report.json"));

  // Write per-task receipts
  const receiptsDir = join(resolvedOutputDir, "receipts");
  mkdirSync(receiptsDir, { recursive: true });
  for (const receipt of runResult.run_receipts) {
    const filePath = join(receiptsDir, `${receipt.task_id}.json`);
    writeReceipt(receipt, filePath);
  }

  console.log(`\n✓ Run ${runResult.run_id} complete`);
  console.log(`  Output: ${resolvedOutputDir}`);
  console.log(`  Report: ${join(resolvedOutputDir, "report.md")}`);
  console.log(`  JSON: ${join(resolvedOutputDir, "report.json")}`);
  console.log(`  Receipts: ${receiptsDir}`);
  console.log(`  All-pass rate: ${(runResult.aggregate_score.all_pass_rate * 100).toFixed(1)}%`);
  console.log(`  Mode: ${runResult.mode}`);
  if (runResult.total_cost_usd !== undefined && runResult.total_cost_usd > 0) {
    console.log(`  Total cost: $${runResult.total_cost_usd.toFixed(4)}`);
  }
  if (runResult.total_tokens) {
    console.log(`  Total tokens: ${runResult.total_tokens.input.toLocaleString()} in / ${runResult.total_tokens.output.toLocaleString()} out`);
  }
  if (runResult.provider_errors && runResult.provider_errors.length > 0) {
    console.log(`  Provider errors: ${runResult.provider_errors.length}`);
  }

  if (modelId || provider)
    console.log(`  Model: ${modelId ?? "default"} / Provider: ${provider ?? "default"}`);

  // Also print the summary report to stdout
  console.log("\n" + generateFullReport(runResult).split("\n").slice(0, 40).join("\n"));
  console.log("\n... (full report written to disk)");
}

main().catch((err) => {
  if (err instanceof BudgetExceededError) {
    console.error(`\n⛔ ${err.message}`);
    process.exit(2);
  }
  console.error("CLI failed:", err);
  process.exit(1);
});
