/**
 * Phase 3 — jurisdiction-isolation regression guard for the new Harvey-pattern
 * retrieval paths (hermetic PGLite, keyword path, no API key).
 *
 * case-analyzer (retrieveStatutesForIssues) and agentic-retrieval
 * (agenticRetrieval) were added AFTER the Phase-1 hard jurisdiction filter.
 * They correctly thread `jurisdiction` into hybridSearch today — but nothing
 * pins that. If a refactor drops `jurisdiction: opts.jurisdiction` from either
 * call, an Austrian case analysis would silently start surfacing German §§
 * again. This guard makes that regression impossible: it drives both entry
 * points over a brain seeded with paired AT/DE statutes and asserts that
 * jurisdiction=at yields ZERO German §§ — and that WITHOUT the filter they
 * leak (so the guard has teeth).
 *
 * Both entry points run hermetically: retrieveStatutesForIssues is pure
 * hybridSearch; agenticRetrieval runs with llmCompletenessCheck=false (its
 * heuristic completeness path needs no LLM).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { retrieveStatutesForIssues, type LegalIssue } from "../src/core/legal/case-analyzer.ts";
import { agenticRetrieval } from "../src/core/think/agentic-retrieval.ts";
import { seedLegalAtCorpus } from "./fixtures/retrieval-quality/legal-at/corpus.ts";

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

// Jurisdiction-neutral issues: the query text matches both the AT and the DE
// provision on the topic, so only the hard filter can keep DE out.
const ISSUES: LegalIssue[] = [
  {
    description: "Verjährung von Schadenersatzansprüchen",
    area: "civil",
    keywords: ["Verjährung", "Schadenersatz"],
    confidence: 1,
  },
  {
    description: "Gewährleistung für Mängel einer Sache",
    area: "civil",
    keywords: ["Gewährleistung", "Mängel"],
    confidence: 1,
  },
  {
    description: "Rücktritt vom Vertrag bei Verzug",
    area: "civil",
    keywords: ["Rücktritt", "Verzug"],
    confidence: 1,
  },
];

const QUESTIONS = ISSUES.map((i) => i.description);

const foreignStatutes = (slugs: string[]): string[] =>
  slugs.filter((s) => s.startsWith("legal/statutes/") && !s.startsWith("legal/statutes/at/"));

describe("new retrieval paths honor jurisdiction isolation (Phase 3 guard)", () => {
  test("case-analyzer retrieveStatutesForIssues: jurisdiction=at surfaces zero German §§", async () => {
    const results = await retrieveStatutesForIssues(ISSUES, eng, { jurisdiction: "at", limit: 30 });
    const foreign = foreignStatutes(results.map((r) => r.slug));
    expect(foreign, `case-analyzer leaked: ${foreign.join(", ")}`).toEqual([]);
    // Sanity: it actually retrieved the AT statutes (not just empty).
    const atHits = results.filter((r) => r.slug.startsWith("legal/statutes/at/"));
    expect(atHits.length).toBeGreaterThan(0);
  }, 30_000);

  test("case-analyzer WITHOUT the filter leaks German §§ (guard has teeth)", async () => {
    const results = await retrieveStatutesForIssues(ISSUES, eng, { limit: 30 });
    const foreign = foreignStatutes(results.map((r) => r.slug));
    expect(foreign.length).toBeGreaterThan(0);
  }, 30_000);

  test("agenticRetrieval: jurisdiction=at surfaces zero German §§ across all rounds", async () => {
    const leaks: string[] = [];
    for (const question of QUESTIONS) {
      const res = await agenticRetrieval(eng, {
        question,
        jurisdiction: "at",
        llmCompletenessCheck: false, // heuristic path — no LLM needed
        limit: 20,
      });
      const foreign = foreignStatutes(res.results.map((r) => r.slug));
      if (foreign.length > 0) leaks.push(`"${question}" → ${foreign.join(", ")}`);
    }
    expect(leaks, `agenticRetrieval leaked:\n${leaks.join("\n")}`).toEqual([]);
  }, 60_000);

  test("agenticRetrieval WITHOUT the filter leaks German §§ (guard has teeth)", async () => {
    let leaked = false;
    for (const question of QUESTIONS) {
      const res = await agenticRetrieval(eng, {
        question,
        llmCompletenessCheck: false,
        limit: 20,
      });
      if (foreignStatutes(res.results.map((r) => r.slug)).length > 0) {
        leaked = true;
        break;
      }
    }
    expect(leaked).toBe(true);
  }, 60_000);
});
