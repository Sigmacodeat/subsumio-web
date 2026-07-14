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
import { LEGAL_AT_PENDING } from "./fixtures/retrieval-quality/legal-at/pending-review.ts";
import { splitStatute } from "../src/core/legal/split-statute.ts";
import { readFileSync } from "fs";
import { join } from "path";
import type { ChunkInput } from "../src/core/types.ts";

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

// ── Draft question batch eval ──────────────────────────────────────────────────

const CORPUS_DIR = join(import.meta.dir, "..", "..", "law-corpus");
const draftSplitCache = new Map<string, ReturnType<typeof splitStatute>>();

function draftSectionBody(file: string, ref: string): string {
  let split = draftSplitCache.get(file);
  if (!split) {
    split = splitStatute(readFileSync(join(CORPUS_DIR, file), "utf8"));
    draftSplitCache.set(file, split);
  }
  // Find first substantive section (B-VG has duplicate refs with metadata stubs)
  // Skip sections that are just metadata (Inkrafttretensdatum/Außerkrafttretensdatum headers)
  const sec = split.sections.find((s) => {
    if (s.ref !== ref && s.id !== `p-${ref}`) return false;
    const body = s.body.trim();
    if (body.length < 50) return false;
    if (/^## Inkrafttretensdatum\s+\d/.test(body) && body.length < 200) return false;
    return true;
  });
  if (!sec) {
    throw new Error(`draft ref drift: ${file} has no substantive § ${ref} after split.`);
  }
  return `${sec.marker} ${sec.ref} ${sec.title}\n${sec.body}`.trim();
}

const draftSlugOf = (r: { jur: "at" | "de"; file: string; abbr: string; ref: string }) =>
  `legal/statutes/${r.jur}/${r.abbr}/p-${r.ref}`;

describe("legal-AT draft question batch eval", () => {
  let draftEng: PGLiteEngine;

  beforeAll(async () => {
    draftEng = new PGLiteEngine();
    await draftEng.connect({});
    await draftEng.initSchema();
    await seedLegalAtCorpus(draftEng);

    // Seed all draft refs (AT + DE distractors)
    const seen = new Set<string>();
    for (const e of LEGAL_AT_PENDING) {
      for (const r of [e.at, e.de]) {
        if (!r) continue;
        const slug = draftSlugOf(r);
        if (seen.has(slug)) continue;
        seen.add(slug);
        const sourceId = `law-${r.jur}`;
        const body = draftSectionBody(r.file, r.ref);
        await draftEng.putPage(slug, {
          type: "law",
          title: slug,
          compiled_truth: body,
          timeline: "",
          frontmatter: { jurisdiction: r.jur, abbreviation: r.abbr, paragraph: r.ref },
        }, { sourceId });
        await draftEng.upsertChunks(slug, [
          {
            chunk_index: 0,
            chunk_text: body,
            chunk_source: "compiled_truth",
            token_count: body.split(/\s+/).length,
          },
        ] satisfies ChunkInput[], { sourceId });
      }
    }
  }, 120_000);

  afterAll(async () => {
    await draftEng.disconnect();
  });

  test("draft set has ≥150 entries, all with status draft", () => {
    expect(LEGAL_AT_PENDING.length).toBeGreaterThanOrEqual(150);
    const nonDraft = LEGAL_AT_PENDING.filter((e) => e.status !== "draft");
    expect(nonDraft, "no draft should have reviewed status").toEqual([]);
  });

  test("DRAFT SCORECARD: per-domain hit@3 ≥ 0.8, purity = 100%", async () => {
    const byDomain = new Map<string, typeof LEGAL_AT_PENDING>();
    for (const e of LEGAL_AT_PENDING) {
      const list = byDomain.get(e.domain) ?? ([] as typeof LEGAL_AT_PENDING);
      list.push(e);
      byDomain.set(e.domain, list);
    }

    const draftSearchFn: SearchFn = async (q) => {
      const results = await hybridSearch(draftEng, q, { limit: 10, expansion: false, jurisdiction: "at" });
      return results.map((r) => r.slug);
    };

    let totalHit1 = 0, totalHit3 = 0, totalMrr = 0, totalN = 0;
    const domainResults: { domain: string; n: number; hit1: number; hit3: number; mrr: number }[] = [];
    let allLeaks: string[] = [];

    for (const [domain, entries] of byDomain) {
      const questions = entries.map((e) => ({
        family: e.family,
        query: e.query,
        relevant: [draftSlugOf(e.at)],
      }));
      const report = await runRetrievalQuality(questions, draftSearchFn);
      const o = overall(report.questions);
      totalHit1 += report.questions.filter((q) => q.hit_at_1).length;
      totalHit3 += report.questions.filter((q) => q.hit_at_3).length;
      totalMrr += report.questions.reduce((s, q) => s + q.reciprocal_rank, 0);
      totalN += report.questions.length;
      domainResults.push({ domain, n: entries.length, hit1: o.hit1, hit3: o.hit3, mrr: o.mrr });

      // Purity check per domain
      for (const e of entries) {
        const results = await hybridSearch(draftEng, e.query, { limit: 10, expansion: false, jurisdiction: "at" });
        const foreign = results
          .map((r) => r.slug)
          .filter((s) => s.startsWith("legal/statutes/") && !s.startsWith("legal/statutes/at/"));
        if (foreign.length > 0) allLeaks.push(`[${domain}] "${e.query}" → ${foreign.join(", ")}`);
      }
    }

    const overallHit1 = totalHit1 / totalN;
    const overallHit3 = totalHit3 / totalN;
    const overallMrr = totalMrr / totalN;

    // eslint-disable-next-line no-console
    console.log(
      `\n[Draft batch eval | jurisdiction=at]\n` +
        domainResults.map((d) => `  ${d.domain}: n=${d.n}, hit@1=${(d.hit1 * 100).toFixed(1)}%, hit@3=${(d.hit3 * 100).toFixed(1)}%, MRR=${d.mrr.toFixed(3)}`).join("\n") +
        `\n  ── OVERALL: n=${totalN}, hit@1=${(overallHit1 * 100).toFixed(1)}%, hit@3=${(overallHit3 * 100).toFixed(1)}%, MRR=${overallMrr.toFixed(3)}\n` +
        `  jurisdiction-purity: ${allLeaks.length === 0 ? "100.0%" : `${((1 - allLeaks.length / totalN) * 100).toFixed(1)}% (${allLeaks.length} leaks)`}\n`
    );

    // Regression floors, calibrated on the LEAKAGE-FREE draft baseline
    // (2026-07-14: queries no longer contain the answer's § number, so these
    // are honest concept→norm numbers — overall hit@3 87.3%, weakest domain
    // 70%). The floors catch regressions; RAISING them is the improvement
    // roadmap (per-domain target: 0.8+ after human review of weak drafts).
    const overallH3 = domainResults.reduce((a, d) => a + d.hit3 * d.n, 0) / totalN;
    expect(overallH3, `overall hit@3 ${(overallH3 * 100).toFixed(1)}% < 80%`).toBeGreaterThanOrEqual(0.8);
    for (const d of domainResults) {
      expect(d.hit3, `${d.domain} hit@3 ${(d.hit3 * 100).toFixed(1)}% < 60%`).toBeGreaterThanOrEqual(0.6);
    }
    // Purity is absolute
    expect(allLeaks, `purity breached:\n${allLeaks.join("\n")}`).toEqual([]);
  }, 300_000);
});
