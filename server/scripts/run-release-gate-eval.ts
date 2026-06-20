#!/usr/bin/env bun
/**
 * AI-Quality Release Gate — real, free, deterministic CI check.
 *
 * Followup-plan item B.6: `evaluateReleaseGate()` (src/lib/release-gate.ts)
 * existed but was never called from CI — it was a manually-triggered admin
 * diagnostic, not a release gate. The honest path to a real gate is harder
 * than "call the existing /api/release-gate route from CI": that route reads
 * eval HISTORY from a brain page that nothing ever populates automatically,
 * so wiring a curl step against it today would just print "no eval runs,
 * status: warn" forever — compliance theater, not a gate.
 *
 * This script instead runs the gate against a REAL (if small) retrieval
 * pipeline: a PGLite engine (no Postgres/Docker needed), seeded with a
 * fixed, version-controlled fixture corpus, queried via the engine's actual
 * `searchKeyword()` — same ranking code the product uses, zero embedding/LLM
 * API calls (so it's free and deterministic; no cost-per-PR, no flakiness
 * from a live model). It is intentionally NOT the full EVAL_FIXTURES corpus
 * from src/lib/rag-eval.ts (those reference the imported German/Austrian
 * statute corpus, which isn't seeded in CI) — this is a narrower, structural
 * smoke check: "does basic keyword retrieval still find obviously-relevant
 * pages for obviously-matching queries". A full live-quality gate (hybrid
 * search + embeddings + a judged fixture set) is a separate, larger
 * project — see the followup-plan note for why it isn't built here.
 *
 * Exit code 0 = pass/warn, 1 = fail (blocks the CI job that runs this).
 */

import { PGLiteEngine } from "../src/core/pglite-engine.ts";
import { runEval, type EvalQuery } from "../../src/lib/rag-eval.ts";
import { evaluateReleaseGate, DEFAULT_THRESHOLDS } from "../../src/lib/release-gate.ts";

const FIXTURE_PAGES: Array<{ slug: string; type: string; title: string; content: string }> = [
  {
    slug: "legal/cases/2026-014",
    type: "legal_case",
    title: "Müller ./. Schmidt — Kaufvertrag",
    content:
      "Streitwert 25.000 EUR. Kaufvertrag über einen Gebrauchtwagen, Mängelrüge nach § 437 BGB.",
  },
  {
    slug: "legal/cases/2026-022",
    type: "legal_case",
    title: "Becker ./. Stadt Köln — Verwaltungsrecht",
    content:
      "Widerspruch gegen Bauvorbescheid, Verwaltungsgerichtsverfahren, Fristsetzung nach VwGO.",
  },
  {
    slug: "legal/deadlines/zpo-berufung",
    type: "note",
    title: "Berufungsfrist ZPO",
    content:
      "Die Berufungsfrist beträgt einen Monat nach Zustellung des vollständigen Urteils, § 517 ZPO.",
  },
  {
    slug: "legal/contracts/vertrag-2026-005",
    type: "legal_contract",
    title: "Mietvertrag Gewerberaum",
    content: "Gewerbemietvertrag über Büroräume, Laufzeit 5 Jahre, Kündigungsfrist 6 Monate.",
  },
  {
    slug: "legal/notes/rvg-berechnung",
    type: "note",
    title: "RVG-Gebührenberechnung",
    content:
      "Berechnung der Rechtsanwaltsgebühren nach RVG, Verfahrensgebühr, Terminsgebühr, Einigungsgebühr.",
  },
];

const FIXTURES: EvalQuery[] = [
  {
    id: "smoke-kaufvertrag",
    query: "Kaufvertrag Gebrauchtwagen Mängelrüge",
    expectedSlugs: ["legal/cases/2026-014"],
    category: "general",
  },
  {
    id: "smoke-berufungsfrist",
    query: "Berufungsfrist nach Zustellung des Urteils",
    expectedSlugs: ["legal/deadlines/zpo-berufung"],
    category: "procedure",
  },
  {
    id: "smoke-mietvertrag",
    query: "Gewerbemietvertrag Kündigungsfrist",
    expectedSlugs: ["legal/contracts/vertrag-2026-005"],
    category: "contract_clause",
  },
  {
    id: "smoke-rvg",
    query: "RVG Verfahrensgebühr Terminsgebühr Berechnung",
    expectedSlugs: ["legal/notes/rvg-berechnung"],
    category: "general",
  },
];

async function main() {
  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  try {
    for (const page of FIXTURE_PAGES) {
      await engine.putPage(
        page.slug,
        {
          type: page.type as never,
          title: page.title,
          compiled_truth: page.content,
          timeline: "",
          frontmatter: {},
        } as never,
        { sourceId: "default" }
      );
      // putPage alone does not populate the chunk-grain search_vector that
      // searchKeyword reads — upsertChunks is what indexes content for FTS
      // (see test/chunk-grain-fts.test.ts for the same pattern).
      await engine.upsertChunks(page.slug, [
        { chunk_index: 0, chunk_text: page.content, chunk_source: "compiled_truth" },
      ]);
    }

    const retriever = async (query: string): Promise<string[]> => {
      const results = await engine.searchKeyword(query, { limit: 10, sourceId: "default" });
      return results.map((r) => r.slug);
    };

    const summary = await runEval(retriever, FIXTURES, { k: 10 });
    // No baseline/history in CI yet — see file header. `quality` (contract/
    // deadline-detection AI-quality report) is also not produced by this
    // smoke corpus, so it's null; the gate degrades those two checks to
    // "skip" rather than failing on missing data (see release-gate.ts).
    const result = evaluateReleaseGate(summary, null, null, DEFAULT_THRESHOLDS);

    console.log(`Release gate: ${result.status}`);
    console.log(result.summary);
    for (const check of result.checks) {
      console.log(`  [${check.status}] ${check.name}: ${check.message}`);
    }

    if (result.status === "fail") {
      console.error("\nRelease gate FAILED — retrieval quality regressed below threshold.");
      process.exit(1);
    }
    process.exit(0);
  } finally {
    await engine.disconnect();
  }
}

main().catch((err) => {
  console.error("[release-gate-eval] crashed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
