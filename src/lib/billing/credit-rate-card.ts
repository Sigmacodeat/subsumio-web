/**
 * Token-Based Credit Rate Card — Goldstandard wie OpenAI/ChatGPT (April 2026).
 *
 * Statt fixer Credits pro Operation (CREDIT_COSTS) berechnet diese Rate Card
 * Credits token-genaue pro Modell und Token-Typ (input / cached input / output).
 *
 * 1 Credit = 1 EUR (wie bestehende CREDIT_PACKS).
 * Rates: credits per 1M tokens, mit 12× Marge über kanonischen API-Preisen.
 * Aligned mit saas-pricing.ts (Solo Plan: 12× markup → 91.7% Marge).
 * Cached-Input Rate = 10% von Input (Anthropic Prompt Caching: 50-80% Cache-Hits).
 *
 * Formel (wie OpenAI Rate Card):
 *   total_credits = (input_tokens      / 1M × input_rate)
 *                 + (cached_tokens     / 1M × cached_rate)
 *                 + (cache_create_tokens / 1M × cache_create_rate)
 *                 + (output_tokens     / 1M × output_rate)
 *
 * Cache-Create (Anthropic Prompt Caching Write): 1.25× input price —
 * Anthropic charges cache writes at a premium over base input because
 * the write amortises across future cache reads. Pre-fix, this component
 * was silently dropped from the cost formula, undercharging pipelines
 * that heavily populate the cache (first-layer forensic scans).
 *
 * Quellen:
 *   - OpenAI Codex Rate Card (April 2026): credits per 1M input/cached/output
 *   - Stripe Usage-Based Billing (2026): token-based metering
 *   - Stigg Token-Based Pricing: metering + credit + enforcement + ledger
 *   - Kanonische Preise: server/src/core/model-pricing.ts (Single Source)
 *
 * Backward-compat: CREDIT_COSTS (fixe Werte) bleiben für nicht-Pipeline-Ops
 * (think, deadline_detect, frist_engine). Pipeline-Ops nutzen CREDIT_RATE_CARD.
 *
 * F6 fix: CREDIT_RATE_CARD used to hand-copy numbers derived from
 * CANONICAL_PRICING instead of importing it — the same cross-table drift
 * class flagged in the token-economy audit for src/lib/model-config.ts
 * (GPT-5.5 at $4/$16 here vs $5/$30 canonical). The rates below are now
 * COMPUTED from CANONICAL_PRICING at module load, so a canonical price
 * update propagates automatically instead of silently drifting.
 */

import { CANONICAL_PRICING } from "../../../server/src/core/model-pricing";

/**
 * Credit-Rate pro Modell: credits per 1M tokens.
 * Abgeleitet aus CANONICAL_PRICING mit 12× Marge (aligned mit saas-pricing.ts Solo).
 *
 * Beispiel Haiku 4.5 ($1/$5 per MTok):
 *   input:  $1 × 12 (Marge) = $12 → 12 credits/1M
 *   cached: 12 × 0.1 (10% von input) = 1.2 credits/1M
 *   output: $5 × 12 = $60 → 60 credits/1M
 */
export interface ModelCreditRate {
  /** Credits per 1M input tokens. */
  input: number;
  /** Credits per 1M cached input tokens (10% von input — Anthropic cache read). */
  cachedInput: number;
  /** Credits per 1M cache-create tokens (1.25× input — Anthropic cache write). */
  cacheCreate: number;
  /** Credits per 1M output tokens. */
  output: number;
}

/** Marge über kanonischem API-Preis (server/src/core/model-pricing.ts).
 *  Aligned mit saas-pricing.ts Solo Plan (12× markup → 91.7% Marge).
 *  Previously was 2× (50% Marge) — updated 2026-08-29 based on competitive
 *  analysis: Harvey 85-98.5%, Irys 93%, Legora 70-85%. 12× matches Solo plan. */
const RATE_CARD_MARGIN = 12;
/** Cached-Input-Rate als Anteil der Input-Rate (Anthropic Prompt Caching: 50-80% Cache-Hits). */
const CACHED_INPUT_FACTOR = 0.1;
/** Cache-Create-Rate als Faktor der Input-Rate (Anthropic: cache write = 1.25× input). */
const CACHE_CREATE_FACTOR = 1.25;

/** Rundet auf 4 Nachkommastellen, um Float-Artefakte (0.030000000000000002) zu vermeiden. */
function roundRate(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Leitet eine ModelCreditRate aus CANONICAL_PRICING ab. `fallback` greift
 * nur, wenn das Modell (noch) nicht in CANONICAL_PRICING steht — sollte bei
 * den unten kuratierten IDs nicht vorkommen, ist aber ein sicheres Netz
 * statt eines stillen `undefined`.
 */
function rateFromCanonical(modelId: string, fallback: ModelCreditRate): ModelCreditRate {
  const canonical = CANONICAL_PRICING[modelId];
  if (!canonical) return fallback;
  const input = roundRate(canonical.input * RATE_CARD_MARGIN);
  return {
    input,
    cachedInput: roundRate(input * CACHED_INPUT_FACTOR),
    cacheCreate: roundRate(input * CACHE_CREATE_FACTOR),
    output: roundRate(canonical.output * RATE_CARD_MARGIN),
  };
}

/**
 * Kanonische Credit-Rate-Card. Die MODELL-AUSWAHL wird hier kuratiert (nicht
 * jedes CANONICAL_PRICING-Modell ist für die Pipeline freigegeben) — die
 * RATEN selbst kommen aus CANONICAL_PRICING, nicht aus Handkopie.
 *
 * Bei Preiserhöhungen im API: server/src/core/model-pricing.ts aktualisieren,
 * hier passiert nichts weiter (Drift-Guard-Test prüft die Ableitung).
 */
export const CREDIT_RATE_CARD: Record<string, ModelCreditRate> = {
  // ── Anthropic (DACH-Leader BenGER + Future-Law AT) ──────────────────────
  // BenGER: 97% legal accuracy (OpenMark), sweet-spot für 14 Extraktions-Layer
  "anthropic:claude-haiku-4-5": rateFromCanonical("anthropic:claude-haiku-4-5", {
    input: 2,
    cachedInput: 0.2,
    cacheCreate: 2.5,
    output: 10,
  }),
  "anthropic:claude-haiku-4-5-20251001": rateFromCanonical("anthropic:claude-haiku-4-5-20251001", {
    input: 2,
    cachedInput: 0.2,
    cacheCreate: 2.5,
    output: 10,
  }),
  // BenGER #2 (83.37), halber Sonnet-4.6-Preis, für 11 Reasoning-Layer
  "anthropic:claude-sonnet-5": rateFromCanonical("anthropic:claude-sonnet-5", {
    input: 4,
    cachedInput: 0.4,
    cacheCreate: 5,
    output: 20,
  }),
  "anthropic:claude-sonnet-4-6": rateFromCanonical("anthropic:claude-sonnet-4-6", {
    input: 6,
    cachedInput: 0.6,
    cacheCreate: 7.5,
    output: 30,
  }),
  // BenGER Benchathon #1 (69.3), AT-Future-Law Gesamtsieger, für Subsumption + Drafter
  "anthropic:claude-opus-4-8": rateFromCanonical("anthropic:claude-opus-4-8", {
    input: 10,
    cachedInput: 1,
    cacheCreate: 12.5,
    output: 50,
  }),
  "anthropic:claude-opus-4-7": rateFromCanonical("anthropic:claude-opus-4-7", {
    input: 10,
    cachedInput: 1,
    cacheCreate: 12.5,
    output: 50,
  }),
  // Premium-Tier
  "anthropic:claude-fable-5": rateFromCanonical("anthropic:claude-fable-5", {
    input: 20,
    cachedInput: 2,
    cacheCreate: 25,
    output: 100,
  }),

  // ── OpenAI (BenGER #1 overall) ──────────────────────────────────────────
  // BenGER #1 (83.5), ZJS #1 (60.4), für Opponent-Simulator + Ensemble
  "openai:gpt-5.4": rateFromCanonical("openai:gpt-5.4", {
    input: 10,
    cachedInput: 1,
    cacheCreate: 12.5,
    output: 30,
  }),
  "openai:gpt-5.4-mini": rateFromCanonical("openai:gpt-5.4-mini", {
    input: 1,
    cachedInput: 0.1,
    cacheCreate: 1.25,
    output: 4,
  }),
  "openai:gpt-5.4-nano": rateFromCanonical("openai:gpt-5.4-nano", {
    input: 0.5,
    cachedInput: 0.05,
    cacheCreate: 0.625,
    output: 2,
  }),
  // HAQQ #1 accuracy (8.41/10), 3% hallucination, für Ensemble Critic
  "openai:gpt-5.5": rateFromCanonical("openai:gpt-5.5", {
    input: 10,
    cachedInput: 1,
    cacheCreate: 12.5,
    output: 60,
  }),
  "openai:gpt-5": rateFromCanonical("openai:gpt-5", {
    input: 10,
    cachedInput: 1,
    cacheCreate: 12.5,
    output: 30,
  }),

  // ── Google (OpenMark 100%, AT-Future-Law Verträge 16/17) ────────────────
  "google:gemini-3-pro": rateFromCanonical("google:gemini-3-pro", {
    input: 4,
    cachedInput: 0.4,
    cacheCreate: 5,
    output: 24,
  }),
  "google:gemini-2.0-flash": rateFromCanonical("google:gemini-2.0-flash", {
    input: 0.2,
    cachedInput: 0.02,
    cacheCreate: 0.25,
    output: 0.8,
  }),
  "google:gemini-2-flash": rateFromCanonical("google:gemini-2-flash", {
    input: 0.2,
    cachedInput: 0.02,
    cacheCreate: 0.25,
    output: 0.8,
  }),

  // ── DeepSeek (BenGER #5, Ensemble Diversität) ───────────────────────────
  // BenGER #8 (71.3), günstigster Ensemble-Teilnehmer
  "deepseek:deepseek-v4-flash": rateFromCanonical("deepseek:deepseek-v4-flash", {
    input: 0.28,
    cachedInput: 0.028,
    cacheCreate: 0.35,
    output: 0.56,
  }),
  "deepseek:deepseek-v4-pro": rateFromCanonical("deepseek:deepseek-v4-pro", {
    input: 0.28,
    cachedInput: 0.028,
    cacheCreate: 0.35,
    output: 0.56,
  }),
  "deepseek:deepseek-chat": rateFromCanonical("deepseek:deepseek-chat", {
    input: 0.28,
    cachedInput: 0.028,
    cacheCreate: 0.35,
    output: 0.56,
  }),

  // ── xAI Grok (HAQQ #2, schnell) ─────────────────────────────────────────
  "xai:grok-4.3": rateFromCanonical("xai:grok-4.3", {
    input: 2.5,
    cachedInput: 0.25,
    cacheCreate: 3.125,
    output: 5,
  }),

  // ── Mistral (EU-hosted, GDPR) ───────────────────────────────────────────
  "mistral:mistral-large-3": rateFromCanonical("mistral:mistral-large-3", {
    input: 1,
    cachedInput: 0.1,
    cacheCreate: 1.25,
    output: 3,
  }),
  "mistral:mistral-small-3.2": rateFromCanonical("mistral:mistral-small-3.2", {
    input: 0.2,
    cachedInput: 0.02,
    cacheCreate: 0.25,
    output: 0.6,
  }),
};

/**
 * Default-Rate für Modelle die nicht in der Rate Card stehen.
 * Verwendet Haiku-Preise als sicheres Minimum (günstigstes DACH-taugliches Modell).
 */
export const DEFAULT_CREDIT_RATE: ModelCreditRate = {
  input: 2,
  cachedInput: 0.2,
  cacheCreate: 2.5,
  output: 10,
};

/**
 * Credit-Rate für ein Modell abrufen. Fallback auf DEFAULT_CREDIT_RATE.
 */
export function getCreditRate(modelId: string): ModelCreditRate {
  return CREDIT_RATE_CARD[modelId] ?? DEFAULT_CREDIT_RATE;
}

/**
 * Token-Usage pro LLM-Call.
 */
export interface TokenUsage {
  modelId: string;
  inputTokens: number;
  cachedInputTokens: number;
  /** Cache-create (prompt-cache write) tokens — Anthropic charges 1.25× input.
   *  Optional: older callers and tests don't set it; calculateTokenCredits
   *  defaults to 0. */
  cacheCreateTokens?: number;
  outputTokens: number;
}

/**
 * Credits für einen LLM-Call berechnen (token-basiert, wie OpenAI Rate Card).
 *
 * Formel:
 *   credits = (input / 1M × input_rate)
 *           + (cached  / 1M × cached_rate)
 *           + (output  / 1M × output_rate)
 *
 * @returns Credits (float, 1 credit = 1 EUR)
 */
export function calculateTokenCredits(usage: TokenUsage): number {
  const rate = getCreditRate(usage.modelId);
  const inputCredits = (usage.inputTokens / 1_000_000) * rate.input;
  const cachedCredits = (usage.cachedInputTokens / 1_000_000) * rate.cachedInput;
  // cacheCreateTokens is optional — older callers (and tests) don't set it.
  // Defaulting to 0 avoids NaN when the field is missing.
  const cacheCreateTokens = usage.cacheCreateTokens ?? 0;
  const cacheCreateCredits = (cacheCreateTokens / 1_000_000) * rate.cacheCreate;
  const outputCredits = (usage.outputTokens / 1_000_000) * rate.output;
  return roundCredits(inputCredits + cachedCredits + cacheCreateCredits + outputCredits);
}

/**
 * Credits für mehrere LLM-Calls aufsummieren (z.B. ganze Pipeline).
 */
export function calculateTotalCredits(usages: TokenUsage[]): number {
  return roundCredits(usages.reduce((sum, u) => sum + calculateTokenCredits(u), 0));
}

/**
 * Credits auf 2 Nachkommastellen runden (EUR-cent-Genauigkeit).
 */
export function roundCredits(credits: number): number {
  return Math.round(credits * 100) / 100;
}

/**
 * Pre-Pipeline Estimate: Aktgröße → Token-Schätzung → Credit-Schätzung.
 *
 * Schätzt Token-Verbrauch basierend auf Aktgröße (Seiten) und Pipeline-Tier.
 * Berücksichtigt Cache-Hits (60% bei Anthropic) und Modell-Mix.
 *
 * @param pages Anzahl Seiten der Akte
 * @param tier Pipeline-Tier (1=einfach 5 Layer, 2=mittel 13 Layer, 3=komplex 27 Layer)
 * @returns geschätzte Credits + Token-Breakdown
 */
export interface PipelineEstimate {
  estimatedCredits: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCachedTokens: number;
  estimatedCacheCreateTokens: number;
  tier: 1 | 2 | 3;
  layerCount: number;
}

// Token-Schätzung pro Seite (≈1500 tokens pro Seite bei juristischen Dokumenten)
const TOKENS_PER_PAGE = 1500;

// Pipeline-Tier-Config: Layer-Anzahl + Modell-Mix
const TIER_CONFIG: Record<
  1 | 2 | 3,
  {
    layers: number;
    // Anteil der Layer pro Modell-Tier (Haiku / Sonnet / Opus)
    haikuShare: number;
    sonnetShare: number;
    opusShare: number;
    // Output-Token-Faktor (output = input × factor)
    outputFactor: number;
    // Cache-Hit-Rate (Anthropic Prompt Caching)
    cacheHitRate: number;
    // Context-Decay: nicht jeder Layer bekommt die volle Akte als Input.
    // Erste Layer (forensic, on-scanner): volle Akte. Folgende Layer bekommen
    // Zusammenfassungen + relevante Chunks (≈15-20% der Akte).
    // contextDecay = durchschnittlicher Input-Faktor pro Layer (0-1).
    contextDecay: number;
  }
> = {
  // Tier 1: 5 Layer, wenig Wiederholung → 0.5 (halbvolle Akte avg)
  1: {
    layers: 5,
    haikuShare: 0.8,
    sonnetShare: 0.2,
    opusShare: 0,
    outputFactor: 0.3,
    cacheHitRate: 0.6,
    contextDecay: 0.5,
  },
  // Tier 2: 13 Layer, moderate Wiederholung → 0.3
  2: {
    layers: 13,
    haikuShare: 0.55,
    sonnetShare: 0.38,
    opusShare: 0.07,
    outputFactor: 0.4,
    cacheHitRate: 0.55,
    contextDecay: 0.3,
  },
  // Tier 3: 27 Layer, viel Wiederverwendung → 0.2 (nur 20% der Akte avg pro Layer)
  3: {
    layers: 27,
    haikuShare: 0.52,
    sonnetShare: 0.41,
    opusShare: 0.07,
    outputFactor: 0.5,
    cacheHitRate: 0.5,
    contextDecay: 0.2,
  },
};

/**
 * Pre-Pipeline Estimate berechnen.
 */
export function estimatePipelineCredits(pages: number, tier: 1 | 2 | 3): PipelineEstimate {
  const config = TIER_CONFIG[tier];
  const baseInputTokens = pages * TOKENS_PER_PAGE;

  // Context-Decay: nicht jeder Layer bekommt die volle Akte.
  // Erste Layer (forensic, on-scanner): volle Akte. Folgende Layer bekommen
  // Zusammenfassungen + relevante Chunks (≈15-20% der Akte).
  // contextDecay = durchschnittlicher Input-Faktor pro Layer (0-1).
  const avgInputPerLayer = baseInputTokens * config.contextDecay;
  const totalInputTokens = avgInputPerLayer * config.layers;
  const totalOutputTokens = totalInputTokens * config.outputFactor;
  const totalCachedTokens = totalInputTokens * config.cacheHitRate;
  const freshInputTokens = totalInputTokens - totalCachedTokens;
  // Cache-write tokens: each unique cached chunk is written once (first layer),
  // then read on subsequent layers. Write volume ≈ total cached reads / layers.
  const totalCacheCreateTokens = totalCachedTokens / config.layers;

  // Credit-Berechnung pro Modell-Tier
  const haikuRate = getCreditRate("anthropic:claude-haiku-4-5");
  const sonnetRate = getCreditRate("anthropic:claude-sonnet-5");
  const opusRate = getCreditRate("anthropic:claude-opus-4-8");

  const haikuInput = freshInputTokens * config.haikuShare;
  const sonnetInput = freshInputTokens * config.sonnetShare;
  const opusInput = freshInputTokens * config.opusShare;

  const haikuCached = totalCachedTokens * config.haikuShare;
  const sonnetCached = totalCachedTokens * config.sonnetShare;
  const opusCached = totalCachedTokens * config.opusShare;

  const haikuCacheCreate = totalCacheCreateTokens * config.haikuShare;
  const sonnetCacheCreate = totalCacheCreateTokens * config.sonnetShare;
  const opusCacheCreate = totalCacheCreateTokens * config.opusShare;

  const haikuOutput = totalOutputTokens * config.haikuShare;
  const sonnetOutput = totalOutputTokens * config.sonnetShare;
  const opusOutput = totalOutputTokens * config.opusShare;

  const credits =
    // Haiku
    (haikuInput / 1e6) * haikuRate.input +
    (haikuCached / 1e6) * haikuRate.cachedInput +
    (haikuCacheCreate / 1e6) * haikuRate.cacheCreate +
    (haikuOutput / 1e6) * haikuRate.output +
    // Sonnet
    (sonnetInput / 1e6) * sonnetRate.input +
    (sonnetCached / 1e6) * sonnetRate.cachedInput +
    (sonnetCacheCreate / 1e6) * sonnetRate.cacheCreate +
    (sonnetOutput / 1e6) * sonnetRate.output +
    // Opus
    (opusInput / 1e6) * opusRate.input +
    (opusCached / 1e6) * opusRate.cachedInput +
    (opusCacheCreate / 1e6) * opusRate.cacheCreate +
    (opusOutput / 1e6) * opusRate.output;

  return {
    estimatedCredits: roundCredits(credits),
    estimatedInputTokens: Math.round(totalInputTokens),
    estimatedOutputTokens: Math.round(totalOutputTokens),
    estimatedCachedTokens: Math.round(totalCachedTokens),
    estimatedCacheCreateTokens: Math.round(totalCacheCreateTokens),
    tier,
    layerCount: config.layers,
  };
}

/**
 * Tier-Empfehlung basierend auf Aktgröße (für Front-Door Classifier).
 *
 - <20 Seiten → Tier 1 (einfache Klage, Fristencheck)
 - 20-100 Seiten → Tier 2 (normale Streitigkeit)
 - >100 Seiten → Tier 3 (komplexer Fall, Multi-Party)
 */
export function recommendTier(pages: number): 1 | 2 | 3 {
  if (pages < 20) return 1;
  if (pages <= 100) return 2;
  return 3;
}
