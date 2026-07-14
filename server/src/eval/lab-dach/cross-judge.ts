/**
 * LAB-DACH v3 — Cross-Vendor Judge with Grounding Gate
 *
 * Architecture:
 *   1. A question is answered by TWO models from different vendors (configurable).
 *   2. Each answer is judged by the OTHER vendor's model (never self-judging).
 *      Vendor A answers → Vendor B judges; Vendor B answers → Vendor A judges.
 *   3. Before each judge verdict, the grounding check runs: all cited §§ are
 *      verified via groundCitations against the real norm text corpus.
 *      Unverified citations → automatic "fail" (the judge never decides on
 *      norm content — the corpus does).
 *   4. Results flow into the review queue:
 *      - Judge disagreement → queue
 *      - Status uncertain/not_judgeable/judge_error → queue
 *      - ANY criterion with severity "critical" → always queue (human, even on agreement)
 *      - Unanimous pass/fail with all citations verified → auto-resolved
 *        (judge_provenance='llm_cross_judge', never 'human')
 *
 * Provenance:
 *   reviewer_type: 'human_jurist' | 'llm_cross_judge'
 *   Public benchmark claims may ONLY count human-reviewed tasks.
 */

import type {
  Task,
  Criterion,
  CriterionResult,
  JudgeStatus,
  CriterionSeverity,
} from "./types.ts";
import { getCriterionSeverity } from "./types.ts";
import {
  judgeCriterion,
  type JudgeConfig,
  type JudgeInput,
  type JudgeVerdict,
  type ChatOpts,
  type ChatResult,
} from "./rubric-judge.ts";

// ── Types ─────────────────────────────────────────────────────────────

/** Vendor identifier — used to enforce cross-vendor judging (never self-judge). */
export type VendorId = "anthropic" | "openai" | "google" | "deepseek" | "xAI" | "meta";

/** A model configuration for answering or judging. */
export interface ModelConfig {
  /** Vendor ID — models from the same vendor never judge each other. */
  vendor: VendorId;
  /** Model identifier (e.g. "claude-opus-4-8", "gpt-4.1"). */
  model_id: string;
  /** Display label for reports. */
  label: string;
  /** Max tokens for response. */
  max_tokens: number;
  /** Temperature (0 for deterministic judging). */
  temperature: number;
  /** Optional thinking config (Anthropic extended thinking). */
  thinking?: { type: "adaptive" | "enabled"; effort: "low" | "medium" | "high" };
}

/** Result of grounding check for a single answer. */
export interface GroundingResult {
  /** All citations found in the answer. */
  citations: Array<{
    code: string;
    paragraph: string;
    verified: boolean;
    source_text?: string;
  }>;
  /** True if ALL citations are verified against the corpus. */
  all_verified: boolean;
  /** List of unverified citations (hallucinated or not in corpus). */
  unverified: Array<{ code: string; paragraph: string }>;
}

/** A single answer from a model. */
export interface ModelAnswer {
  /** Which model produced this answer. */
  model_config: ModelConfig;
  /** The raw answer text. */
  text: string;
  /** Grounding check result for this answer. */
  grounding: GroundingResult;
}

/** A single criterion judged by cross-vendor. */
export interface CrossJudgeCriterionResult {
  /** Criterion ID. */
  criterion_id: string;
  /** The criterion being evaluated. */
  criterion: Criterion;
  /** Effective severity of this criterion. */
  severity: CriterionSeverity;
  /** Verdict from the cross-vendor judge. */
  verdict: JudgeVerdict;
  /** Whether the grounding gate passed (all citations verified). */
  grounding_passed: boolean;
  /** If grounding failed, the verdict is overridden to "fail". */
  grounding_overrode: boolean;
  /** Derived pass/fail (grounding can override to fail). */
  passed: boolean;
  /** Which model judged this criterion (the OTHER vendor). */
  judge_model: ModelConfig;
  /** Which model produced the answer being judged. */
  answer_model: ModelConfig;
}

/** Full cross-judge result for one task × one answer. */
export interface CrossJudgeResult {
  /** Task ID. */
  task_id: string;
  /** The answer being judged. */
  answer: ModelAnswer;
  /** Per-criterion results. */
  criteria: CrossJudgeCriterionResult[];
  /** Overall pass (all required/critical criteria passed + grounding). */
  all_pass: boolean;
  /** Whether all judges agreed on all criteria. */
  full_agreement: boolean;
  /** Whether ANY criterion had a judge disagreement. */
  has_disagreement: boolean;
  /** Whether ANY criterion had status uncertain/not_judgeable/judge_error. */
  has_uncertain: boolean;
  /** Whether ANY criterion is severity "critical" (always needs human review). */
  has_critical: boolean;
  /** Whether this result should go to the review queue. */
  needs_review: boolean;
  /** Reason(s) for review queue routing. */
  review_reasons: string[];
  /** Provenance: always 'llm_cross_judge' for auto-resolved, never 'human_jurist'. */
  reviewer_type: "llm_cross_judge";
}

// ── Grounding Gate ────────────────────────────────────────────────────

/**
 * Extract §-citations from text as RawCitation format.
 * Supports: § 433 BGB, §433 BGB, § 433 Abs. 1 BGB, Art. 127 OR, Art. 12 StGB
 */
function extractRawCitations(text: string): Array<{ code: string; paragraph: string; context?: string }> {
  const citations: Array<{ code: string; paragraph: string; context?: string }> = [];
  const seen = new Set<string>();

  // Pattern 1: § N [Abs. N] [Nr. N] CODE (DE/AT style)
  const dePattern = /§\s*(\d+[a-z]?)\s*(?:Abs\.\s*\d+)?\s*(?:Nr\.\s*\d+)?\s+(BGB|StGB|ZPO|HGB|AO|InsO|BauGB|UWG|GG|StPO|VwGO|RVG|BDSG|ABGB|StPO|UGB|EKStG|EStG|UStG|GewStG|KStG|ErbStG|BewG|GrEStG)/g;
  let match: RegExpExecArray | null;
  while ((match = dePattern.exec(text)) !== null) {
    const paragraph = match[1]!;
    const code = match[2]!;
    const key = `${code}-${paragraph}`;
    if (!seen.has(key)) {
      seen.add(key);
      const start = Math.max(0, match.index - 50);
      const end = Math.min(text.length, match.index + match[0].length + 50);
      citations.push({ code, paragraph, context: text.slice(start, end) });
    }
  }

  // Pattern 2: Art. N CODE (CH style)
  const chPattern = /Art\.\s*(\d+[a-z]?)\s+(OR|StGB|ZGB|StPO|ZPO|BVV|BVG|DSG)/g;
  while ((match = chPattern.exec(text)) !== null) {
    const paragraph = match[1]!;
    const code = match[2]!;
    const key = `${code}-${paragraph}`;
    if (!seen.has(key)) {
      seen.add(key);
      const start = Math.max(0, match.index - 50);
      const end = Math.min(text.length, match.index + match[0].length + 50);
      citations.push({ code, paragraph, context: text.slice(start, end) });
    }
  }

  return citations;
}

/**
 * Run the grounding check on an answer text.
 * Uses groundCitations from src/lib/legal-grounding.ts to verify each cited §
 * against the real norm text in the corpus.
 *
 * If groundCitationsFn is not provided (e.g. in mock/test mode), a mock
 * function can be injected. In production, the real groundCitations is used.
 */
export async function runGroundingCheck(
  answerText: string,
  groundCitationsFn?: (citations: Array<{ code: string; paragraph: string; context?: string }>) => Promise<Array<{ code: string; paragraph: string; verified: boolean; source_text?: string }>>
): Promise<GroundingResult> {
  const rawCitations = extractRawCitations(answerText);
  if (rawCitations.length === 0) {
    return { citations: [], all_verified: true, unverified: [] };
  }

  const groundFn = groundCitationsFn ?? (async (cites: Array<{ code: string; paragraph: string; context?: string }>) => {
    // Default: use real groundCitations from @/lib/legal-grounding
    const { groundCitations } = await import("@/lib/legal-grounding");
    return groundCitations(cites);
  });

  const grounded = await groundFn(rawCitations);
  const unverified = grounded
    .filter((g: { code: string; paragraph: string; verified: boolean }) => !g.verified)
    .map((g: { code: string; paragraph: string }) => ({ code: g.code, paragraph: g.paragraph }));

  return {
    citations: grounded,
    all_verified: unverified.length === 0,
    unverified,
  };
}

// ── Cross-Vendor Judge ────────────────────────────────────────────────

/**
 * Assert that two model configs are from different vendors.
 * This makes self-judging structurally impossible.
 */
export function assertDifferentVendors(answerModel: ModelConfig, judgeModel: ModelConfig): void {
  if (answerModel.vendor === judgeModel.vendor) {
    throw new Error(
      `Cross-vendor violation: answer model "${answerModel.label}" (vendor: ${answerModel.vendor}) ` +
        `cannot be judged by "${judgeModel.label}" (same vendor: ${judgeModel.vendor}). ` +
        `Self-judging is structurally forbidden.`
    );
  }
}

/**
 * Convert a ModelConfig to a JudgeConfig for rubric-judge.ts.
 */
function toJudgeConfig(model: ModelConfig): JudgeConfig {
  return {
    primary_model: model.label as "opus" | "deepseek" | "grok",
    max_tokens: model.max_tokens,
    temperature: model.temperature,
    thinking: model.thinking,
  };
}

/**
 * Run cross-vendor judging on a single answer.
 *
 * The answer is judged by a model from a DIFFERENT vendor than the one that
 * produced it. Before each judge call, the grounding gate runs:
 * - If the answer has unverified citations, the criterion is auto-failed
 *   (grounding_overrode=true) and the judge is NOT called for that criterion.
 * - The judge never decides on norm content — the corpus does.
 *
 * @param task The task being evaluated
 * @param answer The model's answer text
 * @param answerModel Config of the model that produced the answer
 * @param judgeModel Config of the model that will judge (MUST be different vendor)
 * @param context Retrieved law chunks provided to the agent
 * @param chatFn Chat function for the judge LLM
 * @param groundCitationsFn Optional override for grounding (mock/test)
 */
export async function crossJudgeAnswer(
  task: Task,
  answer: string,
  answerModel: ModelConfig,
  judgeModel: ModelConfig,
  context: string,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>,
  groundCitationsFn?: (citations: Array<{ code: string; paragraph: string; context?: string }>) => Promise<Array<{ code: string; paragraph: string; verified: boolean; source_text?: string }>>
): Promise<CrossJudgeResult> {
  // Structural guard: never allow self-judging
  assertDifferentVendors(answerModel, judgeModel);

  // 1. Run grounding check on the answer
  const grounding = await runGroundingCheck(answer, groundCitationsFn);

  const modelAnswer: ModelAnswer = {
    model_config: answerModel,
    text: answer,
    grounding,
  };

  // 2. Judge each llm_judge criterion
  const criteriaResults: CrossJudgeCriterionResult[] = [];
  const llmCriteria = task.criteria.filter((c) => c.check_type === "llm_judge");

  for (const criterion of llmCriteria) {
    const severity = getCriterionSeverity(criterion);

    // Grounding gate: if answer has unverified citations, auto-fail
    if (!grounding.all_verified) {
      criteriaResults.push({
        criterion_id: criterion.id,
        criterion,
        severity,
        verdict: {
          status: "fail",
          passed: false,
          reasoning: `Grounding gate: ${grounding.unverified.length} unverified citation(s) found. ` +
            `Unverified: ${grounding.unverified.map((u) => `§ ${u.paragraph} ${u.code}`).join(", ")}. ` +
            `The judge is not consulted — the corpus determines this criterion.`,
          confidence: 1.0,
          evidence_quotes: [],
          raw_response: "",
          model: judgeModel.label as "opus" | "deepseek" | "grok",
        },
        grounding_passed: false,
        grounding_overrode: true,
        passed: false,
        judge_model: judgeModel,
        answer_model: answerModel,
      });
      continue;
    }

    // Run the cross-vendor judge
    const input: JudgeInput = { task, output: answer, context, criterion };
    const verdict = await judgeCriterion(input, toJudgeConfig(judgeModel), chatFn);

    criteriaResults.push({
      criterion_id: criterion.id,
      criterion,
      severity,
      verdict,
      grounding_passed: true,
      grounding_overrode: false,
      passed: verdict.passed,
      judge_model: judgeModel,
      answer_model: answerModel,
    });
  }

  // 3. Determine review queue routing
  const reviewReasons: string[] = [];
  let hasDisagreement = false;
  let hasUncertain = false;
  let hasCritical = false;

  for (const cr of criteriaResults) {
    // Critical criteria → always human review (even on agreement)
    // Check both severity='critical' and the legacy critical=true flag
    if (cr.severity === "critical" || cr.criterion.critical) {
      hasCritical = true;
    }

    // Uncertain / not_judgeable / judge_error → queue
    const status = cr.verdict.status;
    if (status === "uncertain" || status === "not_judgeable" || status === "judge_error") {
      hasUncertain = true;
    }

    // Disagreement is detected at the CrossJudgeSession level (comparing two answers)
    // Here we flag individual criteria that are not clean pass/fail
  }

  // Overall pass: all required criteria passed
  const requiredResults = criteriaResults.filter((cr) => {
    const c = cr.criterion;
    return c.required ?? c.critical;
  });
  const allPass = requiredResults.every((cr) => cr.passed);

  if (hasUncertain) reviewReasons.push("uncertain_or_not_judgeable");
  if (hasCritical) reviewReasons.push("critical_criterion_requires_human");
  if (!grounding.all_verified) reviewReasons.push("grounding_failure");

  const needsReview = reviewReasons.length > 0;

  return {
    task_id: task.id,
    answer: modelAnswer,
    criteria: criteriaResults,
    all_pass: allPass,
    full_agreement: !hasDisagreement,
    has_disagreement: hasDisagreement,
    has_uncertain: hasUncertain,
    has_critical: hasCritical,
    needs_review: needsReview,
    review_reasons: reviewReasons,
    reviewer_type: "llm_cross_judge",
  };
}

// ── Cross-Judge Session (two answers, cross-judged) ──────────────────

/**
 * A full cross-judge session for one task:
 *   - Model A (vendor X) answers → Model B (vendor Y) judges
 *   - Model B (vendor Y) answers → Model A (vendor X) judges
 *   - Disagreement between the two judges → review queue
 *
 * @param task The task to evaluate
 * @param generateFn Function to generate an answer (called per model)
 * @param chatFn Chat function for judging
 * @param context Retrieved law chunks
 * @param modelA First model config (vendor X)
 * @param modelB Second model config (vendor Y, MUST be different vendor)
 * @param groundCitationsFn Optional grounding override (mock/test)
 */
export async function crossJudgeSession(
  task: Task,
  generateFn: (model: ModelConfig, task: Task) => Promise<string>,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>,
  context: string,
  modelA: ModelConfig,
  modelB: ModelConfig,
  groundCitationsFn?: (citations: Array<{ code: string; paragraph: string; context?: string }>) => Promise<Array<{ code: string; paragraph: string; verified: boolean; source_text?: string }>>
): Promise<{
  answer_a: ModelAnswer;
  answer_b: ModelAnswer;
  judge_a: CrossJudgeResult; // answer A judged by model B
  judge_b: CrossJudgeResult; // answer B judged by model A
  disagreement: boolean;
  needs_review: boolean;
  review_reasons: string[];
}> {
  // Structural guard
  assertDifferentVendors(modelA, modelB);

  // 1. Generate answers (parallel)
  const [answerTextA, answerTextB] = await Promise.all([
    generateFn(modelA, task),
    generateFn(modelB, task),
  ]);

  // 2. Cross-judge (A's answer judged by B, B's answer judged by A)
  const [judgeA, judgeB] = await Promise.all([
    crossJudgeAnswer(task, answerTextA, modelA, modelB, context, chatFn, groundCitationsFn),
    crossJudgeAnswer(task, answerTextB, modelB, modelA, context, chatFn, groundCitationsFn),
  ]);

  // 3. Detect disagreements between the two judge results
  const disagreement = detectDisagreement(judgeA, judgeB);

  const reviewReasons = new Set<string>([...judgeA.review_reasons, ...judgeB.review_reasons]);
  if (disagreement) reviewReasons.add("judge_disagreement");

  const needsReview = reviewReasons.size > 0;

  return {
    answer_a: judgeA.answer,
    answer_b: judgeB.answer,
    judge_a: judgeA,
    judge_b: judgeB,
    disagreement,
    needs_review: needsReview,
    review_reasons: [...reviewReasons],
  };
}

/**
 * Detect disagreement between two cross-judge results.
 * Compares per-criterion verdicts: if the same criterion has different
 * pass/fail outcomes between the two judges, it's a disagreement.
 */
export function detectDisagreement(judgeA: CrossJudgeResult, judgeB: CrossJudgeResult): boolean {
  const mapA = new Map(judgeA.criteria.map((cr) => [cr.criterion_id, cr.passed]));
  for (const crB of judgeB.criteria) {
    const passedA = mapA.get(crB.criterion_id);
    if (passedA !== undefined && passedA !== crB.passed) {
      return true;
    }
  }
  return false;
}
