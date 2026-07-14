/**
 * LAB-DACH v3 — Unified Blinded Rubric Judge
 *
 * T2.4: All agent candidates are evaluated with the SAME judge stack.
 * The judge never learns which agent model produced the output.
 *
 * Design:
 *   - Same primary + secondary judge for ALL candidates (blinded)
 *   - Verdict status: pass | fail | uncertain | not_judgeable | judge_error
 *   - Evidence quotes required in every verdict
 *   - Strict 2-strategy JSON parser — parse failures are fail-closed (judge_error)
 *   - No creative JSON recovery attempts
 */

import type { Criterion, CriterionResult, JudgeStatus, Task } from "./types.ts";

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

export interface JudgeVerdict {
  /** Unified verdict status */
  status: JudgeStatus;
  /** Derived boolean: true only if status === "pass" */
  passed: boolean;
  /** Detailed explanation */
  reasoning: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Evidence quotes from output/context supporting the verdict */
  evidence_quotes: string[];
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
  /** Real token usage from provider (live mode only) */
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  /** Model that actually answered (live mode only) */
  model?: string;
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
 * Get unified blinded judge configuration.
 *
 * T2.4: The SAME primary + secondary judge is used for ALL agent candidates.
 * The judge model is NOT selected based on the agent model — the judge
 * never knows which agent produced the output.
 *
 * Primary: Opus (strongest reasoning, with thinking mode)
 * Secondary: DeepSeek (independent cross-family verification)
 */
export function getUnifiedJudgeConfig(): {
  primary: JudgeConfig;
  secondary: JudgeConfig;
} {
  return {
    primary: JUDGE_CONFIGS.opus,
    secondary: JUDGE_CONFIGS.deepseek,
  };
}

/**
 * @deprecated Use getUnifiedJudgeConfig() instead.
 * Kept for backward compatibility — delegates to getUnifiedJudgeConfig().
 */
export function getCrossFamilyJudgeConfig(_agentModel: string): {
  primary: JudgeConfig;
  secondary: JudgeConfig;
} {
  return getUnifiedJudgeConfig();
}

// ── Judge Prompt ──────────────────────────────────────────────────────

/**
 * Build the system prompt for the judge.
 */
export function buildJudgeSystemPrompt(task: Task): string {
  return `Du bist ein strenger rechtlicher Gutachter (Judge) für den LAB-DACH Benchmark.

Du bewertest eine KI-Ausgabe anhand eines einzelnen Kriteriums.
Du kennst das Modell, das die Ausgabe produziert hat, NICHT.
Bewerte ausschliesslich die Qualität der Ausgabe.

## Aufgabe
- Task: ${task.title}
- Jurisdiktion: ${task.jurisdiction}
- Workflow: ${task.workflow}

## Bewertungsregeln
1. Bewerte NUR das angegebene Kriterium — nicht andere Aspekte
2. Sei streng aber fair
3. Status-Werte:
   - "pass": Kriterium ist eindeutig erfüllt
   - "fail": Kriterium ist eindeutig NICHT erfüllt
   - "uncertain": Judge kann nicht mit Sicherheit entscheiden (Grenzfall)
   - "not_judgeable": Ausgabe ist zu kurz, leer oder unleserlich zur Bewertung
4. Confidence: 1.0 = sehr sicher, 0.5 = unsicher, 0.0 = gar nicht sicher
5. evidence_quotes: Zitiere 1-3 Textstellen aus der Ausgabe oder dem Kontext,
   die deine Bewertung stützen. Jedes Zitat als separater String im Array.
6. Antworte IMMER in folgendem JSON-Format:

\`\`\`json
{
  "status": "pass" | "fail" | "uncertain" | "not_judgeable",
  "reasoning": "Detaillierte Begründung auf Deutsch",
  "confidence": 0.0-1.0,
  "evidence_quotes": ["Zitat 1...", "Zitat 2..."]
}
\`\`\`

## Wichtig
- Du siehst den Kontext (retrieved law chunks) UND die KI-Ausgabe
- Prüfe ob die Ausgabe das Kriterium aufgrund des Kontexts erfüllt
- Erfundene Zitate oder ungestützte Behauptungen = FAIL
- Vage Antworten ohne rechtliche Substanz = FAIL
- IMMER mindestens ein evidence_quotes-Element angeben`;
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

## KI-Ausgabe
---
${output.slice(0, 8000)}
---

Bewerte dieses Kriterium. Antworte im JSON-Format mit status, reasoning, confidence und evidence_quotes.`;
}

// ── JSON Parser (Strict 2-Strategy, Fail-Closed) ─────────────────────

/**
 * Strict 2-strategy JSON parser for judge responses.
 *
 * T2.4: No creative JSON recovery. Parse failures are fail-closed.
 *
 * Strategies:
 *   1. Code block extraction (```json ... ```)
 *   2. Direct JSON.parse
 *
 * If both fail → return null (caller sets judge_error).
 */
export function parseJudgeJSON(
  raw: string
): {
  status: JudgeStatus;
  reasoning: string;
  confidence: number;
  evidence_quotes: string[];
} | null {
  if (!raw || raw.trim() === "") return null;

  // Strategy 1: Code block extraction
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const parsed = tryParse(codeBlockMatch[1]!);
    if (parsed) return parsed;
  }

  // Strategy 2: Direct parse
  const directParsed = tryParse(raw);
  if (directParsed) return directParsed;

  // Fail-closed: no creative recovery attempts
  return null;
}

function tryParse(s: string): {
  status: JudgeStatus;
  reasoning: string;
  confidence: number;
  evidence_quotes: string[];
} | null {
  try {
    const obj = JSON.parse(s.trim());
    const validStatuses: JudgeStatus[] = ["pass", "fail", "uncertain", "not_judgeable"];
    if (
      typeof obj.status === "string" &&
      validStatuses.includes(obj.status) &&
      typeof obj.reasoning === "string"
    ) {
      return {
        status: obj.status as JudgeStatus,
        reasoning: obj.reasoning,
        confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
        evidence_quotes: Array.isArray(obj.evidence_quotes)
          ? obj.evidence_quotes.filter((q: unknown) => typeof q === "string")
          : [],
      };
    }
    // Backward compat: if old format with "passed" field, convert
    if (typeof obj.passed === "boolean" && typeof obj.reasoning === "string") {
      return {
        status: obj.passed ? "pass" : "fail",
        reasoning: obj.reasoning,
        confidence: typeof obj.confidence === "number" ? obj.confidence : 0.5,
        evidence_quotes: Array.isArray(obj.evidence_quotes)
          ? obj.evidence_quotes.filter((q: unknown) => typeof q === "string")
          : [],
      };
    }
  } catch {
    // ignore — fail-closed
  }
  return null;
}

// ── Judge Execution ───────────────────────────────────────────────────

/**
 * Run a single criterion through the LLM judge.
 *
 * Returns a JudgeVerdict with unified status, evidence quotes, and fail-closed behavior.
 * Parse failures → judge_error (no creative recovery).
 * LLM call failures → judge_error.
 */
export async function judgeCriterion(
  input: JudgeInput,
  config: JudgeConfig,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<JudgeVerdict> {
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
      // Fail-closed: parse error → judge_error
      return {
        status: "judge_error",
        passed: false,
        reasoning: `Parsefehler: Judge-Antwort nicht parsebar. Fail-closed. Erste 200 Zeichen: ${result.text.slice(0, 200)}`,
        confidence: 0,
        evidence_quotes: [],
        raw_response: result.text,
        model: config.primary_model,
      };
    }

    return {
      status: parsed.status,
      passed: parsed.status === "pass",
      reasoning: parsed.reasoning,
      confidence: parsed.confidence,
      evidence_quotes: parsed.evidence_quotes,
      raw_response: result.text,
      model: config.primary_model,
    };
  } catch (err) {
    // Fail-closed: LLM error → judge_error
    return {
      status: "judge_error",
      passed: false,
      reasoning: `Judge-Fehler: ${(err as Error).message}`,
      confidence: 0,
      evidence_quotes: [],
      raw_response: "",
      model: config.primary_model,
    };
  }
}

/**
 * Run all LLM judge criteria for a task.
 * Returns CriterionResult[] for each llm_judge criterion.
 * Each result includes judge_status, evidence_quotes, and judge_model.
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
      judge_status: response.status,
      evidence_quotes: response.evidence_quotes,
      judge_model: response.model,
    });
  }

  return results;
}

/**
 * Run unified blinded verification: primary judge + secondary judge.
 *
 * Both judges evaluate the same output without knowing the agent model.
 * If both agree → use that result.
 * If they disagree → use the more conservative (fail) result with lower confidence.
 * If either returns judge_error → final verdict is judge_error.
 */
export async function crossFamilyJudge(
  input: JudgeInput,
  primaryConfig: JudgeConfig,
  secondaryConfig: JudgeConfig | undefined,
  chatFn: (opts: ChatOpts) => Promise<ChatResult>
): Promise<{
  primary: JudgeVerdict;
  secondary?: JudgeVerdict;
  finalVerdict: JudgeVerdict;
  finalPassed: boolean;
  agreement: boolean;
}> {
  const primary = await judgeCriterion(input, primaryConfig, chatFn);

  if (!secondaryConfig) {
    return {
      primary,
      finalVerdict: primary,
      finalPassed: primary.passed,
      agreement: true,
    };
  }

  const secondary = await judgeCriterion(input, secondaryConfig, chatFn);

  // If either judge errored, the final verdict is judge_error
  if (primary.status === "judge_error" || secondary.status === "judge_error") {
    const errorVerdict: JudgeVerdict = primary.status === "judge_error" ? primary : secondary;
    return {
      primary,
      secondary,
      finalVerdict: errorVerdict,
      finalPassed: false,
      agreement: false,
    };
  }

  const agreement = primary.status === secondary.status;

  // If disagreement: use the more conservative result
  // Conservative priority: fail > uncertain > not_judgeable > pass
  const statusOrder: Record<JudgeStatus, number> = {
    judge_error: 0,
    fail: 1,
    uncertain: 2,
    not_judgeable: 3,
    pass: 4,
  };

  const finalVerdict = agreement
    ? primary
    : statusOrder[primary.status] <= statusOrder[secondary.status]
      ? primary
      : secondary;

  // On disagreement, final is fail (conservative)
  const finalPassed = agreement ? primary.passed : false;

  return { primary, secondary, finalVerdict, finalPassed, agreement };
}
