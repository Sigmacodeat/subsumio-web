#!/usr/bin/env bun
/**
 * chunk-analysis — Analyze chunk size distribution for a source.
 */
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    source: { type: "string" },
    limit: { type: "string", default: "200" },
  },
  allowPositionals: false,
});

const SOURCE_ID = values.source as string;
const LIMIT = parseInt(values.limit as string, 10) || 200;

if (!SOURCE_ID) {
  console.error("ERROR: --source is required");
  process.exit(1);
}

async function main() {
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { chunkLegalDecision } = await import("../src/core/chunkers/legal-decision.ts");
  const { chunkLegalSection } = await import("../src/core/chunkers/legal-statute.ts");
  const { chunkText } = await import("../src/core/chunkers/recursive.ts");
  const { isLegalPage, isCourtDecisionPage } = await import("../src/core/embedding-context.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No config");
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));

  const pages = await engine.executeRaw(
    `SELECT id, compiled_truth, frontmatter FROM pages WHERE source_id = $1 AND deleted_at IS NULL LIMIT $2`,
    [SOURCE_ID, LIMIT]
  );

  const sizes: number[] = [];
  const roles: Record<string, number> = {};

  for (const p of pages) {
    const fm = typeof p.frontmatter === "string" ? JSON.parse(p.frontmatter) : p.frontmatter || {};
    const body = typeof p.compiled_truth === "string" ? p.compiled_truth : "";
    if (!body.trim()) continue;

    const isDecision =
      isCourtDecisionPage(fm) || fm.type === "court_decision" || fm.type === "judgement";
    const isStatute = isLegalPage(fm) || fm.type === "law" || fm.type === "statute";

    if (isDecision) {
      const chunks = chunkLegalDecision(body, {
        court: fm.court || "",
        case_number: fm.case_number || "",
        decision_date: fm.decision_date || "",
        ecli: fm.ecli || "",
        legal_area: fm.legal_area || "",
        jurisdiction: fm.jurisdiction || "",
      });
      for (const c of chunks) {
        sizes.push(c.text.length);
        roles[c.metadata.chunk_role] = (roles[c.metadata.chunk_role] || 0) + 1;
      }
    } else if (isStatute) {
      const chunks = chunkLegalSection(body, {
        paragraph_ref: fm.paragraph || "",
        statute_abbr: fm.abbreviation || "",
        jurisdiction: fm.jurisdiction || "",
      });
      for (const c of chunks) sizes.push(c.text.length);
    } else {
      const chunks = chunkText(body);
      for (const c of chunks) sizes.push(c.text.length);
    }
  }

  sizes.sort((a, b) => a - b);
  const n = sizes.length;
  if (n === 0) {
    console.log("No chunks produced.");
    await engine.disconnect();
    return;
  }

  const avg = Math.round(sizes.reduce((s, v) => s + v, 0) / n);
  const median = sizes[Math.floor(n / 2)];
  const p10 = sizes[Math.floor(n * 0.1)];
  const p90 = sizes[Math.floor(n * 0.9)];

  console.log(`Source: ${SOURCE_ID}`);
  console.log(
    `Sample: ${pages.length} pages → ${n} chunks (${(n / pages.length).toFixed(1)} per page)`
  );
  console.log(`Avg: ${avg} chars | Median: ${median} | p10: ${p10} | p90: ${p90}`);
  console.log(`Min: ${sizes[0]} | Max: ${sizes[n - 1]}`);
  console.log(
    `<100 chars: ${sizes.filter((s) => s < 100).length} (${Math.round((sizes.filter((s) => s < 100).length / n) * 100)}%)`
  );
  console.log(
    `<500 chars: ${sizes.filter((s) => s < 500).length} (${Math.round((sizes.filter((s) => s < 500).length / n) * 100)}%)`
  );
  console.log(
    `500-2000 chars: ${sizes.filter((s) => s >= 500 && s < 2000).length} (${Math.round((sizes.filter((s) => s >= 500 && s < 2000).length / n) * 100)}%)`
  );
  console.log(
    `2000-4000 chars: ${sizes.filter((s) => s >= 2000 && s < 4000).length} (${Math.round((sizes.filter((s) => s >= 2000 && s < 4000).length / n) * 100)}%)`
  );
  console.log(
    `4000-6000 chars: ${sizes.filter((s) => s >= 4000 && s < 6000).length} (${Math.round((sizes.filter((s) => s >= 4000 && s < 6000).length / n) * 100)}%)`
  );
  console.log(
    `>6000 chars: ${sizes.filter((s) => s > 6000).length} (${Math.round((sizes.filter((s) => s > 6000).length / n) * 100)}%)`
  );
  if (Object.keys(roles).length > 0) {
    console.log(`Roles:`, roles);
  }

  await engine.disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
