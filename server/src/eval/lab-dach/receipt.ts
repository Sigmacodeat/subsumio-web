/**
 * LAB-DACH v3 — Receipt Module
 *
 * Builds and persists run receipts for full reproducibility.
 * Each receipt contains SHA-256 hashes of the prompt, the corpus files used,
 * and the final output so that a run can be re-run and verified offline.
 */

import { createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunReceipt, Task } from "./types.ts";
import type { WorkflowResult, ToolCallRecord } from "./workflows.ts";

const TOOL_VERSIONS = {
  sandbox: "1.0.0",
  guardrail: "2.0.0",
  workflows: "1.0.0",
  automated_checks: "2.0.0",
  rubric_judge: "1.0.0",
  agent_tools: "1.0.0",
};

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function computePromptHash(prompt: string, context: string): string {
  return sha256(prompt + "\n" + context.slice(0, 12000));
}

export function computeOutputHash(output: string): string {
  return sha256(output);
}

/**
 * Compute a hash of all corpus files that were used by the agent during the run.
 * Collects slugs from search_law and read_law tool calls, reads the files,
 * and returns a deterministic SHA-256 hash of their concatenated contents.
 */
export function computeCorpusHash(
  corpusRoot: string,
  toolCalls: ToolCallRecord[]
): string | undefined {
  const slugs = new Set<string>();

  for (const call of toolCalls) {
    if (call.tool === "search_law" && Array.isArray(call.result.data)) {
      for (const item of call.result.data as Array<{ slug?: string }>) {
        if (item.slug) slugs.add(item.slug);
      }
    } else if (call.tool === "read_law" && (call.result.data as { slug?: string })?.slug) {
      slugs.add((call.result.data as { slug: string }).slug);
    }
  }

  if (slugs.size === 0) return undefined;

  const contents: string[] = [];
  for (const slug of [...slugs].sort()) {
    const relativeSlug = slug.replace(/^law\//, "");
    const filePath = join(corpusRoot, relativeSlug + ".md");
    if (existsSync(filePath)) {
      contents.push(`${slug}:${sha256(readFileSync(filePath, "utf-8"))}`);
    }
  }

  return contents.length > 0 ? sha256(contents.join("\n")) : undefined;
}

/**
 * Build a RunReceipt for a single task workflow result.
 */
export function buildRunReceipt(
  workflowResult: WorkflowResult,
  task: Task,
  opts: {
    runId: string;
    corpusRoot: string;
    startedAt: string;
    completedAt?: string;
    model_id?: string;
    provider?: string;
    mode: "live" | "mock";
    provider_errors?: string[];
  }
): RunReceipt {
  const promptHash = computePromptHash(task.prompt, workflowResult.context.slice(0, 12000));
  const outputHash = computeOutputHash(workflowResult.output);
  const corpusHash = computeCorpusHash(opts.corpusRoot, workflowResult.tool_calls);

  // Compute p50/p95 from per-LLM-call latencies
  let latencyP50: number | undefined;
  let latencyP95: number | undefined;
  if (workflowResult.llm_latencies_ms && workflowResult.llm_latencies_ms.length > 0) {
    const sorted = [...workflowResult.llm_latencies_ms].sort((a, b) => a - b);
    latencyP50 = sorted[Math.floor(sorted.length * 0.5)];
    latencyP95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)];
  }

  return {
    run_id: `${opts.runId}-${workflowResult.task_id}`,
    task_id: workflowResult.task_id,
    model_id: opts.model_id ?? "openrouter:deepseek/deepseek-chat",
    provider: opts.provider ?? "openrouter",
    prompt_hash: promptHash,
    corpus_hash: corpusHash,
    output_hash: outputHash,
    tool_versions: { ...TOOL_VERSIONS },
    token_counts: {
      input: workflowResult.token_count.input,
      output: workflowResult.token_count.output,
    },
    latency_ms: workflowResult.latency_ms,
    cost_usd: workflowResult.cost_usd,
    started_at: opts.startedAt,
    completed_at: opts.completedAt ?? new Date().toISOString(),
    verification_state: workflowResult.verification_state as RunReceipt["verification_state"],
    warnings: workflowResult.guardrail_flags.map((f) => `${f.type}: ${f.detail}`),
    mode: opts.mode,
    provider_errors: opts.provider_errors,
    latency_p50_ms: latencyP50,
    latency_p95_ms: latencyP95,
  };
}

/**
 * Serialize a receipt to a JSON string.
 */
export function serializeReceipt(receipt: RunReceipt): string {
  return JSON.stringify(receipt, null, 2);
}

/**
 * Write a receipt to disk.
 */
export function writeReceipt(receipt: RunReceipt, filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, serializeReceipt(receipt), "utf-8");
}

/**
 * Read a receipt from disk.
 */
export function readReceipt(filePath: string): RunReceipt {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as RunReceipt;
}

/**
 * Verify that a receipt still matches the current local corpus and the given output.
 * Returns { ok, errors }.
 */
export function verifyReceipt(
  receipt: RunReceipt,
  opts: {
    corpusRoot: string;
    output?: string;
    toolCalls?: ToolCallRecord[];
  }
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (receipt.output_hash && opts.output !== undefined) {
    if (computeOutputHash(opts.output) !== receipt.output_hash) {
      errors.push("output_hash mismatch — the produced output differs from the receipt");
    }
  }

  if (receipt.corpus_hash && opts.toolCalls) {
    const currentCorpusHash = computeCorpusHash(opts.corpusRoot, opts.toolCalls);
    if (currentCorpusHash !== receipt.corpus_hash) {
      errors.push("corpus_hash mismatch — the referenced corpus files have changed");
    }
  }

  if (!receipt.output_hash && !receipt.corpus_hash) {
    errors.push("receipt contains no hashes to verify");
  }

  return { ok: errors.length === 0, errors };
}
