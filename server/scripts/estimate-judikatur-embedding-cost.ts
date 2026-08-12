/**
 * Estimate embedding cost for judikatur mass import.
 *
 * Measures average character count of existing decisions, extrapolates
 * to target count, and computes USD cost using embedding-pricing.ts.
 *
 *   bun run server/scripts/estimate-judikatur-embedding-cost.ts [--target 5000]
 *
 * Output: cost estimate report to stdout + JSON to stderr.
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  lookupEmbeddingPrice,
  estimateCostFromChars,
} from "../src/core/embedding-pricing.ts";

const args = process.argv.slice(2);
const targetIdx = args.indexOf("--target");
const TARGET = targetIdx >= 0 ? parseInt(args[targetIdx + 1], 10) : 5000;

const JUDIKATUR_DIR = join(import.meta.dir, "..", "..", "law-corpus", "at-judikatur");
const EMBEDDING_MODEL = "openrouter:openai/text-embedding-3-small";

interface DecisionStats {
  filename: string;
  charCount: number;
  hasText: boolean;
}

function measureDecisions(dir: string): DecisionStats[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  return files.map((f) => {
    const content = readFileSync(join(dir, f), "utf-8");
    const hasText = !content.includes("*Volltext nicht abrufbar");
    return { filename: f, charCount: content.length, hasText };
  });
}

async function main() {
  const stats = measureDecisions(JUDIKATUR_DIR);
  const current = stats.length;
  const withText = stats.filter((s) => s.hasText);

  const avgChars = withText.length > 0
    ? Math.round(withText.reduce((s, d) => s + d.charCount, 0) / withText.length)
    : 0;
  const totalChars = withText.reduce((s, d) => s + d.charCount, 0);
  const minChars = withText.length > 0 ? Math.min(...withText.map((s) => s.charCount)) : 0;
  const maxChars = withText.length > 0 ? Math.max(...withText.map((s) => s.charCount)) : 0;

  const priceResult = lookupEmbeddingPrice(EMBEDDING_MODEL);
  const pricePerMTok = priceResult.kind === "known" ? priceResult.pricePerMTok : 0.02;

  const currentTokens = Math.ceil(totalChars / 3.5);
  const currentCost = estimateCostFromChars(totalChars, pricePerMTok);

  const projectedAvgChars = avgChars;
  const projectedTotalChars = projectedAvgChars * TARGET;
  const projectedTokens = Math.ceil(projectedTotalChars / 3.5);
  const projectedCost = estimateCostFromChars(projectedTotalChars, pricePerMTok);

  const ratio = TARGET / current;
  const noTextCount = stats.length - withText.length;
  const noTextPct = current > 0 ? ((noTextCount / current) * 100).toFixed(1) : "0";

  const report = {
    model: EMBEDDING_MODEL,
    price_per_mtok_usd: pricePerMTok,
    current: {
      decisions: current,
      with_text: withText.length,
      no_text: noTextCount,
      no_text_pct: parseFloat(noTextPct),
      avg_chars: avgChars,
      min_chars: minChars,
      max_chars: maxChars,
      total_chars: totalChars,
      estimated_tokens: currentTokens,
      estimated_cost_usd: parseFloat(currentCost.toFixed(4)),
    },
    projected: {
      target_decisions: TARGET,
      ratio: parseFloat(ratio.toFixed(1)),
      projected_total_chars: projectedTotalChars,
      projected_tokens: projectedTokens,
      projected_cost_usd: parseFloat(projectedCost.toFixed(4)),
    },
  };

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Subsumio — Embedding Cost Estimation (Judikatur Mass Import)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log();
  console.log(`  Model:              ${EMBEDDING_MODEL}`);
  console.log(`  Price:              $${pricePerMTok} per 1M tokens`);
  console.log();
  console.log("  CURRENT (existing decisions):");
  console.log(`    Total decisions:  ${current}`);
  console.log(`    With full text:   ${withText.length} (${noTextCount} without = ${noTextPct}%)`);
  console.log(`    Avg chars/decision: ${avgChars.toLocaleString()}`);
  console.log(`    Min/Max chars:    ${minChars.toLocaleString()} / ${maxChars.toLocaleString()}`);
  console.log(`    Total chars:      ${totalChars.toLocaleString()}`);
  console.log(`    Est. tokens:      ${currentTokens.toLocaleString()}`);
  console.log(`    Est. cost:        $${currentCost.toFixed(4)}`);
  console.log();
  console.log("  PROJECTED (after mass import):");
  console.log(`    Target decisions: ${TARGET}`);
  console.log(`    Scale factor:     ${ratio.toFixed(1)}x`);
  console.log(`    Projected chars:  ${projectedTotalChars.toLocaleString()}`);
  console.log(`    Projected tokens: ${projectedTokens.toLocaleString()}`);
  console.log(`    Projected cost:   $${projectedCost.toFixed(4)}`);
  console.log();
  console.log(`  COST DELTA:         $${(projectedCost - currentCost).toFixed(4)}`);
  console.log("═══════════════════════════════════════════════════════════");

  process.stderr.write(JSON.stringify(report, null, 2) + "\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
