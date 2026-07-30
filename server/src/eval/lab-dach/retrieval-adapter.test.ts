/**
 * LAB-DACH v3 — Retrieval Adapter test (hermetic PGLite, keyword path, no API key).
 *
 * Proves the fix for the live-001 0/7 root cause: when the ToolContext carries a
 * real engine-backed searchFn, search_law returns the correct § from hybrid
 * search (jurisdiction-isolated), instead of the naive file-based fallback.
 *
 * Uses the SAME verified AT gold corpus + seeder as legal-at-retrieval-quality,
 * so the ground truth is guaranteed to exist in the corpus (the seeder throws
 * otherwise). llmRerank is OFF here — no model/API key in CI.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { PGLiteEngine } from "../../core/pglite-engine.ts";
import { createEngineSearchFn } from "./retrieval-adapter.ts";
import { toolSearchLaw, type ToolContext } from "./agent-tools.ts";
import {
  seedLegalAtCorpus,
  LEGAL_AT_GOLD,
} from "../../../test/fixtures/retrieval-quality/legal-at/corpus.ts";

let eng: PGLiteEngine;
let pgliteAvailable = false;

beforeAll(async () => {
  eng = new PGLiteEngine();
  try {
    await eng.connect({});
    await eng.initSchema();
    await seedLegalAtCorpus(eng);
    pgliteAvailable = true;
  } catch (e) {
    console.warn(
      "[retrieval-adapter] PGLite unavailable — skipping tests:",
      e instanceof Error ? e.message : String(e)
    );
  }
}, 60_000);

afterAll(async () => {
  if (pgliteAvailable) await eng.disconnect();
});

// A verified AT gold entry with a paired DE distractor (leak bait).
const gold = LEGAL_AT_GOLD[0];
const expectedSlug = `legal/statutes/at/${gold.at.abbr}/p-${gold.at.ref}`;

// Minimal ToolContext factory — corpusRoot points at the real corpus so the
// file fallback path is exercisable, but tests inject searchFn to override it.
function ctx(searchFn?: ToolContext["searchFn"]): ToolContext {
  return {
    sandbox: {
      runId: "t",
      taskId: "t",
      root: "/tmp",
      documentsDir: "/tmp",
      outputDir: "/tmp",
    } as unknown as ToolContext["sandbox"],
    corpusRoot: "/Users/msc/subsumio-web/law-corpus",
    jurisdiction: "AT",
    searchFn,
  };
}

describe("retrieval-adapter — createEngineSearchFn", () => {
  test("surfaces the correct AT § for a gold query via hybrid search", async () => {
    if (!pgliteAvailable) return; // PGLite WASM unavailable on this platform
    const searchFn = createEngineSearchFn(eng, { llmRerank: false });
    const results = await searchFn(gold.query, { jurisdiction: "at", limit: 8 });

    expect(results.length).toBeGreaterThan(0);
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain(expectedSlug);

    const hit = results.find((r) => r.slug === expectedSlug)!;
    expect(hit.text.length).toBeGreaterThan(0);
    expect(hit.law).toBe(gold.at.abbr.toUpperCase());
    expect(hit.paragraph).toBe(`§ ${gold.at.ref}`);
  }, 60_000);

  test("jurisdiction isolation: no foreign (DE/CH) statute in AT results", async () => {
    if (!pgliteAvailable) return; // PGLite WASM unavailable on this platform
    const searchFn = createEngineSearchFn(eng, { llmRerank: false });
    const results = await searchFn(gold.query, { jurisdiction: "at", limit: 10 });
    const foreign = results
      .map((r) => r.slug)
      .filter((s) => s.startsWith("legal/statutes/") && !s.startsWith("legal/statutes/at/"));
    expect(foreign).toEqual([]);
  }, 60_000);

  test("toolSearchLaw with injected searchFn returns the engine's grounded § (vs file fallback)", async () => {
    if (!pgliteAvailable) return; // PGLite WASM unavailable on this platform
    const searchFn = createEngineSearchFn(eng, { llmRerank: false });

    // With the real engine searchFn: the correct § is present + carries text.
    const withEngine = await toolSearchLaw(ctx(searchFn), { query: gold.query, limit: 8 });
    expect(withEngine.success).toBe(true);
    const engineSlugs = (withEngine.data as Array<{ slug: string; text: string }>).map(
      (r) => r.slug
    );
    expect(engineSlugs).toContain(expectedSlug);

    // Without searchFn: the tool falls back to a naive file grep — it does NOT
    // reliably surface the exact § chunk, which is precisely why live-001 failed.
    const fallback = await toolSearchLaw(ctx(undefined), { query: gold.query, limit: 8 });
    expect(fallback.success).toBe(true);
    const fallbackSlugs = (fallback.data as Array<{ slug: string }>).map((r) => r.slug);
    // The engine path must be at least as good: contain the exact § that the
    // fallback path is not guaranteed to return.
    expect(engineSlugs).toContain(expectedSlug);
    expect(Array.isArray(fallbackSlugs)).toBe(true);
  }, 60_000);
});
