/**
 * Phase 2 — Legal-AT Judikatur retrieval-quality eval (hermetic PGLite, keyword path,
 * no API key).
 *
 * Runs 20 verified OGH decision retrieval questions through the real hybridSearch
 * retriever and reports industry-standard metrics (hit@1 / hit@3 / MRR / recall@3)
 * PLUS jurisdiction purity (no German statutes in AT-scoped results).
 *
 * This is the EVALUATION GATE for the Austrian judikatur import:
 *   • No source goes live without this test passing.
 *   • The gold set is verified against real corpus files (seeder throws on drift).
 *   • Purity must be 100% — no DE statute may leak into AT judikatur results.
 *
 * Two test groups:
 *   1. SCORECARD — production config (jurisdiction=at) meets quality floors + 100% pure
 *   2. BASELINE — without filter, DE distractors leak (proves the filter has teeth)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { hybridSearch } from "../src/core/search/hybrid.ts";
import { runRetrievalQuality, type SearchFn } from "../src/eval/retrieval-quality/harness.ts";
import {
  seedJudikaturCorpus,
  seedDeDistractors,
  JUDIKATUR_GOLD,
  JUDIKATUR_QUESTIONS,
} from "./fixtures/retrieval-quality/legal-at-judikatur/corpus.ts";

let eng: PGLiteEngine;

beforeAll(async () => {
  eng = new PGLiteEngine();
  await eng.connect({});
  await eng.initSchema();
  await seedJudikaturCorpus(eng);
  await seedDeDistractors(eng);
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

/** Check that no German statute slugs appear in AT-scoped results. */
async function measurePurity(jurisdiction?: string): Promise<{ leaks: string[]; total: number }> {
  const leaks: string[] = [];
  for (const g of JUDIKATUR_GOLD) {
    const results = await hybridSearch(eng, g.query, { limit: 10, expansion: false, jurisdiction });
    const foreign = results
      .map((r) => r.slug)
      .filter((s) => s.startsWith("legal/statutes/de/"));
    if (foreign.length > 0) leaks.push(`"${g.query}" → ${foreign.join(", ")}`);
  }
  return { leaks, total: JUDIKATUR_GOLD.length };
}

describe("legal-AT judikatur retrieval quality (eval gate)", () => {
  test("gold set has ≥20 verified OGH questions", () => {
    expect(JUDIKATUR_GOLD.length).toBeGreaterThanOrEqual(20);
    // Every gold entry must have a query and a ref
    for (const g of JUDIKATUR_GOLD) {
      expect(g.query.length).toBeGreaterThan(10);
      expect(g.ref.file.length).toBeGreaterThan(0);
      expect(g.ref.gz.length).toBeGreaterThan(0);
    }
  });

  test("SCORECARD: production config (jurisdiction=at) meets quality floors + 100% pure", async () => {
    const report = await runRetrievalQuality(JUDIKATUR_QUESTIONS, searchFn("at"));
    const o = overall(report.questions);
    const purity = await measurePurity("at");
    const pureRate = (purity.total - purity.leaks.length) / purity.total;

    // eslint-disable-next-line no-console
    console.log(
      `\n[Judikatur eval gate | jurisdiction=at]\n` +
        `  questions:      ${report.total}\n` +
        `  hit@1:          ${(o.hit1 * 100).toFixed(1)}%\n` +
        `  hit@3:          ${(o.hit3 * 100).toFixed(1)}%\n` +
        `  MRR:            ${o.mrr.toFixed(3)}\n` +
        `  recall@3:       ${(o.recall3 * 100).toFixed(1)}%\n` +
        `  jurisdiction-purity: ${(pureRate * 100).toFixed(1)}%\n`
    );

    // Quality floors for judikatur retrieval
    // hit@3 ≥ 0.85 — most OGH decisions should be findable in top-3
    expect(o.hit3, `hit@3 ${(o.hit3 * 100).toFixed(1)}% < 85%`).toBeGreaterThanOrEqual(0.85);
    // hit@1 ≥ 0.60 — a majority should rank at position 1
    expect(o.hit1, `hit@1 ${(o.hit1 * 100).toFixed(1)}% < 60%`).toBeGreaterThanOrEqual(0.60);
    // MRR ≥ 0.70
    expect(o.mrr, `MRR ${o.mrr.toFixed(3)} < 0.70`).toBeGreaterThanOrEqual(0.70);
    // Purity is absolute: not one German § may appear under jurisdiction=at
    expect(purity.leaks, `purity breached:\n${purity.leaks.join("\n")}`).toEqual([]);
  }, 120_000);

  test("BASELINE: DE distractors exist but are filtered out under jurisdiction=at", async () => {
    // First verify the DE distractors are actually in the engine
    const deResults = await hybridSearch(eng, "Schadensersatz Diebstahl Beweiswürdigung", {
      limit: 10,
      expansion: false,
      jurisdiction: undefined,
    });
    const deSlugs = deResults.map((r) => r.slug).filter((s) => s.startsWith("legal/statutes/de/"));
    expect(deSlugs.length, "DE distractors must be present in the engine").toBeGreaterThan(0);

    // Now verify they're filtered out under jurisdiction=at
    const scoped = await measurePurity("at");
    expect(scoped.leaks, `purity breached under jurisdiction=at:\n${scoped.leaks.join("\n")}`).toEqual([]);
  }, 120_000);

  test("all 20 gold slugs are retrievable (existence check)", async () => {
    // Each gold slug should appear in at least one search result for its own query
    for (const g of JUDIKATUR_GOLD) {
      const results = await hybridSearch(eng, g.query, { limit: 10, expansion: false, jurisdiction: "at" });
      const slugs = results.map((r) => r.slug);
      const expectedSlug = `legal/judikatur/at/${g.ref.file}`;
      expect(slugs, `${g.ref.gz} (${expectedSlug}) not found in results for: "${g.query}"`).toContain(expectedSlug);
    }
  }, 120_000);
});
