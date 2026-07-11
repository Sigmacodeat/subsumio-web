/**
 * v0.46 — Cognitive Tier Priority Cascade for retrieval ranking.
 *
 * Maps page types to cognitive tiers that mirror the brain's memory
 * hierarchy: Mental Models → Observations → Raw Facts. When a search
 * returns multiple results for the same entity, results from higher
 * tiers (synthesized knowledge) should outrank results from lower tiers
 * (raw observations), all else being equal.
 *
 * Tier hierarchy (highest priority first):
 *
 *   Tier 3 — Mental Models (synthesis, concept, analysis, guide)
 *            Distilled, cross-entity abstractions. The "what does this
 *            mean" layer.
 *
 *   Tier 2 — Observations (meeting, note, email, slack, atom, conversation,
 *            calendar-event, writing)
 *            First-person observations and communications. The "what
 *            happened" layer.
 *
 *   Tier 1 — Raw Facts (person, company, deal, project, source, media,
 *            hardware, architecture, code, image, extract_receipt)
 *            Entity stubs and raw data. The "what is this" layer.
 *
 *   Tier 0 — Neutral (unknown / pack-declared types not in the map)
 *            No boost, no demotion. Preserves pack extensibility.
 *
 * The boost is a multiplicative factor applied in runPostFusionStages
 * AFTER backlink/salience/recency/title/graph/alias stages, so cognitive
 * tier is the final tie-breaker on top of metadata signals. It is
 * floor-ratio-gated like other metadata boosts so a weak Mental Model
 * chunk can't leapfrog a strong Raw Fact match.
 *
 * Default magnitudes are conservative (1.08 / 1.04 / 1.0 / 0.98) to
 * avoid burying highly-relevant raw facts under mediocre syntheses.
 * The cascade is a nudge, not a override — a 0.95 cosine raw fact still
 * beats a 0.70 cosine mental model after a 1.08x boost.
 */

import type { PageType } from "../types.ts";

export type CognitiveTier = 0 | 1 | 2 | 3;

export interface CognitiveTierBoostOpts {
  /** Multiplier for Tier 3 (Mental Models). Default 1.08. */
  tier3Boost?: number;
  /** Multiplier for Tier 2 (Observations). Default 1.04. */
  tier2Boost?: number;
  /** Multiplier for Tier 1 (Raw Facts). Default 1.0 (neutral). */
  tier1Boost?: number;
  /** Multiplier for Tier 0 (Unknown). Default 0.98 (mild demote). */
  tier0Boost?: number;
}

export const DEFAULT_TIER3_BOOST = 1.08;
export const DEFAULT_TIER2_BOOST = 1.04;
export const DEFAULT_TIER1_BOOST = 1.0;
export const DEFAULT_TIER0_BOOST = 0.98;

/**
 * Static mapping from page type → cognitive tier.
 *
 * Pack-declared types not in this map default to Tier 0 (neutral).
 * This is intentional: a schema pack might declare "legal_case" which
 * is an observation, but we can't know that without pack metadata.
 * Tier 0 gives unknown types a mild demote so known tiers surface first.
 */
const TYPE_TO_TIER: ReadonlyMap<PageType, CognitiveTier> = new Map([
  // Tier 3 — Mental Models (synthesized, cross-entity)
  ["synthesis", 3],
  ["concept", 3],
  ["analysis", 3],
  ["guide", 3],

  // Tier 2 — Observations (first-person, experiential)
  ["meeting", 2],
  ["note", 2],
  ["email", 2],
  ["slack", 2],
  ["atom", 2],
  ["conversation", 2],
  ["calendar-event", 2],
  ["writing", 2],

  // Tier 1 — Raw Facts (entity stubs, data)
  ["person", 1],
  ["company", 1],
  ["deal", 1],
  ["yc", 1],
  ["civic", 1],
  ["project", 1],
  ["source", 1],
  ["media", 1],
  ["hardware", 1],
  ["architecture", 1],
  ["code", 1],
  ["image", 1],
  ["extract_receipt", 1],
]);

/**
 * Resolve a page type to its cognitive tier.
 * Unknown types return Tier 0 (neutral / mild demote).
 */
export function cognitiveTierForType(type: PageType): CognitiveTier {
  return TYPE_TO_TIER.get(type) ?? 0;
}

/**
 * Get the boost multiplier for a given cognitive tier.
 */
export function boostForTier(tier: CognitiveTier, opts: CognitiveTierBoostOpts = {}): number {
  switch (tier) {
    case 3:
      return opts.tier3Boost ?? DEFAULT_TIER3_BOOST;
    case 2:
      return opts.tier2Boost ?? DEFAULT_TIER2_BOOST;
    case 1:
      return opts.tier1Boost ?? DEFAULT_TIER1_BOOST;
    default:
      return opts.tier0Boost ?? DEFAULT_TIER0_BOOST;
  }
}

/**
 * Apply cognitive tier boost to search results in place.
 *
 * Runs as a post-fusion stage AFTER backlink/salience/recency/title/graph/
 * alias stages. Floor-ratio-gated so a weak Mental Model chunk can't
 * leapfrog a strong Raw Fact match — the gate ensures only results that
 * are already competitive (score ≥ floorThreshold) get the nudge.
 *
 * Stamps `cognitive_tier_boost` on each touched result for --explain
 * attribution.
 */
export function applyCognitiveTierBoost(
  results: import("../types.ts").SearchResult[],
  opts: CognitiveTierBoostOpts = {},
  floorThreshold?: number
): void {
  for (const r of results) {
    // Floor-ratio gate: skip results below the threshold.
    if (floorThreshold !== undefined && r.score < floorThreshold) continue;

    // Skip NaN scores (NaN < x is false, which would bypass the gate).
    if (Number.isNaN(r.score)) continue;

    const tier = cognitiveTierForType(r.type);
    const boost = boostForTier(tier, opts);

    // Only stamp if the boost actually changes the score (≠ 1.0).
    if (boost !== 1.0) {
      r.score *= boost;
      r.cognitive_tier_boost = boost;
    }
  }
}
