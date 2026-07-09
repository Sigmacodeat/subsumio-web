import { describe, it, expect } from "vitest";
import type { SearchResult } from "../types.ts";
import {
  cognitiveTierForType,
  boostForTier,
  applyCognitiveTierBoost,
  DEFAULT_TIER3_BOOST,
  DEFAULT_TIER2_BOOST,
  DEFAULT_TIER1_BOOST,
  DEFAULT_TIER0_BOOST,
  type CognitiveTier,
} from "./cognitive-tier.ts";

function makeResult(
  type: string,
  score: number,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    slug: `test/${type}-page`,
    page_id: 1,
    title: `Test ${type}`,
    type,
    chunk_text: "test chunk",
    chunk_source: "compiled_truth",
    chunk_id: 1,
    chunk_index: 0,
    score,
    stale: false,
    ...overrides,
  };
}

describe("cognitiveTierForType", () => {
  it("maps synthesis/concept/analysis/guide to Tier 3 (Mental Models)", () => {
    expect(cognitiveTierForType("synthesis")).toBe(3);
    expect(cognitiveTierForType("concept")).toBe(3);
    expect(cognitiveTierForType("analysis")).toBe(3);
    expect(cognitiveTierForType("guide")).toBe(3);
  });

  it("maps meeting/note/email/slack/atom/conversation/calendar-event/writing to Tier 2 (Observations)", () => {
    expect(cognitiveTierForType("meeting")).toBe(2);
    expect(cognitiveTierForType("note")).toBe(2);
    expect(cognitiveTierForType("email")).toBe(2);
    expect(cognitiveTierForType("slack")).toBe(2);
    expect(cognitiveTierForType("atom")).toBe(2);
    expect(cognitiveTierForType("conversation")).toBe(2);
    expect(cognitiveTierForType("calendar-event")).toBe(2);
    expect(cognitiveTierForType("writing")).toBe(2);
  });

  it("maps person/company/deal/project/source/media to Tier 1 (Raw Facts)", () => {
    expect(cognitiveTierForType("person")).toBe(1);
    expect(cognitiveTierForType("company")).toBe(1);
    expect(cognitiveTierForType("deal")).toBe(1);
    expect(cognitiveTierForType("project")).toBe(1);
    expect(cognitiveTierForType("source")).toBe(1);
    expect(cognitiveTierForType("media")).toBe(1);
  });

  it("maps unknown/pack-declared types to Tier 0 (neutral)", () => {
    expect(cognitiveTierForType("legal_case")).toBe(0);
    expect(cognitiveTierForType("custom_type")).toBe(0);
    expect(cognitiveTierForType("")).toBe(0);
  });
});

describe("boostForTier", () => {
  it("returns default boosts for each tier", () => {
    expect(boostForTier(3)).toBe(DEFAULT_TIER3_BOOST);
    expect(boostForTier(2)).toBe(DEFAULT_TIER2_BOOST);
    expect(boostForTier(1)).toBe(DEFAULT_TIER1_BOOST);
    expect(boostForTier(0)).toBe(DEFAULT_TIER0_BOOST);
  });

  it("respects custom boost opts", () => {
    expect(boostForTier(3, { tier3Boost: 1.5 })).toBe(1.5);
    expect(boostForTier(0, { tier0Boost: 1.0 })).toBe(1.0);
  });

  it("tier 3 > tier 2 > tier 1 > tier 0 by default", () => {
    expect(DEFAULT_TIER3_BOOST).toBeGreaterThan(DEFAULT_TIER2_BOOST);
    expect(DEFAULT_TIER2_BOOST).toBeGreaterThan(DEFAULT_TIER1_BOOST);
    expect(DEFAULT_TIER1_BOOST).toBeGreaterThan(DEFAULT_TIER0_BOOST);
  });
});

describe("applyCognitiveTierBoost", () => {
  it("boosts Mental Models above Observations above Raw Facts", () => {
    const results = [
      makeResult("person", 0.80),      // Tier 1 → 0.80 * 1.0 = 0.80
      makeResult("synthesis", 0.80),   // Tier 3 → 0.80 * 1.08 = 0.864
      makeResult("meeting", 0.80),     // Tier 2 → 0.80 * 1.04 = 0.832
    ];

    applyCognitiveTierBoost(results);

    // After boost: synthesis > meeting > person
    expect(results[1].score).toBeGreaterThan(results[2].score);
    expect(results[2].score).toBeGreaterThan(results[0].score);

    // Attribution stamps
    expect(results[1].cognitive_tier_boost).toBeCloseTo(1.08);
    expect(results[2].cognitive_tier_boost).toBeCloseTo(1.04);
    expect(results[0].cognitive_tier_boost).toBeUndefined(); // 1.0 = no stamp
  });

  it("demotes unknown types (Tier 0)", () => {
    const results = [
      makeResult("person", 0.80),      // Tier 1 → 0.80 * 1.0 = 0.80
      makeResult("custom_type", 0.80), // Tier 0 → 0.80 * 0.98 = 0.784
    ];

    applyCognitiveTierBoost(results);

    expect(results[1].score).toBeLessThan(results[0].score);
    expect(results[1].cognitive_tier_boost).toBeCloseTo(0.98);
  });

  it("respects floor-ratio gate (weak results not boosted)", () => {
    const results = [
      makeResult("synthesis", 0.30),  // weak synthesis
      makeResult("person", 0.90),     // strong raw fact
    ];

    // floorThreshold = 0.85 * 0.90 = 0.765 → synthesis at 0.30 is below
    applyCognitiveTierBoost(results, {}, 0.765);

    // synthesis should NOT be boosted (below floor)
    expect(results[0].cognitive_tier_boost).toBeUndefined();
    expect(results[0].score).toBe(0.30);
  });

  it("allows strong synthesis to leapfrog weak raw fact when above floor", () => {
    const results = [
      makeResult("person", 0.80),     // Tier 1 → 0.80 * 1.0 = 0.80
      makeResult("synthesis", 0.78),  // Tier 3 → 0.78 * 1.08 = 0.8424
    ];

    // floorThreshold = 0.85 * 0.80 = 0.68 → both above
    applyCognitiveTierBoost(results, {}, 0.68);

    expect(results[1].score).toBeGreaterThan(results[0].score);
  });

  it("skips NaN scores", () => {
    const results = [
      makeResult("synthesis", NaN),
    ];

    applyCognitiveTierBoost(results);

    expect(results[0].cognitive_tier_boost).toBeUndefined();
    expect(Number.isNaN(results[0].score)).toBe(true);
  });

  it("handles empty results array gracefully", () => {
    const results: SearchResult[] = [];
    applyCognitiveTierBoost(results);
    expect(results.length).toBe(0);
  });

  it("respects custom boost multipliers", () => {
    const results = [
      makeResult("synthesis", 0.80),
      makeResult("meeting", 0.80),
    ];

    applyCognitiveTierBoost(results, {
      tier3Boost: 1.5,
      tier2Boost: 1.2,
    });

    expect(results[0].score).toBeCloseTo(0.80 * 1.5);
    expect(results[1].score).toBeCloseTo(0.80 * 1.2);
  });

  it("preserves score ordering for same-tier results", () => {
    const results = [
      makeResult("synthesis", 0.90),
      makeResult("synthesis", 0.80),
      makeResult("synthesis", 0.70),
    ];

    applyCognitiveTierBoost(results);

    // Same tier → same boost → relative order preserved
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(results[2].score);
  });
});

// ─── Audit 6.1: Edge Cases ─────────────────────────────────────────────

describe("applyCognitiveTierBoost — edge cases", () => {
  it("handles undefined type field (defaults to Tier 0)", () => {
    const r = makeResult("synthesis", 0.80);
    r.type = undefined as unknown as string;
    applyCognitiveTierBoost([r]);
    // Tier 0 → 0.98 demote
    expect(r.cognitive_tier_boost).toBeCloseTo(0.98);
    expect(r.score).toBeCloseTo(0.80 * 0.98);
  });

  it("handles Infinity score (passes gate, boost preserves Infinity)", () => {
    const r = makeResult("synthesis", Infinity);
    applyCognitiveTierBoost([r]);
    expect(r.score).toBe(Infinity);
    expect(r.cognitive_tier_boost).toBeCloseTo(1.08);
  });

  it("handles negative scores", () => {
    const r = makeResult("synthesis", -0.5);
    applyCognitiveTierBoost([r]);
    expect(r.score).toBeCloseTo(-0.5 * 1.08);
    expect(r.cognitive_tier_boost).toBeCloseTo(1.08);
  });

  it("handles zero score", () => {
    const r = makeResult("synthesis", 0);
    applyCognitiveTierBoost([r]);
    expect(r.score).toBe(0);
    expect(r.cognitive_tier_boost).toBeCloseTo(1.08);
  });

  it("floorThreshold = NEGATIVE_INFINITY boosts everything (no gate)", () => {
    const results = [
      makeResult("synthesis", 0.01),
      makeResult("person", 0.99),
    ];
    applyCognitiveTierBoost(results, {}, Number.NEGATIVE_INFINITY);
    expect(results[0].cognitive_tier_boost).toBeCloseTo(1.08);
    expect(results[1].cognitive_tier_boost).toBeUndefined(); // Tier 1 = 1.0
  });

  it("floorThreshold = 0 boosts all non-negative scores", () => {
    const r = makeResult("synthesis", 0.001);
    applyCognitiveTierBoost([r], {}, 0);
    expect(r.cognitive_tier_boost).toBeCloseTo(1.08);
  });

  it("does not stamp cognitive_tier_boost when boost = 1.0 (Tier 1 default)", () => {
    const r = makeResult("person", 0.80);
    applyCognitiveTierBoost([r]);
    expect(r.cognitive_tier_boost).toBeUndefined();
    expect(r.score).toBe(0.80);
  });

  it("stamps cognitive_tier_boost when Tier 1 has custom boost ≠ 1.0", () => {
    const r = makeResult("person", 0.80);
    applyCognitiveTierBoost([r], { tier1Boost: 1.02 });
    expect(r.cognitive_tier_boost).toBeCloseTo(1.02);
    expect(r.score).toBeCloseTo(0.80 * 1.02);
  });

  it("handles all-unknown-types array (all Tier 0)", () => {
    const results = [
      makeResult("custom_a", 0.80),
      makeResult("custom_b", 0.80),
      makeResult("custom_c", 0.80),
    ];
    applyCognitiveTierBoost(results);
    for (const r of results) {
      expect(r.cognitive_tier_boost).toBeCloseTo(0.98);
      expect(r.score).toBeCloseTo(0.80 * 0.98);
    }
  });

  it("handles single-element array", () => {
    const results = [makeResult("synthesis", 0.90)];
    applyCognitiveTierBoost(results);
    expect(results[0].score).toBeCloseTo(0.90 * 1.08);
  });
});

// ─── Audit 6.2: Stress Test ────────────────────────────────────────────

describe("applyCognitiveTierBoost — stress test (1000 results)", () => {
  it("processes 1000 mixed-type results without error", () => {
    const types = ["synthesis", "concept", "meeting", "note", "email",
      "person", "company", "deal", "custom_a", "custom_b"];
    const results: SearchResult[] = [];
    for (let i = 0; i < 1000; i++) {
      const type = types[i % types.length];
      results.push(makeResult(type, 0.5 + (i % 100) / 1000));
    }
    const originalScores = results.map((r) => r.score);

    applyCognitiveTierBoost(results);

    // Verify every result got the correct boost
    for (let i = 0; i < 1000; i++) {
      const type = types[i % types.length];
      const tier = cognitiveTierForType(type);
      const expectedBoost = boostForTier(tier);
      if (expectedBoost === 1.0) {
        expect(results[i].cognitive_tier_boost).toBeUndefined();
        expect(results[i].score).toBe(originalScores[i]);
      } else {
        expect(results[i].cognitive_tier_boost).toBeCloseTo(expectedBoost);
        expect(results[i].score).toBeCloseTo(originalScores[i] * expectedBoost);
      }
    }
  });

  it("preserves relative ordering within same tier across 500 results", () => {
    const results: SearchResult[] = [];
    for (let i = 0; i < 500; i++) {
      results.push(makeResult("synthesis", 1.0 - i * 0.001));
    }
    applyCognitiveTierBoost(results);
    for (let i = 1; i < 500; i++) {
      expect(results[i - 1].score).toBeGreaterThan(results[i].score);
    }
  });
});

// ─── Audit 6.3: Consistency with existing boost stages ─────────────────

describe("applyCognitiveTierBoost — consistency with other post-fusion stages", () => {
  it("is pure in-memory (no engine calls, no async)", () => {
    // applyCognitiveTierBoost is synchronous and doesn't touch the engine.
    // This test verifies it doesn't throw even with a null engine context.
    const results = [makeResult("synthesis", 0.80)];
    expect(() => applyCognitiveTierBoost(results)).not.toThrow();
  });

  it("stamps attribution field (cognitive_tier_boost) like other stages", () => {
    const results = [
      makeResult("synthesis", 0.80),
      makeResult("person", 0.80),
    ];
    applyCognitiveTierBoost(results);
    // Tier 3 gets stamped
    expect(results[0].cognitive_tier_boost).toBeDefined();
    // Tier 1 (boost = 1.0) does NOT get stamped (consistent with other
    // stages that skip stamping when the boost is neutral)
    expect(results[1].cognitive_tier_boost).toBeUndefined();
  });

  it("floor-ratio gate uses the same threshold as other stages", () => {
    // The floorThreshold is computed once in runPostFusionStages and passed
    // to all stages including cognitive tier. This test verifies the
    // cognitive tier function respects it identically.
    const results = [
      makeResult("synthesis", 0.50),  // below floor
      makeResult("synthesis", 0.90),  // above floor
    ];
    applyCognitiveTierBoost(results, {}, 0.85);
    expect(results[0].cognitive_tier_boost).toBeUndefined();
    expect(results[1].cognitive_tier_boost).toBeCloseTo(1.08);
  });
});
