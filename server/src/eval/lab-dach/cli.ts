/**
 * LAB-DACH v3 — CLI Entry Point
 *
 * Runs the full LAB-DACH benchmark offline and writes:
 *   - report.md
 *   - report.json
 *   - receipts/<task-id>.json
 *
 * Usage:
 *   bun run server/src/eval/lab-dach/cli.ts --mock
 *   bun run server/src/eval/lab-dach/cli.ts --mock --task lab-dach-de-001
 *   bun run server/src/eval/lab-dach/cli.ts --mock --corpus /path/to/law-corpus --output /tmp/my-run
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runE2E } from "./e2e-harness.ts";
import { ALL_SAMPLE_TASKS } from "./sample-tasks.ts";
import { generateFullReport, writeReport, writeJSONReport } from "./report.ts";
import { writeReceipt } from "./receipt.ts";

function parseArgs(argv: string[]): {
  mockMode: boolean;
  taskId?: string;
  corpusRoot?: string;
  outputDir?: string;
  modelId?: string;
  provider?: string;
} {
  const args = argv;
  const mockMode = args.includes("--mock");
  const taskId = getArgValue(args, "--task");
  const corpusRoot = getArgValue(args, "--corpus");
  const outputDir = getArgValue(args, "--output");
  const modelId = getArgValue(args, "--model");
  const provider = getArgValue(args, "--provider");
  return { mockMode, taskId, corpusRoot, outputDir, modelId, provider };
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function printHelp(): void {
  console.log(`LAB-DACH v3 CLI

Options:
  --mock           Run with mock LLM (offline, no network)
  --task <id>      Run a single task by ID (default: all sample tasks)
  --corpus <path>  Path to law-corpus (default: /Users/msc/subsumio-web/law-corpus)
  --output <path>  Output directory for report and receipts
  --model <id>     Model ID override (default: deepseek/deepseek-v4-flash)
  --provider <p>   Provider override (default: openrouter)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const { mockMode, taskId, corpusRoot, outputDir, modelId, provider } = parseArgs(args);

  let tasks = ALL_SAMPLE_TASKS;
  if (taskId) {
    tasks = ALL_SAMPLE_TASKS.filter((t) => t.id === taskId);
    if (tasks.length === 0) {
      console.error(`Unknown task: ${taskId}`);
      console.error(`Known tasks: ${ALL_SAMPLE_TASKS.map((t) => t.id).join(", ")}`);
      process.exit(1);
    }
  }

  const defaultCorpus = "/Users/msc/subsumio-web/law-corpus";
  const resolvedCorpus = corpusRoot ?? defaultCorpus;

  console.log(`LAB-DACH v3 CLI`);
  console.log(`  Mode: ${mockMode ? "mock (offline)" : "live"}`);
  console.log(`  Tasks: ${tasks.map((t) => t.id).join(", ")}`);
  console.log(`  Corpus: ${resolvedCorpus}`);

  const runResult = await runE2E({
    tasks,
    mockMode,
    corpusRoot: resolvedCorpus,
    modelId,
    provider,
  });

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

  if (modelId || provider)
    console.log(`  Model: ${modelId ?? "default"} / Provider: ${provider ?? "default"}`);

  // Also print the summary report to stdout
  console.log("\n" + generateFullReport(runResult).split("\n").slice(0, 40).join("\n"));
  console.log("\n... (full report written to disk)");
}

main().catch((err) => {
  console.error("CLI failed:", err);
  process.exit(1);
});
