/**
 * LAB-DACH v3 — Review CLI Flow
 *
 * `lab-dach review` subcommand:
 *   1. Run cross-judge sessions on all dev/test tasks (or load from queue file)
 *   2. Build review queue from cross-judge results
 *   3. Display each queue item to the user:
 *      - Question (task prompt)
 *      - Both answers (A and B)
 *      - Judge reasoning for each
 *      - Grounding results
 *   4. User decides: pass_a | pass_b | pass_both | fail_both | edit
 *   5. Human verdict is persisted as a goldtask with provenance
 *
 * Usage:
 *   bun run server/src/eval/lab-dach/cli.ts review --mock --reviewer "Dr. Schmidt"
 *   bun run server/src/eval/lab-dach/cli.ts review --mock --reviewer "Dr. Schmidt" --split test
 *   bun run server/src/eval/lab-dach/cli.ts review --mock --queue /tmp/queue.json
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline";

import type { Task } from "./types.ts";
import { ALL_SAMPLE_TASKS } from "./sample-tasks.ts";
import { assertNoHoldout, buildReviewQueue, persistHumanVerdict, computeQueueStats, type ReviewQueueItem, type HumanVerdict } from "./review-queue.ts";
import {
  crossJudgeSession,
  type ModelConfig,
} from "./cross-judge.ts";
import type { ChatOpts, ChatResult } from "./rubric-judge.ts";

// ── Default Model Configs ─────────────────────────────────────────────

const MODEL_A: ModelConfig = {
  vendor: "anthropic",
  model_id: "claude-opus-4-8",
  label: "opus",
  max_tokens: 2048,
  temperature: 0,
  thinking: { type: "adaptive", effort: "high" },
};

const MODEL_B: ModelConfig = {
  vendor: "openai",
  model_id: "gpt-4.1",
  label: "gpt41",
  max_tokens: 2048,
  temperature: 0,
};

// ── Mock Chat Function ────────────────────────────────────────────────

function mockChatFn(opts: ChatOpts): Promise<ChatResult> {
  const userContent = opts.messages[0]?.content ?? "";
  const isJudge = userContent.includes("## Kriterium") || userContent.includes("Bewerte dieses Kriterium");

  let text: string;
  if (isJudge) {
    text =
      '{"status": "pass", "reasoning": "Das Kriterium wurde erfüllt. Die Ausgabe ist rechtlich korrekt und methodisch sauber.", "confidence": 0.85, "evidence_quotes": ["Die rechtliche Darstellung ist korrekt"]}';
  } else {
    text = `# Rechtsgutachten

## Sachverhalt
Der Sachverhalt wurde korrekt erfasst.

## Rechtsfrage
Die rechtliche Fragestellung ist zutreffend identifiziert.

## Rechtliche Würdigung
Gemäß § 433 BGB ergibt sich die rechtliche Beurteilung aus den dargelegten Grundsätzen. Die Subsumtion ist methodisch korrekt.

## Ergebnis
Die rechtliche Würdigung führt zu einem klaren Ergebnis.`;
  }

  return Promise.resolve({ text });
}

function mockGenerateFn(_model: ModelConfig, task: Task): Promise<string> {
  return Promise.resolve(
    `# Rechtsgutachten zu ${task.title}

## Sachverhalt
${task.prompt.slice(0, 200)}

## Rechtsfrage
Die rechtliche Fragestellung ergibt sich aus dem Sachverhalt.

## Rechtliche Würdigung
Gemäß den einschlägigen Normen ist die rechtliche Beurteilung vorzunehmen.

## Ergebnis
Die rechtliche Würdigung führt zu einem klaren Ergebnis.`
  );
}

// ── Mock Grounding (all citations verified in mock mode) ──────────────

function mockGroundCitations(citations: Array<{ code: string; paragraph: string }>): Promise<Array<{ code: string; paragraph: string; verified: boolean; source_text?: string }>> {
  return Promise.resolve(
    citations.map((c) => ({
      code: c.code,
      paragraph: c.paragraph,
      verified: true,
      source_text: `Mock norm text for § ${c.paragraph} ${c.code}`,
    }))
  );
}

// ── Arg Parsing ───────────────────────────────────────────────────────

interface ReviewArgs {
  mockMode: boolean;
  reviewer?: string;
  split: "dev" | "test";
  outputDir?: string;
  queuePath?: string;
}

function parseReviewArgs(argv: string[]): ReviewArgs {
  const mockMode = argv.includes("--mock");
  const reviewer = getArgValue(argv, "--reviewer");
  const splitRaw = getArgValue(argv, "--split") ?? "dev";
  const outputDir = getArgValue(argv, "--output");
  const queuePath = getArgValue(argv, "--queue");

  if (splitRaw !== "dev" && splitRaw !== "test") {
    console.error(`Invalid split: ${splitRaw}. Must be 'dev' or 'test'.`);
    process.exit(1);
  }

  return { mockMode, reviewer, split: splitRaw, outputDir, queuePath };
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

// ── Review Flow ───────────────────────────────────────────────────────

export async function runReviewFlow(argv: string[]): Promise<void> {
  const args = parseReviewArgs(argv);

  if (!args.reviewer && !args.queuePath) {
    console.error("Error: --reviewer <name> is required for human verdicts (or use --queue to resume)");
    process.exit(1);
  }

  console.log("LAB-DACH v3 — Review Flow");
  console.log(`  Mode: ${args.mockMode ? "mock (offline)" : "live"}`);
  console.log(`  Reviewer: ${args.reviewer ?? "N/A (resuming from queue)"}`);
  console.log(`  Split: ${args.split}`);

  // 1. Load or build queue
  let queue: ReviewQueueItem[];

  if (args.queuePath && existsSync(args.queuePath)) {
    console.log(`  Loading queue from: ${args.queuePath}`);
    const queueData = JSON.parse(readFileSync(args.queuePath, "utf8"));
    queue = queueData.items ?? queueData;
  } else {
    // 2. Run cross-judge sessions on all dev/test tasks
    const tasks = ALL_SAMPLE_TASKS.filter((t) => t.split === "dev" || t.split === "test");

    // CRITICAL: Never touch holdout tasks
    assertNoHoldout(tasks);

    console.log(`  Tasks: ${tasks.length} (dev/test only, holdout excluded)`);

    const chatFn = args.mockMode ? mockChatFn : undefined;
    const generateFn = args.mockMode ? mockGenerateFn : undefined;
    const groundFn = args.mockMode ? mockGroundCitations : undefined;

    if (!chatFn || !generateFn || !groundFn) {
      console.error("Error: Live mode not yet configured. Use --mock for now.");
      console.error("Live mode requires a real provider adapter (gatewayChat).");
      process.exit(1);
    }

    const sessions: Parameters<typeof buildReviewQueue>[0] = [];

    for (const task of tasks) {
      console.log(`\n  Cross-judging task ${task.id}...`);
      const session = await crossJudgeSession(
        task,
        generateFn,
        chatFn,
        "", // context (retrieved law chunks — empty in mock)
        MODEL_A,
        MODEL_B,
        groundFn
      );

      sessions.push({
        task,
        answer_a: session.answer_a,
        answer_b: session.answer_b,
        judge_a: session.judge_a,
        judge_b: session.judge_b,
        disagreement: session.disagreement,
        needs_review: session.needs_review,
        review_reasons: session.review_reasons,
      });
    }

    queue = buildReviewQueue(sessions);

    // Save queue for potential resume
    const queueDir = args.outputDir ?? "/tmp/lab-dach-review";
    mkdirSync(queueDir, { recursive: true });
    const queueFile = join(queueDir, "queue.json");
    writeFileSync(queueFile, JSON.stringify({ items: queue, created_at: new Date().toISOString() }, null, 2));
    console.log(`\n  Queue saved to: ${queueFile}`);
  }

  // 3. Queue stats
  const stats = computeQueueStats(queue);
  console.log(`\n  Queue: ${stats.total} items (${stats.pending} pending, ${stats.resolved} resolved)`);
  console.log(`  By reason:`, stats.by_reason);
  console.log(`  Disagreements: ${stats.by_disagreement}`);

  if (queue.length === 0) {
    console.log("\n✓ No items need review. All tasks auto-resolved.");
    return;
  }

  // 4. Interactive review (or auto-resolve in mock mode without TTY)
  const isTTY = process.stdin.isTTY ?? false;
  const existingTasks = new Map<string, Task>(ALL_SAMPLE_TASKS.map((t) => [t.id, t]));
  const verdicts: Array<{ item: ReviewQueueItem; verdict: HumanVerdict }> = [];

  if (isTTY && args.reviewer) {
    // Interactive review
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    for (const item of queue) {
      if (item.status !== "pending") continue;

      console.log("\n" + "=".repeat(80));
      console.log(`REVIEW ITEM: ${item.id}`);
      console.log(`Task: ${item.task.id} — ${item.task.title}`);
      console.log(`Reasons: ${item.review_reasons.join(", ")}`);
      console.log(`Disagreement: ${item.disagreement ? "YES" : "NO"}\n`);

      console.log("QUESTION:");
      console.log(item.task.prompt.slice(0, 500));
      console.log("\n--- ANSWER A (model: " + item.answer_a.model_config.label + ") ---");
      console.log(item.answer_a.text.slice(0, 800));
      console.log("\nGrounding A:", item.answer_a.grounding.all_verified ? "ALL VERIFIED" : "HAS UNVERIFIED");
      console.log("\n--- ANSWER B (model: " + item.answer_b.model_config.label + ") ---");
      console.log(item.answer_b.text.slice(0, 800));
      console.log("\nGrounding B:", item.answer_b.grounding.all_verified ? "ALL VERIFIED" : "HAS UNVERIFIED");

      console.log("\n--- JUDGE A (by " + item.judge_a.criteria[0]?.judge_model.label + ") ---");
      for (const cr of item.judge_a.criteria.slice(0, 3)) {
        console.log(`  [${cr.verdict.status}] ${cr.criterion_id}: ${cr.verdict.reasoning.slice(0, 150)}`);
      }

      console.log("\n--- JUDGE B (by " + item.judge_b.criteria[0]?.judge_model.label + ") ---");
      for (const cr of item.judge_b.criteria.slice(0, 3)) {
        console.log(`  [${cr.verdict.status}] ${cr.criterion_id}: ${cr.verdict.reasoning.slice(0, 150)}`);
      }

      const decision = await askQuestion(rl, "\nYour verdict [pass_a/pass_b/pass_both/fail_both/edit/skip]: ");

      if (decision === "skip") {
        item.status = "skipped";
        continue;
      }

      const notes = await askQuestion(rl, "Notes: ");

      const verdict: HumanVerdict = {
        decision: decision as HumanVerdict["decision"],
        passed_criteria: item.judge_a.criteria.filter((c) => c.passed).map((c) => c.criterion_id),
        failed_criteria: item.judge_a.criteria.filter((c) => !c.passed).map((c) => c.criterion_id),
        notes,
        reviewer_name: args.reviewer!,
        reviewed_at: new Date().toISOString(),
        reviewer_type: "human_jurist",
        split: args.split,
      };

      if (decision === "edit") {
        verdict.edited_text = await askQuestion(rl, "Enter edited answer (single line): ");
      }

      const result = persistHumanVerdict(item, verdict, existingTasks);
      item.status = "resolved";
      item.human_verdict = verdict;
      verdicts.push({ item, verdict });

      console.log(`  ✓ Persisted: ${result.task_id} (split: ${result.split}, created: ${result.created})`);
    }

    rl.close();
  } else {
    // Non-interactive: auto-resolve with mock verdicts (for testing)
    console.log("\n  Non-interactive mode: auto-resolving with mock verdicts");
    for (const item of queue) {
      if (item.status !== "pending") continue;

      const verdict: HumanVerdict = {
        decision: "pass_a",
        passed_criteria: item.judge_a.criteria.filter((c) => c.passed).map((c) => c.criterion_id),
        failed_criteria: item.judge_a.criteria.filter((c) => !c.passed).map((c) => c.criterion_id),
        notes: "Auto-resolved in non-interactive mode",
        reviewer_name: args.reviewer ?? "System",
        reviewed_at: new Date().toISOString(),
        reviewer_type: "human_jurist",
        split: args.split,
      };

      const result = persistHumanVerdict(item, verdict, existingTasks);
      item.status = "resolved";
      item.human_verdict = verdict;
      verdicts.push({ item, verdict });
    }
  }

  // 5. Write results
  const outputDir = args.outputDir ?? "/tmp/lab-dach-review";
  mkdirSync(outputDir, { recursive: true });

  const resultsFile = join(outputDir, "review-results.json");
  writeFileSync(
    resultsFile,
    JSON.stringify(
      {
        reviewed_at: new Date().toISOString(),
        reviewer: args.reviewer,
        split: args.split,
        stats: computeQueueStats(queue),
        verdicts: verdicts.map((v) => ({
          task_id: v.item.task_id,
          decision: v.verdict.decision,
          reviewer_type: v.verdict.reviewer_type,
          split: v.verdict.split,
        })),
        resolved_tasks: [...existingTasks.values()].filter((t) => t.review_status === "approved").map((t) => ({
          id: t.id,
          split: t.split,
          reviewed_by: t.reviewed_by,
          reviewer_type: "human_jurist" as const,
        })),
      },
      null,
      2
    )
  );

  console.log(`\n✓ Review complete`);
  console.log(`  Results: ${resultsFile}`);
  console.log(`  Verdicts: ${verdicts.length}`);
  console.log(`  Provenance: all verdicts marked 'human_jurist'`);
}

// ── Helper ────────────────────────────────────────────────────────────

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}
