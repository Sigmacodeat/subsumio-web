/**
 * Relational A/B proof + no-regression gate (PGLite, default CI).
 *
 * Seeds the lexically-unrecoverable relational corpus, then runs the gold
 * question set twice through bare hybridSearch — relational arm OFF vs ON —
 * and asserts:
 *   1. recall@10 on the graph-relationship family jumps materially with the
 *      arm on (the answers are unreachable by keyword/vector).
 *   2. a non-relational content query returns the SAME results with the arm
 *      on vs off (the arm is a true no-op off-target — the regression gate).
 *
 * This is the headline proof artifact for the feature: relational queries
 * that the corpus can't surface lexically jump from ~0 to high recall.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { hybridSearch } from "../src/core/search/hybrid.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { setEnvForFile } from "./helpers/with-env.ts";
import {
  runRetrievalQuality,
  parseQuestionsJsonl,
  type SearchFn,
} from "../src/eval/retrieval-quality/harness.ts";
import {
  seedRelationalCorpus,
  RELATIONAL_QUESTIONS,
} from "./fixtures/retrieval-quality/relational/corpus.ts";
import { readFileSync } from "fs";

let eng: PGLiteEngine;
let fakeHome: string;
let releaseEnv: () => void;

beforeAll(async () => {
  // Isolate the file-plane config: a developer ~/.gbrain/config.json can
  // resolve a no-auth provider (ollama) whose embed call stalls on the 6s
  // query deadline per question — ~30 questions × 2 arms → 120s timeout.
  // The relational arm is graph-based and needs no embedding provider.
  fakeHome = mkdtempSync(join(tmpdir(), "gbrain-rel-ab-"));
  releaseEnv = setEnvForFile({ GBRAIN_HOME: fakeHome });

  const scrubbed = { ...process.env };
  for (const k of [
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "OPENROUTER_API_KEY_FALLBACK",
    "ANTHROPIC_API_KEY",
    "DATABASE_URL",
  ]) {
    delete scrubbed[k];
  }
  configureGateway({
    embedding_model: "openai:text-embedding-3-large",
    embedding_dimensions: 1536,
    env: scrubbed,
  });

  eng = new PGLiteEngine();
  await eng.connect({});
  await eng.initSchema();
  await seedRelationalCorpus(eng);
}, 60_000);

afterAll(async () => {
  await eng.disconnect();
  releaseEnv();
  rmSync(fakeHome, { recursive: true, force: true });
});

const searchFnWith =
  (relationalRetrieval: boolean): SearchFn =>
  async (q) => {
    const results = await hybridSearch(eng, q, {
      limit: 10,
      relationalRetrieval,
      expansion: false,
    });
    return results.map((r) => r.slug);
  };

describe("relational A/B", () => {
  test("corpus has a meaningful question set", () => {
    expect(RELATIONAL_QUESTIONS.length).toBeGreaterThanOrEqual(30);
  });

  test("relational.jsonl matches the corpus module (no drift)", () => {
    const path = join(import.meta.dir, "fixtures/retrieval-quality/relational/relational.jsonl");
    const fromFile = parseQuestionsJsonl(readFileSync(path, "utf8"));
    expect(JSON.stringify(fromFile)).toBe(JSON.stringify(RELATIONAL_QUESTIONS));
  });

  test("recall@10 lifts materially with the relational arm ON", async () => {
    const off = await runRetrievalQuality(RELATIONAL_QUESTIONS, searchFnWith(false));
    const on = await runRetrievalQuality(RELATIONAL_QUESTIONS, searchFnWith(true));

    const offFam = off.families.find((f) => f.family === "graph-relationship")!;
    const onFam = on.families.find((f) => f.family === "graph-relationship")!;

    // Answers are lexically unrecoverable → baseline recall is near zero.
    expect(offFam.recall_at_10).toBeLessThan(0.25);
    // Typed-edge arm surfaces them → large lift.
    expect(onFam.recall_at_10).toBeGreaterThan(0.75);
    expect(onFam.recall_at_10 - offFam.recall_at_10).toBeGreaterThan(0.5);
    // Hit@3 should also rise sharply.
    expect(onFam.hit_at_3).toBeGreaterThan(offFam.hit_at_3);
  }, 120_000);

  test("no-regression: non-relational query is identical arm-on vs arm-off", async () => {
    const q = "early-stage venture fund first checks";
    const off = await searchFnWith(false)(q);
    const on = await searchFnWith(true)(q);
    expect(on).toEqual(off);
  }, 60_000);
});
