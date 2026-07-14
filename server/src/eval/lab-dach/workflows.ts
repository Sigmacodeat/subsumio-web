/**
 * LAB-DACH v3 — Three Core Workflows
 *
 * Workflow 1: Rechtsfrage → Kurzmemorandum
 *   search_law → search_judikatur → analyze → draft memo → guardrail → cross-verify
 *
 * Workflow 2: Gerichtsakt → Fristen/Risiken
 *   read_document → extract deadlines (frist-engine) → identify risks → draft report → guardrail
 *
 * Workflow 3: Schriftsatzentwurf
 *   search_law → analyze claim → draft Schriftsatz → guardrail → cross-verify → BLOCKED if high-severity
 */

import type { Task, CriterionResult, RubricResult, JudgeStatus } from "./types.ts";
import type { TaskSandbox } from "./sandbox.ts";
import type { ToolContext, ToolResult } from "./agent-tools.ts";
import { dispatchTool } from "./agent-tools.ts";
import { runAllAutomatedChecks, type CheckContext } from "./automated-checks.ts";
import { resolveVerificationState, classifyOutputRisk } from "../../core/verification/states.ts";
import type { JudgeConfig } from "./rubric-judge.ts";
import { judgeAllCriteria, type ChatOpts, type ChatResult } from "./rubric-judge.ts";
import { computeAggregateScore } from "./scoring.ts";
import { checkCitationGrounding } from "../../core/citation-guardrail.ts";
import { computeTurnCost } from "../../core/cost-ledger.ts";
import { createHash } from "node:crypto";
import {
  type WorkProductReceipt,
  type WorkProductType,
  buildWorkProductReceipt,
  type ReceiptCheck,
} from "@/lib/work-product-receipts.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface WorkflowRunOpts {
  task: Task;
  sandbox: TaskSandbox;
  toolCtx: ToolContext;
  /** Chat function for LLM generation */
  chatFn: (opts: ChatOpts) => Promise<ChatResult>;
  /** Judge configuration */
  judgeConfig: JudgeConfig;
  /** Model ID being evaluated */
  modelId: string;
  /** Provider */
  provider: string;
}

/**
 * Wrap a chatFn to track per-call latency. Returns the wrapped fn and
 * an array of latencies that workflow functions can include in their result.
 */
function withLatencyTracking(chatFn: (opts: ChatOpts) => Promise<ChatResult>): {
  fn: (opts: ChatOpts) => Promise<ChatResult>;
  latencies: number[];
} {
  const latencies: number[] = [];
  const fn = async (opts: ChatOpts): Promise<ChatResult> => {
    const start = Date.now();
    const result = await chatFn(opts);
    latencies.push(Date.now() - start);
    return result;
  };
  return { fn, latencies };
}

export interface WorkflowResult {
  task_id: string;
  workflow: string;
  output: string;
  context: string;
  deliverables: Record<string, string>;
  tool_calls: ToolCallRecord[];
  guardrail_flags: GuardrailFlagSummary[];
  verification_state: string;
  rubric: RubricResult;
  latency_ms: number;
  token_count: { input: number; output: number };
  cost_usd: number;
  /** Verification receipt for the work product. */
  receipt?: WorkProductReceipt;
  error?: string;
  /** Per-LLM-call latencies in ms (for p50/p95 computation in receipts) */
  llm_latencies_ms?: number[];
}

export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  result: ToolResult;
  timestamp: string;
}

export interface GuardrailFlagSummary {
  type: string;
  severity: string;
  detail: string;
}

// ── Receipt Helper ────────────────────────────────────────────────────

function buildWorkflowReceipt(
  productType: WorkProductType,
  task: Task,
  output: string,
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  guardrailFlags: GuardrailFlagSummary[],
  verificationState: string,
  lawSlugs: string[],
  opts: WorkflowRunOpts
): WorkProductReceipt {
  const checks: ReceiptCheck[] = [
    {
      name: "citation_grounding",
      description: "All citations are grounded in retrieved context",
      passed: guardrailFlags.length === 0,
      severity: guardrailFlags.some((f) => f.severity === "high") ? "critical" : "warning",
    },
    {
      name: "guardrail_passed",
      description: "Citation guardrail passed without high-severity flags",
      passed: !guardrailFlags.some((f) => f.severity === "high"),
      severity: "error",
    },
    {
      name: "verification_state_resolved",
      description: "Verification state was resolved deterministically",
      passed: verificationState !== "VERIFIER_ERROR",
      severity: "error",
    },
  ];

  return buildWorkProductReceipt({
    product_type: productType,
    product_ref: task.id,
    output,
    brain_id: "lab-dach-eval",
    jurisdiction: task.jurisdiction,
    models: [modelId],
    prompts: [{ system: systemPrompt, user: userPrompt }],
    source_snapshot_hashes: lawSlugs,
    checks,
    flags: guardrailFlags.map((f) => `${f.type}:${f.severity}`),
    metadata: {
      workflow: opts.task.workflow,
      provider: opts.provider,
      token_count: { input: userPrompt.length / 4, output: output.length / 4 },
    },
  });
}

// ── Workflow 1: Rechtsfrage → Kurzmemorandum ──────────────────────────

export async function runWorkflow1_Memorandum(opts: WorkflowRunOpts): Promise<WorkflowResult> {
  const { task, sandbox, toolCtx } = opts;
  const { fn: chatFn, latencies: llmLatencies } = withLatencyTracking(opts.chatFn);
  const startedAt = Date.now();
  const toolCalls: ToolCallRecord[] = [];

  // Step 1: search_law
  const searchResult = await callTool(
    "search_law",
    { query: task.prompt, limit: 8 },
    toolCtx,
    toolCalls
  );
  const lawResults =
    (searchResult.data as Array<{ text: string; slug: string; title: string }>) ?? [];
  const lawContext = lawResults.map((r) => `### ${r.title}\n${r.text}`).join("\n\n");

  // Step 2: search_judikatur
  const judResult = await callTool(
    "search_judikatur",
    { query: task.prompt, limit: 5 },
    toolCtx,
    toolCalls
  );
  const judResults = (judResult.data as Array<{ text: string; slug: string }>) ?? [];
  const judContext = judResults.map((r) => r.text).join("\n\n");

  // Step 3: Generate memo
  const context = `${lawContext}\n\n## Judikatur\n${judContext}`;
  const systemPrompt = `Du bist ein österreichischer/deutscher Rechtsanwalt. Erstelle ein Kurzmemorandum zur folgenden Rechtsfrage.

Regeln:
- Zitiere §§ exakt aus dem Kontext
- Verwende NUR Gesetze aus dem Kontext
- Struktur: 1. Sachverhalt 2. Rechtsfrage 3. Rechtliche Würdigung 4. Ergebnis
- Auf Deutsch
- Max 2000 Wörter`;

  const chatResult = await chatFn({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `## Rechtsfrage\n${task.prompt}\n\n## Kontext\n${context.slice(0, 12000)}`,
      },
    ],
    maxTokens: 2048,
    temperature: 0,
  });

  const output = chatResult.text;

  // Step 4: Write deliverable
  await callTool("write_deliverable", { filename: "memo.md", content: output }, toolCtx, toolCalls);

  // Step 5: Guardrail
  const guardrailResult = checkCitationGrounding({
    answer: output,
    context,
    topSlugs: lawResults.map((r) => r.slug),
  });

  const guardrailFlags: GuardrailFlagSummary[] = guardrailResult.flags.map((f) => ({
    type: f.type,
    severity: f.severity,
    detail: f.detail,
  }));

  // Step 6: Verification state
  const outputRisk = classifyOutputRisk("memo");
  const verificationDecision = resolveVerificationState(guardrailResult, null, {
    risk_level: outputRisk,
    guardrail_ran: true,
    cross_verify_ran: false,
  });

  // Step 7: Evaluate criteria
  const rubric = await evaluateCriteria(
    opts,
    output,
    context,
    guardrailFlags,
    verificationDecision.state,
    lawResults.map((r) => r.slug)
  );

  // Step 8: Build verification receipt
  const userPrompt = `## Rechtsfrage\n${task.prompt}\n\n## Kontext\n${context.slice(0, 12000)}`;
  const receipt = buildWorkflowReceipt(
    "memo",
    task,
    output,
    systemPrompt,
    userPrompt,
    opts.modelId,
    guardrailFlags,
    verificationDecision.state,
    lawResults.map((r) => r.slug),
    opts
  );

  const inputTokens1 = chatResult.usage?.input_tokens ?? Math.round(context.length / 4);
  const outputTokens1 = chatResult.usage?.output_tokens ?? Math.round(output.length / 4);

  return {
    task_id: task.id,
    workflow: "rechtsfrage_memorandum",
    output,
    context,
    deliverables: { "memo.md": output },
    tool_calls: toolCalls,
    guardrail_flags: guardrailFlags,
    verification_state: verificationDecision.state,
    rubric,
    latency_ms: Date.now() - startedAt,
    token_count: { input: inputTokens1, output: outputTokens1 },
    cost_usd: computeWorkflowCost(opts.modelId, inputTokens1, outputTokens1),
    receipt,
    llm_latencies_ms: llmLatencies,
  };
}

// ── Workflow 2: Gerichtsakt → Fristen/Risiken ────────────────────────

export async function runWorkflow2_Fristen(opts: WorkflowRunOpts): Promise<WorkflowResult> {
  const { task, sandbox, toolCtx } = opts;
  const { fn: chatFn, latencies: llmLatencies } = withLatencyTracking(opts.chatFn);
  const startedAt = Date.now();
  const toolCalls: ToolCallRecord[] = [];

  // Step 1: Read case documents
  const docFilenames = task.input_documents ?? [];
  let docContext = "";
  for (const filename of docFilenames) {
    const result = await callTool("read_document", { filename }, toolCtx, toolCalls);
    if (result.success && result.data) {
      docContext += `### ${filename}\n${(result.data as { text: string }).text}\n\n`;
    }
  }

  // If no input documents specified, use case_facts from task
  if (!docContext && task.case_facts) {
    docContext = `### Sachverhalt\n${task.case_facts}`;
  }

  // Step 2: Search relevant law
  const searchResult = await callTool(
    "search_law",
    { query: task.prompt, limit: 5 },
    toolCtx,
    toolCalls
  );
  const lawResults = (searchResult.data as Array<{ text: string; title: string }>) ?? [];
  const lawContext = lawResults.map((r) => `### ${r.title}\n${r.text}`).join("\n\n");

  const context = `${docContext}\n\n## Relevante Gesetze\n${lawContext}`;

  // Step 3: Generate Fristen/Risiken report
  const systemPrompt = `Du bist ein österreichischer/deutscher Rechtsanwalt. Analysiere den Gerichtsakt und erstelle einen Fristen- und Risikenbericht.

Struktur:
1. Fristen (mit Berechnung: Zustellungsdatum → Fristende)
2. Verfahrensrisiken
3. Materiell-rechtliche Risiken
4. Empfehlungen

Regeln:
- Zitiere §§ exakt
- Verwende NUR Gesetze aus dem Kontext
- Auf Deutsch`;

  const chatResult = await chatFn({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `## Aufgabe\n${task.prompt}\n\n## Akteninhalt\n${context.slice(0, 12000)}`,
      },
    ],
    maxTokens: 2048,
    temperature: 0,
  });

  const output = chatResult.text;

  // Step 4: Write deliverable
  await callTool(
    "write_deliverable",
    { filename: "fristen_report.md", content: output },
    toolCtx,
    toolCalls
  );

  // Step 5: Guardrail
  const guardrailResult = checkCitationGrounding({
    answer: output,
    context,
    topSlugs: lawResults.map((r) => (r as { slug?: string }).slug ?? ""),
  });

  const guardrailFlags: GuardrailFlagSummary[] = guardrailResult.flags.map((f) => ({
    type: f.type,
    severity: f.severity,
    detail: f.detail,
  }));

  // Step 6: Verification
  const outputRisk = classifyOutputRisk("fristen_report");
  const verificationDecision = resolveVerificationState(guardrailResult, null, {
    risk_level: outputRisk,
    guardrail_ran: true,
    cross_verify_ran: false,
  });

  // Step 7: Evaluate
  const rubric = await evaluateCriteria(
    opts,
    output,
    context,
    guardrailFlags,
    verificationDecision.state,
    lawResults.map((r) => (r as { slug?: string }).slug ?? "").filter(Boolean)
  );

  // Step 8: Build verification receipt
  const userPrompt = `## Aufgabe\n${task.prompt}\n\n## Akteninhalt\n${context.slice(0, 12000)}`;
  const receipt = buildWorkflowReceipt(
    "fristenreport",
    task,
    output,
    systemPrompt,
    userPrompt,
    opts.modelId,
    guardrailFlags,
    verificationDecision.state,
    lawResults.map((r) => (r as { slug?: string }).slug ?? ""),
    opts
  );

  const inputTokens2 = chatResult.usage?.input_tokens ?? Math.round(context.length / 4);
  const outputTokens2 = chatResult.usage?.output_tokens ?? Math.round(output.length / 4);

  return {
    task_id: task.id,
    workflow: "gerichtsakt_fristen",
    output,
    context,
    deliverables: { "fristen_report.md": output },
    tool_calls: toolCalls,
    guardrail_flags: guardrailFlags,
    verification_state: verificationDecision.state,
    rubric,
    latency_ms: Date.now() - startedAt,
    token_count: { input: inputTokens2, output: outputTokens2 },
    cost_usd: computeWorkflowCost(opts.modelId, inputTokens2, outputTokens2),
    receipt,
    llm_latencies_ms: llmLatencies,
  };
}

// ── Workflow 3: Schriftsatzentwurf ────────────────────────────────────

export async function runWorkflow3_Schriftsatz(opts: WorkflowRunOpts): Promise<WorkflowResult> {
  const { task, sandbox, toolCtx } = opts;
  const { fn: chatFn, latencies: llmLatencies } = withLatencyTracking(opts.chatFn);
  const startedAt = Date.now();
  const toolCalls: ToolCallRecord[] = [];

  // Step 1: Search law
  const searchResult = await callTool(
    "search_law",
    { query: task.prompt, limit: 8 },
    toolCtx,
    toolCalls
  );
  const lawResults =
    (searchResult.data as Array<{ text: string; title: string; slug: string }>) ?? [];
  const lawContext = lawResults.map((r) => `### ${r.title}\n${r.text}`).join("\n\n");

  // Step 2: Read case documents if available
  let docContext = "";
  for (const filename of task.input_documents ?? []) {
    const result = await callTool("read_document", { filename }, toolCtx, toolCalls);
    if (result.success && result.data) {
      docContext += `### ${filename}\n${(result.data as { text: string }).text}\n\n`;
    }
  }
  if (!docContext && task.case_facts) {
    docContext = `### Sachverhalt\n${task.case_facts}`;
  }

  const context = `${docContext}\n\n## Relevante Gesetze\n${lawContext}`;

  // Step 3: Draft Schriftsatz
  const systemPrompt = `Du bist ein österreichischer/deutscher Rechtsanwalt. Entwerfe einen Schriftsatz.

Struktur:
1. Rubrum (Parteien)
2. Anträge
3. Begründung (mit §-Zitaten)
4. Beweisangebot

Regeln:
- Zitiere §§ exakt aus dem Kontext
- Verwende NUR Gesetze aus dem Kontext
- Formeller juristischer Stil
- Auf Deutsch`;

  const chatResult = await chatFn({
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `## Aufgabe\n${task.prompt}\n\n## Kontext\n${context.slice(0, 12000)}`,
      },
    ],
    maxTokens: 3072,
    temperature: 0,
  });

  let output = chatResult.text;

  // Step 4: Guardrail
  const guardrailResult = checkCitationGrounding({
    answer: output,
    context,
    topSlugs: lawResults.map((r) => r.slug),
  });

  // Step 5: If high-severity flags → regenerate with stricter prompt
  const highSeverityFlags = guardrailResult.flags.filter((f) => f.severity === "high");
  let regenResult: ChatResult | null = null;
  if (highSeverityFlags.length > 0) {
    regenResult = await chatFn({
      system:
        systemPrompt +
        "\n\nWICHTIG: Deine vorherige Antwort hatte ungestützte Zitate. Zitiere NUR §§ die wörtlich im Kontext vorkommen.",
      messages: [
        {
          role: "user",
          content: `## Aufgabe\n${task.prompt}\n\n## Kontext\n${context.slice(0, 12000)}`,
        },
      ],
      maxTokens: 3072,
      temperature: 0,
    });
    output = regenResult.text;
  }

  // Step 6: Write deliverable
  await callTool(
    "write_deliverable",
    { filename: "schriftsatz.txt", content: output },
    toolCtx,
    toolCalls
  );

  // Re-run guardrail on final output
  const finalGuardrail = checkCitationGrounding({
    answer: output,
    context,
    topSlugs: lawResults.map((r) => r.slug),
  });

  const guardrailFlags: GuardrailFlagSummary[] = finalGuardrail.flags.map((f) => ({
    type: f.type,
    severity: f.severity,
    detail: f.detail,
  }));

  // Step 7: Verification — Schriftsatz is high-risk → BLOCKED if high-severity
  const outputRisk = classifyOutputRisk("draft");
  const verificationDecision = resolveVerificationState(finalGuardrail, null, {
    risk_level: outputRisk,
    guardrail_ran: true,
    cross_verify_ran: false,
  });

  // Step 8: Evaluate
  const rubric = await evaluateCriteria(
    opts,
    output,
    context,
    guardrailFlags,
    verificationDecision.state,
    lawResults.map((r) => r.slug)
  );

  // Step 9: Build verification receipt
  const userPrompt = `## Aufgabe\n${task.prompt}\n\n## Kontext\n${context.slice(0, 12000)}`;
  const receipt = buildWorkflowReceipt(
    "schriftsatz",
    task,
    output,
    systemPrompt,
    userPrompt,
    opts.modelId,
    guardrailFlags,
    verificationDecision.state,
    lawResults.map((r) => r.slug),
    opts
  );

  const inputTokens3 = (chatResult.usage?.input_tokens ?? Math.round(context.length / 4)) +
    (regenResult ? (regenResult.usage?.input_tokens ?? Math.round(context.length / 4)) : 0);
  const outputTokens3 = (chatResult.usage?.output_tokens ?? Math.round(output.length / 4)) +
    (regenResult ? (regenResult.usage?.output_tokens ?? Math.round(output.length / 4)) : 0);

  return {
    task_id: task.id,
    workflow: "schriftsatz_entwurf",
    output,
    context,
    deliverables: { "schriftsatz.txt": output },
    tool_calls: toolCalls,
    guardrail_flags: guardrailFlags,
    verification_state: verificationDecision.state,
    rubric,
    latency_ms: Date.now() - startedAt,
    token_count: { input: inputTokens3, output: outputTokens3 },
    cost_usd: computeWorkflowCost(opts.modelId, inputTokens3, outputTokens3),
    receipt,
    llm_latencies_ms: llmLatencies,
  };
}

// ── Workflow Dispatcher ───────────────────────────────────────────────

/**
 * Run the appropriate workflow for a task.
 */
export async function runWorkflow(opts: WorkflowRunOpts): Promise<WorkflowResult> {
  switch (opts.task.workflow) {
    case "rechtsfrage_memorandum":
      return runWorkflow1_Memorandum(opts);
    case "gerichtsakt_fristen":
      return runWorkflow2_Fristen(opts);
    case "schriftsatz_entwurf":
      return runWorkflow3_Schriftsatz(opts);
    default:
      return {
        task_id: opts.task.id,
        workflow: opts.task.workflow,
        output: "",
        context: "",
        deliverables: {},
        tool_calls: [],
        guardrail_flags: [],
        verification_state: "VERIFIER_ERROR",
        rubric: emptyRubric(opts.task.id),
        latency_ms: 0,
        token_count: { input: 0, output: 0 },
        cost_usd: 0,
        error: `Unknown workflow: ${opts.task.workflow}`,
      };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  records: ToolCallRecord[]
): Promise<ToolResult> {
  const result = await dispatchTool(name, args, ctx);
  records.push({
    tool: name,
    args,
    result,
    timestamp: new Date().toISOString(),
  });
  return result;
}

async function evaluateCriteria(
  opts: WorkflowRunOpts,
  output: string,
  context: string,
  guardrailFlags: GuardrailFlagSummary[],
  verificationState: string,
  topSlugs: string[]
): Promise<RubricResult> {
  const { task, toolCtx, judgeConfig, chatFn } = opts;

  // Run automated checks. topSlugs (the retrieved law slugs) MUST be threaded
  // through: the jurisdiction_correct / cross-law-contamination check derives
  // its "retrieved laws" set from these slugs. Without them, every cited law is
  // falsely flagged as contamination (the live-003 0/7 root cause).
  const checkCtx: CheckContext = {
    output,
    context,
    jurisdiction: toolCtx.jurisdiction,
    minCitations: task.min_citations,
    topSlugs,
  };

  const automatedCriteria = task.criteria.filter((c) => c.check_type === "automated");
  const automatedCheckIds = automatedCriteria.map((c) => c.automated_check!).filter(Boolean);
  const automatedResults = runAllAutomatedChecks(automatedCheckIds, checkCtx);

  // Run LLM judge criteria
  const llmResults = await judgeAllCriteria(task, output, context, judgeConfig, chatFn);

  // Combine results
  const allResults = [...automatedResults, ...llmResults];

  // Compute rubric
  const criticalResults = allResults.filter((r) => r.critical);
  const criticalPassed = criticalResults.filter((r) => r.passed).length;
  const criteriaPassed = allResults.filter((r) => r.passed).length;
  const allPass = criticalResults.every((r) => r.passed);

  const weightedScore =
    allResults.reduce((sum, r) => sum + r.score * (r.critical ? 2 : 1), 0) /
    (allResults.reduce((sum, r) => sum + (r.critical ? 2 : 1), 0) || 1);

  return {
    task_id: task.id,
    criteria: allResults,
    all_pass: allPass,
    strict_all_pass: allResults.every((r) => r.passed),
    critical_all_pass: allPass,
    criterion_pass_rate: allResults.length > 0 ? criteriaPassed / allResults.length : 0,
    criteria_passed: criteriaPassed,
    criteria_total: allResults.length,
    critical_passed: criticalPassed,
    critical_total: criticalResults.length,
    weighted_score: weightedScore,
    verification_state: verificationState as RubricResult["verification_state"],
    judge_status_counts: computeJudgeStatusCounts(allResults),
  };
}

function emptyRubric(taskId: string): RubricResult {
  return {
    task_id: taskId,
    criteria: [],
    all_pass: false,
    strict_all_pass: false,
    critical_all_pass: false,
    criterion_pass_rate: 0,
    criteria_passed: 0,
    criteria_total: 0,
    critical_passed: 0,
    critical_total: 0,
    weighted_score: 0,
    judge_status_counts: { pass: 0, fail: 0, uncertain: 0, not_judgeable: 0, judge_error: 0 },
  };
}

function computeJudgeStatusCounts(results: CriterionResult[]): Record<JudgeStatus, number> {
  const counts: Record<JudgeStatus, number> = {
    pass: 0,
    fail: 0,
    uncertain: 0,
    not_judgeable: 0,
    judge_error: 0,
  };
  for (const r of results) {
    if (r.judge_status) {
      counts[r.judge_status]++;
    }
  }
  return counts;
}

function computeWorkflowCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  return computeTurnCost(modelId, { input: inputTokens, output: outputTokens });
}

/**
 * Compute prompt hash for reproducibility.
 */
export function computePromptHash(system: string, user: string): string {
  return createHash("sha256")
    .update(system + user)
    .digest("hex");
}
