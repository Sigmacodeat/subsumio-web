#!/usr/bin/env bun
/**
 * Analyze why pages have compiled_truth but no chunks.
 * Outputs JSON with suspected cause per page.
 */

import { loadConfig, toEngineConfig } from "../src/core/config.ts";
import { createEngine } from "../src/core/engine-factory.ts";
import { buildGatewayConfig } from "../src/core/ai/build-gateway-config.ts";
import { configureGateway } from "../src/core/ai/gateway.ts";
import { chunkText } from "../src/core/chunkers/recursive.ts";
import { chunkLegalSection } from "../src/core/chunkers/legal-statute.ts";
import { chunkLegalDecision } from "../src/core/chunkers/legal-decision.ts";

async function main() {
  const cfg = loadConfig();
  if (!cfg) throw new Error("No config");
  configureGateway(buildGatewayConfig(cfg));
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  const rows = (await engine.executeRaw(`
    SELECT p.id, p.source_id, p.slug, p.compiled_truth, p.frontmatter
    FROM pages p
    LEFT JOIN content_chunks c ON c.page_id = p.id
    WHERE p.deleted_at IS NULL AND p.compiled_truth != '' AND c.id IS NULL
    ORDER BY p.source_id, p.slug
  `)) as any[];

  const results: any[] = [];

  for (const r of rows) {
    const fm = (r.frontmatter as Record<string, unknown>) || {};
    const type = (fm.type as string) || "";
    const text = (r.compiled_truth as string) || "";
    const len = text.length;
    let chunks = 0;
    let chunker = "unknown";
    let error = "";

    try {
      if (["law", "statute"].includes(type) || r.slug.startsWith("legal/statutes/")) {
        const paragraphRef = typeof fm.paragraph === "string" ? fm.paragraph : "";
        const statuteAbbr = typeof fm.abbreviation === "string" ? fm.abbreviation : "";
        const jurisdiction = typeof fm.jurisdiction === "string" ? fm.jurisdiction : "";
        const res = chunkLegalSection(text, {
          paragraph_ref: paragraphRef,
          statute_abbr: statuteAbbr,
          jurisdiction,
        });
        chunks = res.length;
        chunker = "chunkLegalSection";
      } else if (
        ["court_decision", "judgement"].includes(type) ||
        r.slug.startsWith("legal/judikatur/")
      ) {
        const res = chunkLegalDecision(text, {
          court: typeof fm.court === "string" ? fm.court : "",
          case_number: typeof fm.case_number === "string" ? fm.case_number : "",
          decision_date: typeof fm.decision_date === "string" ? fm.decision_date : "",
          ecli: typeof fm.ecli === "string" ? fm.ecli : "",
          legal_area: typeof fm.legal_area === "string" ? fm.legal_area : "",
          jurisdiction: typeof fm.jurisdiction === "string" ? fm.jurisdiction : "",
        });
        chunks = res.length;
        chunker = "chunkLegalDecision";
      } else {
        const res = chunkText(text);
        chunks = res.length;
        chunker = "chunkText";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      chunks = -1;
    }

    let cause = "";
    if (chunks === 0) cause = "chunker_returns_zero";
    else if (chunks === -1) cause = "chunker_error";
    else if (len < 50) cause = "very_short_text";
    else cause = "chunker_would_work_now";

    results.push({
      id: r.id,
      source_id: r.source_id,
      slug: r.slug,
      compiled_truth_length: len,
      first_100: text.slice(0, 100),
      type,
      chunker,
      chunks_now: chunks,
      error,
      cause,
    });
  }

  const outputPath = "/tmp/analyze-pages-without-chunks.json";
  await Bun.write(outputPath, JSON.stringify(results, null, 2));

  const byCause = new Map<string, number>();
  for (const r of results) {
    byCause.set(r.cause, (byCause.get(r.cause) || 0) + 1);
  }

  console.log("Pages without chunks:", results.length);
  console.log("Causes:");
  for (const [cause, cnt] of byCause) {
    console.log(`  ${cause}: ${cnt}`);
  }
  console.log("Output:", outputPath);

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
