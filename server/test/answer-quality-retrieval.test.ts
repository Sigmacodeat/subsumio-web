/**
 * Retrieval half of the answer-quality gate — deterministic, no model, runs
 * in every CI build. For each eval question the gather step must surface the
 * statute the answer depends on and must NOT surface German law for an
 * Austrian question (jurisdiction isolation). The model half lives in
 * src/eval/answer-quality/run.ts (needs a key).
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { runGather } from "../src/core/think/gather.ts";
import { EVAL_READ_SOURCES, loadFixtureCorpus } from "../src/eval/answer-quality/corpus.ts";
import { EVAL_CASES } from "../src/eval/answer-quality/fixtures.ts";
import { scoreCase, gateVerdict } from "../src/eval/answer-quality/score.ts";

let engine: PGLiteEngine;

beforeAll(async () => {
  engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await loadFixtureCorpus(engine);
}, 60_000);

afterAll(async () => {
  if (engine) await engine.disconnect();
});

const EXPECTED_SLUG: Record<string, string> = {
  "verjaehrung-schadenersatz": "legal/statute/at/abgb-1489",
  "verjaehrung-beginn": "legal/statute/at/abgb-1489",
  berufungsfrist: "legal/statute/at/zpo-464",
  "gewaehrleistung-beweglich": "legal/statute/at/abgb-933",
};

describe("answer-quality retrieval (AT)", () => {
  for (const [id, slug] of Object.entries(EXPECTED_SLUG)) {
    test(`${id}: retrieves ${slug}, never German law`, async () => {
      const c = EVAL_CASES.find((x) => x.id === id)!;
      const g = await runGather(engine, {
        question: c.question,
        jurisdiction: "at",
        sourceIds: EVAL_READ_SOURCES,
        gatherLimit: 10,
        takesLimit: 0,
      });
      const slugs = g.pages.map((p) => p.slug);
      expect(slugs).toContain(slug);
      expect(slugs.some((s) => s.startsWith("legal/statute/de/"))).toBe(false);
    });

    test(`${id}: the query planner's statute scope reaches ${slug}`, async () => {
      const { executeQueryPlan } = await import("../src/core/think/query-planner.ts");
      const c = EVAL_CASES.find((x) => x.id === id)!;
      const results = await executeQueryPlan(
        engine,
        {
          intent: "statute_lookup",
          decomposed: true,
          sub_queries: [{ query: c.question, source_type: "statutes", jurisdiction: "at" }],
        },
        { question: c.question, jurisdiction: "at", sourceIds: EVAL_READ_SOURCES, limit: 10 }
      );
      expect(results.map((r) => r.slug)).toContain(slug);
    });
  }
});

describe("answer-quality scoring", () => {
  test("a correct answer passes; a German-law answer is contamination", () => {
    const c = EVAL_CASES.find((x) => x.id === "verjaehrung-schadenersatz")!;
    expect(scoreCase(c, "Nach § 1489 ABGB verjähren sie in drei Jahren.").passed).toBe(true);
    const bad = scoreCase(c, "Nach § 1489 ABGB drei Jahre, vgl. § 195 BGB.");
    expect(bad.contaminated).toBe(true);
    expect(gateVerdict([bad]).ok).toBe(false);
  });

  test("abstention case rejects an invented norm", () => {
    const c = EVAL_CASES.find((x) => x.id === "abstention-ausserhalb-korpus")!;
    expect(scoreCase(c, "Dazu sind in den Quellen keine Informationen enthalten.").passed).toBe(
      true
    );
    expect(scoreCase(c, "Gemäß § 7 GrEStG beträgt sie 3,5 %.").passed).toBe(false);
  });
});
