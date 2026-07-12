/**
 * Phase 2 — Legal-AT retrieval-quality eval (hermetic PGLite, keyword path,
 * no API key).
 *
 * Turns "as good as Harvey" from a claim into a NUMBER. Runs a verified gold
 * set of Austrian legal questions (concept → correct §) through the real
 * hybridSearch retriever and reports the industry-standard metrics
 * (hit@1 / hit@3 / MRR / recall@3) PLUS the legal-specific one that matters
 * for this product: jurisdiction purity.
 *
 * Two runs, same questions:
 *   • jurisdiction=at  → the production configuration. Must hit quality floors
 *     AND be 100% jurisdiction-pure (no German § anywhere in the results).
 *   • no jurisdiction  → baseline. Measures how many German §§ leak in without
 *     the Phase-1 filter, so the filter's value is quantified, not asserted.
 *
 * The gold ground truth is verified against the real corpus by the seeder
 * (throws if a cited § is missing), so this eval can never drift green against
 * a hollow corpus.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { hybridSearch } from "../src/core/search/hybrid.ts";
import { runRetrievalQuality, type SearchFn } from "../src/eval/retrieval-quality/harness.ts";
import {
  seedLegalAtCorpus,
  LEGAL_AT_QUESTIONS,
  LEGAL_AT_GOLD,
} from "./fixtures/retrieval-quality/legal-at/corpus.ts";

let eng: PGLiteEngine;

beforeAll(async () => {
  eng = new PGLiteEngine();
  await eng.connect({});
  await eng.initSchema();
  await seedLegalAtCorpus(eng);
}, 60_000);

afterAll(async () => {
  await eng.disconnect();
});

const searchFn =
  (jurisdiction?: string): SearchFn =>
  async (q) => {
    const results = await hybridSearch(eng, q, { limit: 10, expansion: false, jurisdiction });
    return results.map((r) => r.slug);
  };

function overall(qs: Array<{ hit_at_1: boolean; hit_at_3: boolean; reciprocal_rank: number; recall_at_k: number }>) {
  const n = qs.length || 1;
  return {
    hit1: qs.filter((q) => q.hit_at_1).length / n,
    hit3: qs.filter((q) => q.hit_at_3).length / n,
    mrr: qs.reduce((s, q) => s + q.reciprocal_rank, 0) / n,
    recall3: qs.reduce((s, q) => s + q.recall_at_k, 0) / n,
  };
}

/** Fraction of gold queries whose AT-scoped top-10 contained ANY German §. */
async function measurePurity(jurisdiction?: string): Promise<{ leaks: string[]; total: number }> {
  const leaks: string[] = [];
  for (const g of LEGAL_AT_GOLD) {
    const results = await hybridSearch(eng, g.query, { limit: 10, expansion: false, jurisdiction });
    const foreign = results
      .map((r) => r.slug)
      .filter((s) => s.startsWith("legal/statutes/") && !s.startsWith("legal/statutes/at/"));
    if (foreign.length > 0) leaks.push(`"${g.query}" → ${foreign.join(", ")}`);
  }
  return { leaks, total: LEGAL_AT_GOLD.length };
}

describe("legal-AT retrieval quality (Phase 2)", () => {
  test("gold set is non-trivial and its ground truth exists in the corpus", async () => {
    // seedLegalAtCorpus already threw if any § was missing; this pins size.
    expect(LEGAL_AT_QUESTIONS.length).toBeGreaterThanOrEqual(12);
  });

  test("SCORECARD: production config (jurisdiction=at) meets quality floors + is 100% pure", async () => {
    const report = await runRetrievalQuality(LEGAL_AT_QUESTIONS, searchFn("at"));
    const o = overall(report.questions);
    const purity = await measurePurity("at");
    const pureRate = (purity.total - purity.leaks.length) / purity.total;

    // eslint-disable-next-line no-console
    console.log(
      `\n[Phase2 legal-AT scorecard | jurisdiction=at]\n` +
        `  questions:      ${report.total}\n` +
        `  hit@1:          ${(o.hit1 * 100).toFixed(1)}%\n` +
        `  hit@3:          ${(o.hit3 * 100).toFixed(1)}%\n` +
        `  MRR:            ${o.mrr.toFixed(3)}\n` +
        `  recall@3:       ${(o.recall3 * 100).toFixed(1)}%\n` +
        `  jurisdiction-purity: ${(pureRate * 100).toFixed(1)}%\n`
    );

    // Quality floors — the correct AT § must reliably rank at the very top.
    expect(o.hit3).toBeGreaterThanOrEqual(0.9);
    expect(o.hit1).toBeGreaterThanOrEqual(0.8);
    expect(o.mrr).toBeGreaterThanOrEqual(0.85);
    // Purity is absolute: not one German § may appear under jurisdiction=at.
    expect(purity.leaks, `purity breached:\n${purity.leaks.join("\n")}`).toEqual([]);
  }, 120_000);

  test("BASELINE: without the filter, German §§ leak into AT results (quantifies the filter's value)", async () => {
    const baseline = await measurePurity(undefined);
    const scoped = await measurePurity("at");
    // eslint-disable-next-line no-console
    console.log(
      `\n[Phase2 legal-AT purity delta]\n` +
        `  no filter:        ${baseline.leaks.length}/${baseline.total} queries leaked a German §\n` +
        `  jurisdiction=at:  ${scoped.leaks.length}/${scoped.total} queries leaked a German §\n`
    );
    // The gold set is BUILT to leak without the filter (paired DE distractors),
    // so this asserts the probe has teeth AND the filter removes the leak.
    expect(baseline.leaks.length).toBeGreaterThan(0);
    expect(scoped.leaks.length).toBe(0);
  }, 120_000);
});
