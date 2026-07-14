/**
 * Diagnostic probe (Task B): what does the live engine retrieve for the
 * ambiguous term "Berufung" (civil ZPO vs criminal StPO)?
 *
 * Root question from live-002: gold-at-lit-001 expects § 401 ZPO (civil
 * Berufung, 4 weeks) but the model answered with § 466 StPO-AT (criminal
 * Berufung, 3 days). This probe prints the ranked retrieval for the raw task
 * prompt AND for a domain-disambiguated variant, so we can attribute the miss
 * to ranking vs. coverage vs. query phrasing — before touching any code.
 *
 * Usage:  bun run server/scripts/probe-berufung-retrieval.ts
 */

import { createLiveEngineSearch } from "../src/eval/lab-dach/retrieval-adapter.ts";

const PROBES: Array<{ label: string; query: string }> = [
  {
    label: "raw task prompt (gold-at-lit-001)",
    query:
      "K erhebt gegen ein Urteil des Bezirksgerichts Berufung. Das Urteil wurde dem K am 01.07.2026 zugestellt. K reicht die Berufung am 28.07.2026 ein. Prüfen Sie, ob die Berufung fristgerecht eingebracht wurde.",
  },
  { label: "bare ambiguous term", query: "Berufung Frist" },
  { label: "civil-disambiguated", query: "Berufungsfrist Zivilprozess ZPO Urteil Bezirksgericht" },
  { label: "criminal-disambiguated", query: "Berufung Strafverfahren StPO Urteil" },
];

async function main() {
  const handle = await createLiveEngineSearch({ llmRerank: true });
  try {
    for (const p of PROBES) {
      const results = await handle.searchFn(p.query, { jurisdiction: "at", limit: 8 });
      console.log(`\n### ${p.label}`);
      console.log(`Query: ${p.query.slice(0, 90)}${p.query.length > 90 ? "…" : ""}`);
      results.forEach((r, i) => {
        console.log(`  [${i + 1}] ${r.slug}  (${r.law ?? "-"} ${r.paragraph ?? ""})  score=${r.score.toFixed(3)}`);
      });
      const zpo401 = results.findIndex((r) => /zpo\/p-401\b/.test(r.slug));
      const stpo = results.findIndex((r) => /stpo/i.test(r.slug));
      console.log(`  → ZPO §401 rank: ${zpo401 >= 0 ? zpo401 + 1 : "MISS"} | StPO present at rank: ${stpo >= 0 ? stpo + 1 : "no"}`);
    }
  } finally {
    await handle.disconnect();
  }
}

main().catch((err) => {
  console.error("probe failed:", err);
  process.exit(1);
});
