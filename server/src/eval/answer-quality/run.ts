/**
 * Answer-quality eval gate — runs the REAL think pipeline (retrieval +
 * model + citation guardrail + cross-verify) on the fixture corpus and fails
 * (exit 1) when the pass rate drops below the floor or any answer cites the
 * wrong jurisdiction.
 *
 *   bun run src/eval/answer-quality/run.ts [--min-pass=0.8]
 *
 * Needs a chat model key (OPENROUTER_API_KEY or ANTHROPIC_API_KEY). Without
 * one it exits 0 with a notice — CI decides via the secret whether to gate.
 * Cost: ~6 questions × (answer + verification) ≈ a few cents per run.
 */

import { PGLiteEngine } from "../../core/pglite-engine.ts";
import { configureGateway } from "../../core/ai/gateway.ts";
import { buildGatewayConfig } from "../../core/ai/build-gateway-config.ts";
import { loadConfig } from "../../core/config.ts";
import { runThink } from "../../core/think/index.ts";
import { EVAL_CASES } from "./fixtures.ts";
import { EVAL_READ_SOURCES, loadFixtureCorpus } from "./corpus.ts";
import { EVAL_TENANT } from "./fixtures.ts";
import { gateVerdict, scoreCase, type CaseResult } from "./score.ts";

async function main(): Promise<void> {
  const minPass = Number(
    process.argv.find((a) => a.startsWith("--min-pass="))?.split("=")[1] ?? "0.8"
  );
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log("[answer-quality] no model key configured — skipped (not a pass).");
    return;
  }
  configureGateway(
    buildGatewayConfig({ ...(loadConfig() ?? { engine: "pglite" }) } as Parameters<
      typeof buildGatewayConfig
    >[0])
  );

  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();
  await loadFixtureCorpus(engine);

  const results: CaseResult[] = [];
  for (const c of EVAL_CASES) {
    const r = await runThink(engine, {
      question: c.question,
      legalMode: true,
      jurisdiction: "AT",
      remote: false,
      // Same federation as a web request for an AT matter (web-api.ts).
      sourceId: EVAL_TENANT,
      allowedSources: EVAL_READ_SOURCES,
      searchMode: "balanced",
    });
    const scored = scoreCase(c, r.answer);
    results.push(scored);
    const mark = scored.passed ? "PASS" : "FAIL";
    console.log(`[answer-quality] ${mark} ${c.id}`);
    if (!scored.passed) {
      if (scored.missing.length) console.log(`    missing:   ${scored.missing.join(", ")}`);
      if (scored.forbidden.length) console.log(`    forbidden: ${scored.forbidden.join(", ")}`);
      if (scored.contaminated)
        console.log("    CONTAMINATION: German norm cited in an AT question");
      console.log(`    answer: ${r.answer.slice(0, 400).replace(/\s+/g, " ")}`);
    }
  }
  await engine.disconnect();

  const v = gateVerdict(results, minPass);
  console.log(
    `[answer-quality] pass rate ${(v.passRate * 100).toFixed(0)}% (floor ${(minPass * 100).toFixed(0)}%), contamination ${v.contaminated}`
  );
  if (!v.ok) process.exit(1);
}

main().catch((e) => {
  console.error("[answer-quality] crashed:", e);
  process.exit(2);
});
