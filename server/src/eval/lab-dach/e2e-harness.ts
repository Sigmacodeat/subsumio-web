/**
 * LAB-DACH v3 — E2E Test Harness
 *
 * Runs the full benchmark pipeline:
 *   1. Validate all tasks
 *   2. Create sandbox per task
 *   3. Run workflow (search → generate → guardrail → evaluate)
 *   4. Collect rubric results + run receipts
 *   5. Compute aggregate score
 *   6. Generate report
 *
 * Usage:
 *   bun run server/src/eval/lab-dach/e2e-harness.ts
 *
 * For mock mode (no LLM API calls):
 *   bun run server/src/eval/lab-dach/e2e-harness.ts --mock
 */

import { validateTask, type Task, type RubricResult, type RunReceipt } from "./types.ts";
import { ALL_SAMPLE_TASKS } from "./sample-tasks.ts";
import { createSandbox, cleanupSandbox, writeInputDocument, type TaskSandbox } from "./sandbox.ts";
import { runWorkflow, type WorkflowResult, computePromptHash } from "./workflows.ts";
import {
  getCrossFamilyJudgeConfig,
  type JudgeConfig,
  type ChatOpts,
  type ChatResult,
} from "./rubric-judge.ts";
import { computeAggregateScore, generateReport, type AggregateScore } from "./scoring.ts";
import { createHash } from "node:crypto";

// ── Mock Chat Function ────────────────────────────────────────────────

/**
 * Mock chat function for testing without LLM API calls.
 * Returns a pre-written German legal memo.
 */
function mockChatFn(opts: ChatOpts): Promise<ChatResult> {
  const userContent = opts.messages[0]?.content ?? "";

  // Detect what kind of output is expected
  const isMemo = userContent.includes("Kurzmemorandum") || userContent.includes("Rechtsfrage");
  const isFristen = userContent.includes("Fristen") || userContent.includes("Gerichtsakt");
  const isSchriftsatz =
    userContent.includes("Schriftsatz") || userContent.includes("Klagebeantwortung");

  let text: string;

  if (isMemo) {
    text = `# Kurzmemorandum

## 1. Sachverhalt
Käufer K erwarb von Verkäufer V einen gebrauchten Pkw für 8.000 €. Zwei Wochen nach Übergabe stellte K einen Bremsendefekt fest. Reparaturkosten: 600 €.

## 2. Rechtsfrage
Welche Gewährleistungsansprüche hat K gegen V aus dem Kaufvertrag?

## 3. Rechtliche Würdigung
Es liegt ein Sachmangel gem. § 434 BGB vor, da die Bremsen defekt sind und das Fahrzeug nicht der vereinbarten Beschaffenheit entspricht. Die Gewährleistungsansprüche richten sich nach § 437 BGB.

Gem. § 437 Nr. 1 BGB kann K zunächst Nacherfüllung verlangen (Nachbesserung oder Nachlieferung).

Gem. § 437 Nr. 2 BGB kann K nach erfolgloser Nacherfüllung zurücktreten oder den Kaufpreis mindern.

Gem. § 437 Nr. 3 BGB kann K Schadensersatz verlangen, wenn V den Mangel zu vertreten hat.

Die Verjährungsfrist beträgt gem. § 438 Abs. 1 Nr. 3 BGB bei Gebrauchtwagen 2 Jahre ab Ablieferung.

## 4. Ergebnis
K hat gegen V Gewährleistungsansprüche aus § 437 BGB. Er sollte zunächst Nacherfüllung verlangen. Die Reparaturkosten von 600 € können als Schadensersatz geltend gemacht werden, falls V den Mangel zu vertreten hat.`;
  } else if (isFristen) {
    text = `# Fristen- und Risikenbericht

## 1. Fristen
Berufungsfrist gem. § 514 ZPO: 4 Wochen ab Zustellung.
Zustellungsdatum: 15.07.2026
Fristende: 12.08.2026

Die Berufung muss spätestens am 12.08.2026 beim Landesgericht Linz eingebracht werden.

## 2. Verfahrensrisiken
- Kostenrisiko: Bei Unterliegenhen trägt M die Kosten des Berufungsverfahrens
- Streitwert: € 5.000 — Gerichtsgebühr steigt
- Erfolgsaussichten: Abhängig von den Berufungsgründen

## 3. Empfehlungen
- Berufung rechtzeitig einbringen
- Berufungsbegründung sorgfältig vorbereiten
- Beweise für die Berufungsgründe sichern`;
  } else if (isSchriftsatz) {
    text = `Klagebeantwortung

Rubrum:
Beklagter: B
Kläger: K

Anträge:
1. Die Klage wird abgewiesen.
2. K trägt die Kosten des Verfahrens.

Begründung:
Der Kläger behauptet, der Beklagte habe ihn beim Fußballspielen vorsätzlich am Bein verletzt. Dies wird bestritten.

Es liegt kein vorsätzliche Körperverletzung gem. § 823 Abs. 1 BGB vor. Beim Fußballspielen ist mit Körperkontakt zu rechnen. Ein Mitverschulden gem. § 254 BGB ist zu berücksichtigen, da K sich freiwillig dem Sportrisiko ausgesetzt hat.

Der Zeuge Z kann nicht bestätigen, dass der Beklagte vorsätzlich gehandelt hat.

Beweisangebot:
Zeuge: Z (Mitspieler) — zum Hergang des Zweikampfs`;
  } else {
    // Judge response
    text =
      '{"passed": true, "reasoning": "Das Kriterium wurde erfüllt. Die rechtliche Darstellung ist korrekt.", "confidence": 0.85}';
  }

  return Promise.resolve({ text });
}

// ── E2E Run ───────────────────────────────────────────────────────────

export interface E2ERunResult {
  run_id: string;
  started_at: string;
  completed_at: string;
  tasks: Task[];
  workflow_results: WorkflowResult[];
  rubric_results: RubricResult[];
  run_receipts: RunReceipt[];
  aggregate_score: AggregateScore;
  report: string;
}

export async function runE2E(opts: {
  tasks?: Task[];
  mockMode?: boolean;
  corpusRoot?: string;
}): Promise<E2ERunResult> {
  const tasks = opts.tasks ?? ALL_SAMPLE_TASKS;
  const runId = `e2e-${Date.now()}`;
  const startedAt = new Date().toISOString();

  // 1. Validate all tasks
  for (const task of tasks) {
    const errors = validateTask(task);
    if (errors.length > 0) {
      console.error(`Task ${task.id} validation errors:`, errors);
      throw new Error(`Task ${task.id} is invalid: ${errors.map((e) => e.message).join("; ")}`);
    }
  }

  console.log(`✓ All ${tasks.length} tasks validated`);

  const workflowResults: WorkflowResult[] = [];
  const rubricResults: RubricResult[] = [];
  const runReceipts: RunReceipt[] = [];
  const sandboxes: TaskSandbox[] = [];

  const corpusRoot = opts.corpusRoot ?? "/Users/msc/subsumio-web/law-corpus";

  // 2. Run each task
  for (const task of tasks) {
    console.log(`\n--- Running task ${task.id} (${task.workflow}) ---`);

    // Create sandbox
    const sandbox = createSandbox({ runId, taskId: task.id });
    sandboxes.push(sandbox);

    // Write case facts as input document if available
    if (task.case_facts) {
      writeInputDocument(sandbox, "sachverhalt.txt", task.case_facts);
    }

    // Determine agent model
    const agentModel = "deepseek/deepseek-v4-flash";
    const agentProvider = "openrouter";

    // Get cross-family judge config
    const judgeConfig = getCrossFamilyJudgeConfig(agentModel).primary;

    // Chat function (mock or real)
    const chatFn = opts.mockMode ? mockChatFn : mockChatFn; // TODO: wire real chatFn

    // Tool context
    const toolCtx = {
      sandbox,
      corpusRoot,
      jurisdiction: task.jurisdiction,
    };

    // Run workflow
    const result = await runWorkflow({
      task,
      sandbox,
      toolCtx,
      chatFn,
      judgeConfig,
      modelId: agentModel,
      provider: agentProvider,
    });

    workflowResults.push(result);
    rubricResults.push(result.rubric);

    // Build run receipt
    const promptHash = computePromptHash(task.prompt, result.context.slice(0, 1000));
    const receipt: RunReceipt = {
      run_id: `${runId}-${task.id}`,
      task_id: task.id,
      model_id: agentModel,
      provider: agentProvider,
      prompt_hash: promptHash,
      tool_versions: {
        sandbox: "1.0.0",
        guardrail: "2.0.0",
        workflows: "1.0.0",
      },
      token_counts: {
        input: result.token_count.input,
        output: result.token_count.output,
      },
      latency_ms: result.latency_ms,
      cost_usd: result.cost_usd,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      verification_state: result.verification_state as RunReceipt["verification_state"],
      warnings: result.guardrail_flags.map((f) => `${f.type}: ${f.detail}`),
    };
    runReceipts.push(receipt);

    console.log(`  Verification: ${result.verification_state}`);
    console.log(`  All-pass: ${result.rubric.all_pass}`);
    console.log(`  Criteria: ${result.rubric.criteria_passed}/${result.rubric.criteria_total}`);
    console.log(`  Critical: ${result.rubric.critical_passed}/${result.rubric.critical_total}`);
    if (result.error) console.log(`  Error: ${result.error}`);
  }

  // 3. Compute aggregate score
  const aggregateScore = computeAggregateScore(rubricResults, tasks, runReceipts);

  // 4. Generate report
  const report = generateReport(aggregateScore);

  const completedAt = new Date().toISOString();

  // 5. Cleanup sandboxes
  for (const sandbox of sandboxes) {
    cleanupSandbox(sandbox);
  }

  console.log(`\n${report}`);

  return {
    run_id: runId,
    started_at: startedAt,
    completed_at: completedAt,
    tasks,
    workflow_results: workflowResults,
    rubric_results: rubricResults,
    run_receipts: runReceipts,
    aggregate_score: aggregateScore,
    report,
  };
}

// ── CLI Entry Point ───────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mockMode = args.includes("--mock");

  runE2E({ mockMode })
    .then((result) => {
      console.log(`\n✓ E2E run completed: ${result.run_id}`);
      console.log(`✓ Tasks: ${result.tasks.length}`);
      console.log(`✓ All-pass rate: ${(result.aggregate_score.all_pass_rate * 100).toFixed(1)}%`);
    })
    .catch((err) => {
      console.error("E2E run failed:", err);
      process.exit(1);
    });
}
