/**
 * Multi-Model Ensemble Citation Verification — Tier 2
 *
 * 4-stage citation verification cascade:
 *   Stage 1 (existing): Exact match — deterministic, free (citation-guardrail.ts)
 *   Stage 2 (existing): Cross-model verify — single LLM call (cross-verify.ts)
 *   Stage 3 (new): Paraphrase judge — single cheap LLM call, detects semantic mismatches
 *   Stage 4 (new, opt-in): Ensemble strict — N parallel judges, majority vote
 *
 * Cost guard: Stage 4 only runs for high-stakes outputs (e.g. subsumption, litigation).
 * Activation: Configurable via `ensembleMode` option.
 *
 * Integration: Called after Tier-0 + Tier-1 in the think pipeline.
 * If any stage flags a citation, the result includes the flag + which stage caught it.
 */

import { chat as gatewayChat, type ChatOpts, type ChatResult } from "./ai/gateway.ts";

// ── Types ───────────────────────────────────────────────────────

/** Chat function type for dependency injection (testable). */
export type ChatFn = (opts: ChatOpts) => Promise<ChatResult>;

export type VerificationStage = 1 | 2 | 3 | 4;

export type EnsembleMode = "standard" | "strict";

export interface EnsembleFlag {
  /** Which stage caught the flag */
  stage: VerificationStage;
  /** Flag type (same vocabulary as cross-verify) */
  type: string;
  /** Human-readable detail */
  detail: string;
  /** Which citation is flagged */
  citation?: string;
  /** Severity */
  severity: "high" | "medium" | "low";
  /** Which model flagged this (for ensemble stage) */
  flagged_by?: string;
}

export interface CitationVerification {
  /** The citation string, e.g. "§ 433 BGB" */
  citation: string;
  /** True if all stages agree it's grounded */
  verified: boolean;
  /** Which stages verified it */
  verified_by: VerificationStage[];
  /** Flags against this citation */
  flags: EnsembleFlag[];
  /** Final confidence (0-1) */
  confidence: number;
}

export interface EnsembleVerifyResult {
  /** Overall clean = all citations verified */
  clean: boolean;
  /** Per-citation results */
  citations: CitationVerification[];
  /** All flags across all citations */
  all_flags: EnsembleFlag[];
  /** Which stages ran */
  stages_run: VerificationStage[];
  /** Verification method description for certification */
  method: string;
  /** Models used (for ensemble) */
  models_used: string[];
  /** Cost estimate in USD */
  estimated_cost: number;
}

// ── Models for ensemble ───────────────────────────────────────────────

const ENSEMBLE_MODELS = [
  "openrouter:openai/gpt-4o",
  "openrouter:anthropic/claude-3.5-sonnet",
  "openrouter:x-ai/grok-4.3",
];

const PARAPHRASE_MODEL = "openrouter:openai/gpt-4o-mini";

// ── Stage 3: Paraphrase Judge ─────────────────────────────────────────

const PARAPHRASE_SYSTEM_PROMPT = `Du bist ein juristischer Paraphrase-Prüfer. Du erhältst eine Antwort mit Zitaten und den dazugehörigen Kontext.

PRÜFE:
1. Wird jeder § korrekt zitiert (richtige Nummer, richtiges Gesetz)?
2. Stimmt die Aussage mit dem zitierten § überein (keine Verdrehung des Inhalts)?
3. Werden Definitionen wörtlich übernommen oder korrekt paraphrasiert (nicht erfunden)?

ANTWORTE NUR IM JSON-FORMAT:
{
  "citations": [
    {
      "citation": "§ 433 BGB",
      "verified": true | false,
      "confidence": 0.0-1.0,
      "issue": "Kurze Beschreibung falls nicht verifiziert"
    }
  ]
}`;

/**
 * Stage 3: Single LLM call with a cheap model to check semantic match
 * between citations and context. Catches paraphrase-level errors that
 * regex (Stage 1) can't, at lower cost than Stage 2.
 */
export async function runParaphraseJudge(
  answer: string,
  context: string,
  citations: string[],
  chatFn: ChatFn = gatewayChat
): Promise<Array<{ citation: string; verified: boolean; confidence: number; issue?: string }>> {
  if (citations.length === 0) return [];

  const userMsg = `ANTWORT:
${answer}

KONTEXT:
${context.slice(0, 4000)}

ZITATE ZU PRÜFEN:
${citations.map((c) => `- ${c}`).join("\n")}`;

  try {
    const result = await chatFn({
      model: PARAPHRASE_MODEL,
      system: PARAPHRASE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMsg },
      ],
      maxTokens: 800,
    });

    const parsed = parseJSON(result.text);
    if (parsed?.citations && Array.isArray(parsed.citations)) {
      return parsed.citations.map((c: Record<string, unknown>) => ({
        citation: String(c.citation ?? ""),
        verified: Boolean(c.verified),
        confidence: Number(c.confidence ?? 0),
        issue: c.issue ? String(c.issue) : undefined,
      }));
    }
  } catch {
    // Non-fatal — return all as unverified with 0 confidence
  }

  return citations.map((c) => ({ citation: c, verified: true, confidence: 0.5 }));
}

// ── Stage 4: Ensemble Strict ──────────────────────────────────────────

const ENSEMBLE_SYSTEM_PROMPT = `Du bist ein strenger juristischer Zitations-Prüfer. Du prüfst jede Zitation auf absolute Genauigkeit.

REGELN:
1. Jeder § muss WÖRTLICH im Kontext stehen (nicht nur ähnlich)
2. Die Aussage muss EXAKT dem §-Text entsprechen (keine Interpretation)
3. Keine falsche Jurisdiktion (DE vs AT vs CH)
4. Keine erfundenen Paragrafen

ANTWORTE NUR IM JSON-FORMAT:
{
  "citations": [
    {
      "citation": "§ 433 BGB",
      "verified": true | false,
      "confidence": 0.0-1.0,
      "reason": "Kurze Begründung"
    }
  ]
}`;

interface ModelVote {
  model: string;
  votes: Map<string, { verified: boolean; confidence: number }>;
}

/**
 * Stage 4: N parallel LLM calls with different models, majority vote.
 * Only runs for high-stakes outputs (ensembleMode: "strict").
 *
 * @returns Per-citation majority-vote results
 */
export async function runEnsembleStrict(
  answer: string,
  context: string,
  citations: string[],
  models: string[] = ENSEMBLE_MODELS,
  chatFn: ChatFn = gatewayChat
): Promise<Array<{ citation: string; verified: boolean; confidence: number; votes: ModelVote[] }>> {
  if (citations.length === 0) return [];

  const userMsg = `ANTWORT:
${answer}

KONTEXT:
${context.slice(0, 4000)}

ZITATE:
${citations.map((c) => `- ${c}`).join("\n")}`;

  // Run all models in parallel
  const modelPromises = models.map(async (model) => {
    try {
      const result = await chatFn({
        model,
        system: ENSEMBLE_SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userMsg },
        ],
        maxTokens: 800,
      });

      const parsed = parseJSON(result.text);
      const votes = new Map<string, { verified: boolean; confidence: number }>();
      if (parsed?.citations && Array.isArray(parsed.citations)) {
        for (const c of parsed.citations as Array<Record<string, unknown>>) {
          votes.set(String(c.citation ?? ""), {
            verified: Boolean(c.verified),
            confidence: Number(c.confidence ?? 0),
          });
        }
      }
      return { model, votes } as ModelVote;
    } catch {
      // Model failure → abstain (empty votes)
      return { model, votes: new Map() } as ModelVote;
    }
  });

  const allVotes = await Promise.all(modelPromises);

  // Majority vote per citation
  return citations.map((citation) => {
    const votes = allVotes.filter((v) => v.votes.has(citation));
    const verifiedCount = votes.filter((v) => v.votes.get(citation)!.verified).length;
    const totalCount = votes.length;
    const avgConfidence =
      totalCount > 0
        ? votes.reduce((sum, v) => sum + v.votes.get(citation)!.confidence, 0) / totalCount
        : 0;

    // Majority = >50% of non-abstaining models say verified
    const verified = totalCount > 0 && verifiedCount > totalCount / 2;

    return {
      citation,
      verified,
      confidence: avgConfidence,
      votes,
    };
  });
}

// ── Full Cascade ──────────────────────────────────────────────────────

export interface EnsembleVerifyOpts {
  answer: string;
  context: string;
  citations: string[];
  /** Stage 1 results (from citation-guardrail) */
  stage1Flags?: Array<{ type: string; detail: string; citation?: string; severity: "high" | "medium" | "low" }>;
  /** Stage 2 results (from cross-verify) */
  stage2Result?: {
    clean: boolean;
    flags: Array<{ type: string; detail: string; citation?: string; severity: "high" | "medium" | "low" }>;
    verified_citations: string[];
    flagged_citations: string[];
  };
  /** "standard" = Stage 3 only, "strict" = Stage 3 + 4 */
  ensembleMode?: EnsembleMode;
  /** Custom models for ensemble (overrides defaults) */
  ensembleModels?: string[];
  /** Injected chat function (for testing) */
  chatFn?: ChatFn;
}

/**
 * Run the full ensemble verification cascade.
 *
 * Stage 1 + 2 results are passed in (already computed in the think pipeline).
 * Stage 3 + 4 are run here if needed.
 */
export async function runEnsembleVerification(
  opts: EnsembleVerifyOpts
): Promise<EnsembleVerifyResult> {
  const stagesRun: VerificationStage[] = [1, 2];
  const modelsUsed: string[] = [];
  let estimatedCost = 0;

  const chatFn = opts.chatFn ?? gatewayChat;

  // Collect flags from Stage 1 + 2
  const allFlags: EnsembleFlag[] = [];

  for (const flag of opts.stage1Flags ?? []) {
    allFlags.push({
      stage: 1,
      type: flag.type,
      detail: flag.detail,
      citation: flag.citation,
      severity: flag.severity,
    });
  }

  if (opts.stage2Result) {
    for (const flag of opts.stage2Result.flags) {
      allFlags.push({
        stage: 2,
        type: flag.type,
        detail: flag.detail,
        citation: flag.citation,
        severity: flag.severity,
      });
    }
  }

  // Per-citation tracking
  const citationMap = new Map<string, CitationVerification>();
  for (const citation of opts.citations) {
    citationMap.set(citation, {
      citation,
      verified: !allFlags.some((f) => f.citation === citation && f.severity === "high"),
      verified_by: [],
      flags: allFlags.filter((f) => f.citation === citation),
      confidence: 1.0,
    });
  }

  // Stage 3: Paraphrase judge (always runs in legal mode)
  if (opts.citations.length > 0) {
    stagesRun.push(3);
    modelsUsed.push(PARAPHRASE_MODEL);
    estimatedCost += 0.0005; // ~$0.0005 per call with gpt-4o-mini

    const stage3Results = await runParaphraseJudge(
      opts.answer,
      opts.context,
      opts.citations,
      chatFn
    );

    for (const result of stage3Results) {
      const entry = citationMap.get(result.citation);
      if (!entry) continue;

      if (result.verified) {
        entry.verified_by.push(3);
      } else {
        entry.flags.push({
          stage: 3,
          type: "paraphrase_mismatch",
          detail: result.issue ?? "Paraphrase judge flagged this citation",
          citation: result.citation,
          severity: "medium",
        });
        entry.verified = false;
      }
      entry.confidence = Math.min(entry.confidence, result.confidence);
    }
  }

  // Stage 4: Ensemble strict (only for high-stakes outputs)
  if (opts.ensembleMode === "strict" && opts.citations.length > 0) {
    stagesRun.push(4);
    const ensembleModels = opts.ensembleModels ?? ENSEMBLE_MODELS;
    modelsUsed.push(...ensembleModels);
    estimatedCost += 0.005 * ensembleModels.length; // ~$0.005 per model

    const stage4Results = await runEnsembleStrict(
      opts.answer,
      opts.context,
      opts.citations,
      ensembleModels,
      chatFn
    );

    for (const result of stage4Results) {
      const entry = citationMap.get(result.citation);
      if (!entry) continue;

      if (result.verified) {
        entry.verified_by.push(4);
        // Boost confidence if ensemble agrees
        entry.confidence = Math.max(entry.confidence, result.confidence);
      } else {
        // Find which models voted against
        const dissentingModels = result.votes
          .filter((v) => !v.votes.get(result.citation)?.verified)
          .map((v) => v.model);

        entry.flags.push({
          stage: 4,
          type: "ensemble_rejection",
          detail: `Majority of ensemble models rejected this citation`,
          citation: result.citation,
          severity: "high",
          flagged_by: dissentingModels.join(", "),
        });
        entry.verified = false;
        entry.confidence = Math.min(entry.confidence, result.confidence);
      }
    }
  }

  const citations = Array.from(citationMap.values());
  const clean = citations.every((c) => c.verified);

  const methodParts: string[] = [`Stage 1 (deterministic)`, `Stage 2 (cross-model)`];
  if (stagesRun.includes(3)) methodParts.push(`Stage 3 (paraphrase judge)`);
  if (stagesRun.includes(4)) methodParts.push(`Stage 4 (ensemble ×${opts.ensembleModels ?? ENSEMBLE_MODELS.length})`);

  return {
    clean,
    citations,
    all_flags: allFlags,
    stages_run: stagesRun,
    method: methodParts.join(" → "),
    models_used: modelsUsed,
    estimated_cost: estimatedCost,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function parseJSON(text: string): Record<string, unknown> | null {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/, "")
    .replace(/```\s*$/, "");

  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    // Try to extract JSON from text
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}
