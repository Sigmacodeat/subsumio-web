/**
 * LAB-DACH v3 — Cross-Family Rubric Judge
 *
 * LLM-based judge for semantic criteria evaluation.
 * Cross-family design:
 *   - DeepSeek agent → Opus 4.8 as primary judge
 *   - Opus agent → DeepSeek V4-Flash + independent second judge
 *
 * Judge config:
 *   - Opus 4.8: thinking: { type: "adaptive" }, effort: "high", no sampling params
 *   - DeepSeek V4-Flash: non-thinking, temperature=0
 *   - 5-strategy JSON parser for robust response extraction
 */

import type { Criterion, CriterionResult, Task } from "./types.ts";

// ── Types ─────────────────────────────────────────────────────────────

export type JudgeModel = "opus" | "deepseek" | "grok";

export interface JudgeConfig {
  /** Primary judge model */
  primary_model: JudgeModel;
  /** Secondary judge model (for cross-family verification) */
  secondary_model?: JudgeModel;
  /** Max tokens for judge response */
  max_tokens: number;
  /** Temperature (0 for deterministic) */
  temperature: number;
  /** Whether to use thinking mode (Opus only) */
  thinking?: {
    type: "adaptive" | "enabled";
    effort: "low" | "medium" | "high";
  };
}

export interface JudgeInput {
  /** The task being evaluated */
  task: Task;
  /** The agent's output */
  output: string;
  /** The context provided to the agent */
  context: string;
  /** The criterion to evaluate */
  criterion: Criterion;
}

export interface JudgeResponse {
  /** Whether the criterion passed */
  passed: boolean;
  /** Detailed explanation */
  reasoning: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Raw LLM response */
  raw_response: string;
  /** Model used */
  model: JudgeModel;
}

export interface ChatOpts {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  temperature?: number;
  thinking?: { type: "adaptive" | "enabled"; effort: "low" | "medium" | "high" };
  responseFormat?: { type: "json_object" };
}

export interface ChatResult {
  text: string;
}

// ── Default Configs ───────────────────────────────────────────────────

export const JUDGE_CONFIGS: Record<JudgeModel, JudgeConfig> = {
  opus: {
    primary_model: "opus",
    max_tokens: 1024,
    temperature: 0,
    thinking: { type: "adaptive", effort: "high" },
  },
  deepseek: {
    primary_model: "deepseek",
    max_tokens: 1024,
    temperature: 0,
  },
  grok: {
    primary_model: "grok",
    max_tokens: 1024,
    temperature: 0,
  },
};

/**
 * Get cross-family judge configuration.
 * If the agent was DeepSeek, use Opus as judge (and vice versa).
 */
export function getCrossFamilyJudgeConfig(agentModel: string): {
  primary: JudgeConfig;
  secondary?: JudgeConfig;
} {
  const isDeepSeekAgent = agentModel.toLowerCase().includes("deepseek");
  const isOpusAgent =
    agentModel.toLowerCase().includes("opus") || agentModel.toLowerCase().includes("claude");

  if (isDeepSeekAgent) {
    // DeepSeek agent → Opus as primary judge
    return {
      primary: JUDGE_CONFIGS.opus,
      secondary: JUDGE_CONFIGS.grok, // Independent second judge
    };
  } else if (isOpusAgent) {
    // Opus agent → DeepSeek as primary + Grok as secondary
    return {
      primary: JUDGE_CONFIGS.deepseek,
      secondary: JUDGE_CONFIGS.grok,
    };
  }
  // Default: DeepSeek as judge
  return {
    primary: JUDGE_CONFIGS.deepseek,
  };
}

// ── Judge Prompt ──────────────────────────────────────────────────────

/**
 * Build the system prompt for the judge.
 */
export function buildJudgeSystemPrompt(task: Task): string {
  return `Du bist ein strenger rechtlicher Gutachter (Judge) für den LAB-DACH Benchmark.

Du bewertest die Ausgabe eines KI-Agenten anhand eines einzelnen Kriteriums.

## Aufgabe
- Task: ${task.title}
- Jurisdiktion: ${task.jurisdiction}
- Workflow: ${task.workflow}

## Bewertungsregeln
1. Bewerte NUR das angegebene Kriterium — nicht andere Aspekte
2. Sei streng aber fair: "passed" nur wenn das Kriterium eindeutig erfüllt ist
3. Bei unklaren Fällen: "passed: false" mit Begründung
4. Confidence: 1.0 = sehr sicher, 0.5 = unsicher, 0.0 = gar nicht sicher
5. Antworte IMMER in folgendem JSON-Format:

\`\`\`json
{
  "passed": true|false,
  "reasoning": "Detaillierte Begründung auf Deutsch",
  "confidence": 0.0-1.0
}
\`\`\`

## Wichtig
- Du siehst den Kontext (retrieved law chunks) UND die Agent-Ausgabe
- Prüfe ob die Ausgabe das Kriterium aufgrund des Kontexts erfüllt
- Erfundene Zitate oder ungestützte Behauptungen = FAIL
- Vage Antworten ohne rechtliche Substanz = FAIL`;
}

/**
 * Build the user prompt for judging a single criterion.
 */
export function buildJudgeUserPrompt(input: JudgeInput): string {
  const { criterion, output, context } = input;

  return `## Kriterium
ID: ${criterion.id}
Beschreibung: ${criterion.description}
Kritisch: ${criterion.critical ? "JA" : "Nein"}
${criterion.judge_question ? `Frage: ${criterion.judge_question}` : ""}
${criterion.expected_answer ? `Erwartete Antwort: ${criterion.expected_answer}` : ""}

## Kontext (retrieved law chunks)
---
${context.slice(0, 8000)}
---

## Agent-Ausgabe
---
${output.slice(0, 8000)}
---

Bewerte dieses Kriterium. Antworte im JSON-Format.`;
}

// ── JSON Parser (5-Strategy) ──────────────────────────────────────────

/**
 * Robust 5-strategy JSON parser for judge responses.
 * Strategies:
 *   1. Code block extraction (```json ... ```)
 *   2. Brace extraction (first { to last })
 *   3. Direct JSON.parse
 *   4. Fix common issues (trailing commas, single quotes)
 *   5. Regex fallback
 */
export function parseJudgeJSON(
  raw: string
): { passed: boolean; reasoning: string; confidence: number } | null {
  if (!raw || raw.trim() === "") return null;

  // Strategy 1: Code block extraction
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const parsed = tryParse(codeBlockMatch[1]!);
    if (parsed) return parsed;
  }

  // Strategy 2: Brace extraction
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const extracted = raw.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(extracted);
    if (parsed) return parsed;
  }

  // Strategy 3: Direct parse
  const directParsed = tryParse(raw);
  if (directParsed) return directParsed;

  // Strategy 4: Fix common issues
  const fixed = raw
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/'/g, '"')
    .replace(/(\w+):/g, '"$1":');
  const fixedParsed = tryParse(fixed);
  if (fixedParsed) return fixedParsed;

  // Strategy 5: Regex fallback
  const passedMatch = raw.match(/"passed"\s*:\s*(true|false)/i);
  const reasoningMatch = raw.match(/"reasoning"\s*:\s*"([^"]*)"/i);
  const confidenceMatch = raw.match(/"confidence"\s*:\s*([\d.]+)/i);

  if (passedMatch) {
    return {
      passed: passedMatch[1]!.toLowerCase() === "true",
      reasoning: reasoningMatch?.[1] ?? "No reasoning provided",
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]!) : 0.5,
    };
  }

  return null;
}

function tryParse(s: string): { passed: boolean; reasoning: string; confidence: number } | null {
  try {
    const obj = JSON.parse(s);
    if (typeof obj.passed === "boolean" && typeof obj.reasoning === "string") {
      return {
        passed: obj.passed,
        reasoning: obj.reasoning,
        confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

// ── Judge Execution ───────────────────────────────────────────────────

/**
 * Run a single criterion through the LLM judge.
 *
 * @param input - Judge input (task, output, context, criterion)
 * @param config - Judge configuration
 * @param chatFn - Injected chat function (uses gatewayChat in production)
 */
export async function judgeCriterion(
  input: JudgeInput,
  config: JudgeConfig,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<JudgeResponse> {
  const system = buildJudgeSystemPrompt(input.task);
  const userPrompt = buildJudgeUserPrompt(input);

  const chatOpts: ChatOpts = {
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: config.max_tokens,
    temperature: config.temperature,
    responseFormat: { type: "json_object" },
  };

  // Add thinking config for Opus
  if (config.thinking) {
    chatOpts.thinking = config.thinking;
  }

  try {
    const result = await chatFn(chatOpts);
    const parsed = parseJudgeJSON(result.text);

    if (!parsed) {
      return {
        passed: false,
        reasoning: `Failed to parse judge response: ${result.text.slice(0, 200)}`,
        confidence: 0,
        raw_response: result.text,
        model: config.primary_model,
      };
    }

    return {
      passed: parsed.passed,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
      raw_response: result.text,
      model: config.primary_model,
    };
  } catch (err) {
    return {
      passed: false,
      reasoning: `Judge error: ${(err as Error).message}`,
      confidence: 0,
      raw_response: "",
      model: config.primary_model,
    };
  }
}

/**
 * Run all LLM judge criteria for a task.
 * Returns CriterionResult[] for each llm_judge criterion.
 */
export async function judgeAllCriteria(
  task: Task,
  output: string,
  context: string,
  config: JudgeConfig,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<CriterionResult[]> {
  const llmCriteria = task.criteria.filter((c) => c.check_type === "llm_judge");

  const results: CriterionResult[] = [];

  for (const criterion of llmCriteria) {
    const input: JudgeInput = { task, output, context, criterion };
    const response = await judgeCriterion(input, config, chatFn);

    results.push({
      criterion_id: criterion.id,
      passed: response.passed,
      details: response.reasoning,
      critical: criterion.critical,
      score: response.passed ? 1.0 : 0.0,
      judge_raw_response: response.raw_response,
      confidence: response.confidence,
    });
  }

  return results;
}

/**
 * Run cross-family verification: primary judge + secondary judge.
 * If both agree → use that result.
 * If they disagree → use the more conservative (fail) result with lower confidence.
 */
export async function crossFamilyJudge(
  input: JudgeInput,
  primaryConfig: JudgeConfig,
  secondaryConfig: JudgeConfig | undefined,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<{
  primary: JudgeResponse;
  secondary?: JudgeResponse;
  finalPassed: boolean;
  agreement: boolean;
}> {
  const primary = await judgeCriterion(input, primaryConfig, chatFn);

  if (!secondaryConfig) {
    return { primary, finalPassed: primary.passed, agreement: true };
  }

  const secondary = await judgeCriterion(input, secondaryConfig, chatFn);
  const agreement = primary.passed === secondary.passed;

  // If disagreement: use the more conservative result (fail)
  const finalPassed = agreement ? primary.passed : false;

  return { primary, secondary, finalPassed, agreement };
}
