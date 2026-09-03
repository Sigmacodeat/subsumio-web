/**
 * SaaS Pricing & Billing Configuration — Subsumio
 *
 * Single source of truth for SELLING prices (what the customer pays),
 * derived from COST prices (what we pay the LLM provider) via a markup
 * multiplier per plan tier.
 *
 * COST prices live in:
 *   - model-pricing.ts        (CANONICAL_PRICING — chat models, USD/1M tokens)
 *   - embedding-pricing.ts    (EMBEDDING_PRICING — embedding models, USD/1M tokens)
 *
 * SELLING prices = COST × markup_multiplier[plan]
 *
 * The markup covers:
 *   - LLM inference cost (passed through)
 *   - Infrastructure (Postgres, storage, bandwidth)
 *   - Pipeline orchestration overhead (27-layer pipeline, retries)
 *   - Margin
 *
 * ── Competitive Analysis (August 2026) ──────────────────────────────
 *
 * Market data verified 2026-08-29:
 *
 *   Vendor        | Price/seat/mo  | Margin    | Markup over LLM cost
 *   --------------|----------------|-----------|---------------------
 *   Harvey        | $1.200-$2.000  | 85-98,5%  | 50-100×
 *   Legora        | $300-$800      | 70-85%    | 10-30×
 *   CoCounsel     | $104-$639      | ~80%      | N/A (bundled)
 *   Irys          | $299 flat      | ~93%      | ~15× ($20 cost)
 *   Spellbook     | $99-$199       | ~50%      | 1× (pass-through)
 *
 * Industry benchmarks (SFAI Labs, Causo Hub, Sequoia):
 *   - AI-inference SaaS gross margin: 50-65%
 *   - Legal AI specifically: 80-85%+
 *   - Inference cost as % of revenue: 3-8% → 12-33× markup
 *   - Sequoia floor for AI business: 50% GM minimum
 *
 * Subsumio positioning:
 *   - Below Harvey ($1.200+) and Legora ($300+) on price
 *   - Above Spellbook ($99) on value (full pipeline, not just contracts)
 *   - Competitive with Irys ($299) but with hybrid billing (seat + usage)
 *   - DACH-first, SMB-friendly, no 20-seat minimums
 *
 * ── Plan Tiers (aligned with public website) ────────────────────────
 *
 * Public website (src/content/audiences.ts) shows:
 *   - Solo:   €249/Monat, 1 Nutzer
 *   - Kanzlei: €1.499/Monat, 5 Nutzer inkl.
 *   - Enterprise: Custom
 *
 * Internal plan mapping:
 *   - solo:       €249/seat, €60 included, 12× markup (91.7% usage margin)
 *   - kanzlei:    €299/seat (€1.499/5 seats), €200 included, 18× markup (94.4%)
 *   - enterprise: custom, BYOK, 1× markup (pass-through)
 *
 * The markup values (12-18×) are calibrated to hit 91-94%+ gross margin,
 * matching Harvey (85-98.5%) and Irys (~93%). This ensures inference
 * cost stays at 6-9% of usage revenue — well within the 3-8% of total
 * revenue benchmark when seat price is included.
 *
 * Currency: EUR (matches existing credit system: 1 Credit = 1 EUR).
 * LLM costs in model-pricing.ts are USD; we convert at module load.
 *
 * ── Credit System Alignment ──────────────────────────────────────────
 *
 * The existing credit system (credit-rate-card.ts) uses 2× margin over
 * canonical API prices. This SaaS pricing layer sits ON TOP of credits:
 *   - Credits are the customer-facing unit (1 Credit = 1 EUR)
 *   - SaaS plans determine the markup (5-8×) and included credits
 *   - saas_usage_ledger tracks internal cost vs sell price (margin)
 *
 * The 2× credit margin is the BASE; the SaaS markup (5-8×) is the
 * RETAIL margin. The difference (5× vs 2×) covers:
 *   - Pipeline orchestration (27 layers, retries, ensemble critic)
 *   - Infrastructure (Postgres, pgvector, storage)
 *   - RAG retrieval (embedding, hybrid search, reranking)
 *   - Platform features (citations, grounding, contradiction detection)
 */

import { CANONICAL_PRICING, type ModelPricing } from "./model-pricing.ts";
import { EMBEDDING_PRICING } from "./embedding-pricing.ts";

// ── Currency Conversion ───────────────────────────────────────────────

/**
 * USD to EUR conversion rate. model-pricing.ts is in USD; we sell in EUR.
 * Update periodically. Source: ECB reference rate.
 */
const USD_TO_EUR = 0.92; // 1 USD = 0.92 EUR (August 2026)

// ── Plan Definitions ──────────────────────────────────────────────────

export type PlanTier = "solo" | "kanzlei" | "enterprise";

export interface PlanConfig {
  /** Internal plan id. */
  id: PlanTier;
  /** Display name for UI. */
  display_name: string;
  /** Monthly subscription per seat (EUR). */
  monthly_seat_price: number;
  /** Included usage credit per month (EUR). */
  included_credit: number;
  /** Markup multiplier applied to LLM cost. 5× = 80% margin on usage. */
  markup_multiplier: number;
  /** Max seats per org (null = unlimited). */
  max_seats: number | null;
  /** Max pages per akt (null = unlimited). */
  max_pages_per_akt: number | null;
  /** Max concurrent pipeline runs. */
  max_concurrent_pipelines: number;
  /** Which model tiers are available. */
  allowed_tiers: ("utility" | "subagent" | "reasoning" | "deep")[];
  /** BYOK (bring your own key) allowed. */
  byok_allowed: boolean;
  /** Priority support. */
  priority_support: boolean;
  /** Feature flags. */
  features: {
    full_pipeline: boolean;
    gutachten_export: boolean;
    aktencheck: boolean;
    fristen_report: boolean;
    schriftsatz: boolean;
    custom_agents: boolean;
    api_access: boolean;
  };
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  solo: {
    id: "solo",
    display_name: "Solo",
    // €249/Monat — Premium über Irys ($299/€275) und Legora ($300/€276)
    // aber unter Harvey ($1.200). Subsumio bietet 13 Unique Features
    // (WhatsApp, BEA, DATEV, ELSTER, Crypto-Forensics, Legal-Hold,
    // Red-Team, War-Room, Signature, Online-Booking, Dictation,
    // DACH-First, 32-Layer Pipeline) die kein Konkurrent hat.
    monthly_seat_price: 249,
    included_credit: 60,
    // 12× markup → 91.7% margin on usage
    // Begründung: 32-Layer Pipeline (vs. 3-10 bei Konkurrentenz),
    // Ensemble Critic, Contradiction Detection, Knowledge Graph,
    // Citation Grounding, WhatsApp, BEA, DATEV, Mobile, Word-Add-In.
    // Competitive: Irys 93% (15×), Harvey 85-98.5% (50-100×).
    markup_multiplier: 12,
    max_seats: 1,
    max_pages_per_akt: 200,
    max_concurrent_pipelines: 1,
    allowed_tiers: ["utility", "subagent", "reasoning"],
    byok_allowed: false,
    priority_support: false,
    features: {
      full_pipeline: false,
      gutachten_export: true,
      aktencheck: true,
      fristen_report: true,
      schriftsatz: true,
      custom_agents: false,
      api_access: false,
    },
  },
  kanzlei: {
    id: "kanzlei",
    display_name: "Kanzlei",
    // €1.499/Monat für 5 Nutzer → €299/seat effective
    // Premium über Legora ($300/€276) und Irys ($299/€275),
    // aber deutlich unter Harvey ($1.200/seat).
    // Begründung: Full Pipeline (32 Layer + Ensemble Critic),
    // Massen-Ingest, WhatsApp-Intake, BEA, DATEV, ELSTER,
    // Steuer-Bereich (StBVV), Kollisionsprüfung, Legal-Hold,
    // War-Room, Red-Team, White-Label, Custom Agents, API.
    monthly_seat_price: 299,
    included_credit: 200,
    // 18× markup → 94.4% margin on usage (über Irys 93%)
    // Premium für: 32-Layer Pipeline + Ensemble Critic (3-Modell),
    // 13 Unique Features, DACH-First, White-Label, Custom Agents.
    // Competitive: Irys 93%, Harvey 85-98.5%.
    markup_multiplier: 18,
    max_seats: 50,
    max_pages_per_akt: null,
    max_concurrent_pipelines: 5,
    allowed_tiers: ["utility", "subagent", "reasoning", "deep"],
    byok_allowed: false,
    priority_support: true,
    features: {
      full_pipeline: true,
      gutachten_export: true,
      aktencheck: true,
      fristen_report: true,
      schriftsatz: true,
      custom_agents: true,
      api_access: true,
    },
  },
  enterprise: {
    id: "enterprise",
    display_name: "Enterprise",
    monthly_seat_price: 0, // custom contract
    included_credit: 0, // custom
    // 1× markup for BYOK (customer pays LLM cost directly)
    // Custom markup for non-BYOK enterprise (negotiated per contract)
    markup_multiplier: 1,
    max_seats: null,
    max_pages_per_akt: null,
    max_concurrent_pipelines: 100,
    allowed_tiers: ["utility", "subagent", "reasoning", "deep"],
    byok_allowed: true,
    priority_support: true,
    features: {
      full_pipeline: true,
      gutachten_export: true,
      aktencheck: true,
      fristen_report: true,
      schriftsatz: true,
      custom_agents: true,
      api_access: true,
    },
  },
};

// ── Selling Price Calculation ─────────────────────────────────────────

/**
 * Get the SELLING price (what customer pays) for a chat model on a plan.
 * Returns EUR per 1M tokens (input | output) with markup applied.
 *
 * Cost prices in model-pricing.ts are USD; we convert to EUR then markup.
 */
export function getSellingPrice(modelId: string, plan: PlanTier): ModelPricing | null {
  const cost = CANONICAL_PRICING[modelId];
  if (!cost) return null;

  const planConfig = PLANS[plan];
  if (!planConfig) return null;

  const markup = planConfig.markup_multiplier;
  // USD → EUR → × markup
  return {
    input: Math.round(cost.input * USD_TO_EUR * markup * 1000) / 1000,
    output: Math.round(cost.output * USD_TO_EUR * markup * 1000) / 1000,
  };
}

/**
 * Get the SELLING price for an embedding model on a plan.
 * Returns EUR per 1M tokens with markup applied.
 */
export function getEmbeddingSellingPrice(modelId: string, plan: PlanTier): number | null {
  const cost = EMBEDDING_PRICING[modelId];
  if (!cost) return null;

  const planConfig = PLANS[plan];
  if (!planConfig) return null;

  return Math.round(cost.pricePerMTok * USD_TO_EUR * planConfig.markup_multiplier * 1000) / 1000;
}

// ── Usage Cost Calculation ────────────────────────────────────────────

export interface UsageRecord {
  model_id: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  is_embedding: boolean;
}

export interface UsageCostBreakdown {
  /** Raw LLM cost in EUR (what we pay the provider, converted from USD). */
  cost_eur: number;
  /** Selling price in EUR (what the customer pays). */
  sell_eur: number;
  /** Margin in EUR (sell - cost). */
  margin_eur: number;
  /** Margin percentage (margin / sell × 100). */
  margin_pct: number;
  /** Plan used for pricing. */
  plan: PlanTier;
  /** Model pricing used (null if unknown model). */
  priced: boolean;
}

/**
 * Calculate the cost AND selling price for a single usage record.
 * Uses cache-read discount (10% of input price for Anthropic models).
 * All values in EUR.
 */
export function calculateUsageCost(record: UsageRecord, plan: PlanTier): UsageCostBreakdown {
  const planConfig = PLANS[plan];
  const markup = planConfig.markup_multiplier;

  let costEur = 0;
  let sellEur = 0;

  if (record.is_embedding) {
    const costPerMTokUsd = EMBEDDING_PRICING[record.model_id]?.pricePerMTok;
    if (costPerMTokUsd !== undefined) {
      const costPerMTokEur = costPerMTokUsd * USD_TO_EUR;
      costEur = (record.tokens_input / 1_000_000) * costPerMTokEur;
      sellEur = costEur * markup;
    }
  } else {
    const pricing = CANONICAL_PRICING[record.model_id];
    if (pricing) {
      // Convert USD to EUR
      const inputCostEur = (record.tokens_input / 1_000_000) * pricing.input * USD_TO_EUR;
      const outputCostEur = (record.tokens_output / 1_000_000) * pricing.output * USD_TO_EUR;
      // Cache read is 10% of input cost (Anthropic pricing model)
      const cacheCostEur =
        (record.tokens_cache_read / 1_000_000) * pricing.input * USD_TO_EUR * 0.1;
      costEur = inputCostEur + outputCostEur + cacheCostEur;
      sellEur = costEur * markup;
    }
  }

  const marginEur = sellEur - costEur;
  const marginPct = sellEur > 0 ? (marginEur / sellEur) * 100 : 0;

  return {
    cost_eur: Math.round(costEur * 1_000_000) / 1_000_000,
    sell_eur: Math.round(sellEur * 1_000_000) / 1_000_000,
    margin_eur: Math.round(marginEur * 1_000_000) / 1_000_000,
    margin_pct: Math.round(marginPct * 100) / 100,
    plan,
    priced: costEur > 0,
  };
}

// ── Monthly Bill Calculation ──────────────────────────────────────────

export interface MonthlyBill {
  plan: PlanTier;
  seats: number;
  seat_subtotal: number;
  included_credit: number;
  usage_cost: number;
  overage_cost: number;
  total: number;
  /** Breakdown by model. */
  by_model: Array<{
    model_id: string;
    tokens_input: number;
    tokens_output: number;
    cost_eur: number;
    sell_eur: number;
  }>;
}

/**
 * Calculate a monthly bill from aggregated usage records.
 * All values in EUR.
 *
 * Logic:
 *   1. Seat subscription = seats × monthly_seat_price
 *   2. Included credit = seats × included_credit_per_seat
 *   3. Usage cost = sum of all selling prices
 *   4. Overage = max(0, usage_cost - included_credit)
 *   5. Total = seat_subtotal + overage
 */
export function calculateMonthlyBill(
  records: UsageRecord[],
  plan: PlanTier,
  seats: number
): MonthlyBill {
  const planConfig = PLANS[plan];
  const seatSubtotal = seats * planConfig.monthly_seat_price;
  const includedCredit = seats * planConfig.included_credit;

  const byModel = new Map<
    string,
    { tokens_input: number; tokens_output: number; cost_eur: number; sell_eur: number }
  >();

  let totalUsageSell = 0;

  for (const record of records) {
    const breakdown = calculateUsageCost(record, plan);
    if (!breakdown.priced) continue;

    totalUsageSell += breakdown.sell_eur;

    const existing = byModel.get(record.model_id);
    if (existing) {
      existing.tokens_input += record.tokens_input;
      existing.tokens_output += record.tokens_output;
      existing.cost_eur += breakdown.cost_eur;
      existing.sell_eur += breakdown.sell_eur;
    } else {
      byModel.set(record.model_id, {
        tokens_input: record.tokens_input,
        tokens_output: record.tokens_output,
        cost_eur: breakdown.cost_eur,
        sell_eur: breakdown.sell_eur,
      });
    }
  }

  const overage = Math.max(0, totalUsageSell - includedCredit);

  return {
    plan,
    seats,
    seat_subtotal: seatSubtotal,
    included_credit: includedCredit,
    usage_cost: Math.round(totalUsageSell * 100) / 100,
    overage_cost: Math.round(overage * 100) / 100,
    total: Math.round((seatSubtotal + overage) * 100) / 100,
    by_model: Array.from(byModel.entries()).map(([model_id, v]) => ({
      model_id,
      tokens_input: v.tokens_input,
      tokens_output: v.tokens_output,
      cost_eur: Math.round(v.cost_eur * 100) / 100,
      sell_eur: Math.round(v.sell_eur * 100) / 100,
    })),
  };
}

// ── Plan Feature Checks ───────────────────────────────────────────────

/**
 * Check if a feature is available on a plan.
 */
export function hasFeature(plan: PlanTier, feature: keyof PlanConfig["features"]): boolean {
  return PLANS[plan]?.features[feature] ?? false;
}

/**
 * Check if a model tier is allowed on a plan.
 */
export function isTierAllowed(
  plan: PlanTier,
  tier: "utility" | "subagent" | "reasoning" | "deep"
): boolean {
  return PLANS[plan]?.allowed_tiers.includes(tier) ?? false;
}

/**
 * Check if a workflow is available on a plan.
 */
export function isWorkflowAllowed(plan: PlanTier, workflow: string): boolean {
  const planConfig = PLANS[plan];
  if (!planConfig) return false;

  switch (workflow) {
    case "memo":
    case "fristen_report":
      return true; // available on all plans
    case "schriftsatz":
      return planConfig.features.schriftsatz;
    case "full_pipeline":
      return planConfig.features.full_pipeline;
    case "aktencheck":
      return planConfig.features.aktencheck;
    case "gutachten":
      return planConfig.features.gutachten_export;
    default:
      return false;
  }
}

// ── Price Display Helpers ─────────────────────────────────────────────

/**
 * Get a price card summary for frontend display.
 */
export function getPlanSummary(plan: PlanTier): {
  name: string;
  monthly: number;
  included: number;
  markup: string;
  margin_pct: number;
  per_page_estimate: { memo: number; fristen: number; full: number };
} {
  const config = PLANS[plan];
  const m = config.markup_multiplier;
  const marginPct = ((m - 1) / m) * 100;

  // Cost per page estimates (from real benchmark, 50-page akt)
  // Base costs in EUR (our cost, converted from USD at 0.92)
  // Selling = base × markup
  const memoPerPageEur = 0.013 * m; // ~$0.014 USD → €0.013 EUR
  const fristenPerPageEur = 0.017 * m;
  const fullPerPageEur = 0.023 * m; // full_pipeline avg

  return {
    name: config.display_name,
    monthly: config.monthly_seat_price,
    included: config.included_credit,
    markup: `${m}× LLM-Kosten`,
    margin_pct: Math.round(marginPct * 10) / 10,
    per_page_estimate: {
      memo: Math.round(memoPerPageEur * 100) / 100,
      fristen: Math.round(fristenPerPageEur * 100) / 100,
      full: Math.round(fullPerPageEur * 100) / 100,
    },
  };
}

// ── Competitive Benchmark Data ────────────────────────────────────────

/**
 * Competitive benchmark data for admin dashboard display.
 * Verified 2026-08-29 from public sources.
 */
export const COMPETITIVE_BENCHMARK = {
  harvey: {
    price_per_seat_mo: 1200, // USD
    price_range: "$1.200-$2.000",
    margin_pct: 85, // heavy user; 98.5% light user
    markup_over_llm: "50-100×",
    billing_model: "per-seat unlimited",
    min_seats: 20,
    source: "jimmyresearch.com, eesel.ai, artificiallawyer.com (Aug 2026)",
  },
  legora: {
    price_per_seat_mo: 550, // USD midpoint
    price_range: "$300-$800",
    margin_pct: 78,
    markup_over_llm: "10-30×",
    billing_model: "per-seat + consumption (Agent Pro)",
    min_seats: 1,
    source: "vaquill.ai, legora.com, businessinsider.com (Aug 2026)",
  },
  irys: {
    price_per_seat_mo: 299,
    price_range: "$299 flat",
    margin_pct: 93, // $20 cost, $299 price
    markup_over_llm: "~15×",
    billing_model: "flat unlimited",
    min_seats: 1,
    source: "irys.ai/pricing, irys.ai/architecture (Jul 2026)",
  },
  cocounsel: {
    price_per_seat_mo: 372, // midpoint $104-$639
    price_range: "$104-$639",
    margin_pct: 80,
    markup_over_llm: "N/A (bundled)",
    billing_model: "per-seat bundled with Westlaw",
    min_seats: 1,
    source: "costbench.com, spellbook.com (Jun 2026)",
  },
  spellbook: {
    price_per_seat_mo: 149,
    price_range: "$99-$199",
    margin_pct: 50,
    markup_over_llm: "1× (pass-through)",
    billing_model: "per-seat + token pass-through",
    min_seats: 1,
    source: "spellbook.readme.io, costbench.com (2026)",
  },
} as const;

/**
 * Industry gross margin benchmarks (SFAI Labs, Causo Hub, Sequoia 2026).
 */
export const INDUSTRY_BENCHMARKS = {
  ai_inference_saas_gross_margin: "50-65%",
  legal_ai_gross_margin: "80-85%+",
  inference_as_pct_of_revenue: "3-8%",
  sequoia_ai_margin_floor: "50%",
  source: "sfailabs.com, hub.causo.ai, Sequoia 2024-2026",
} as const;
