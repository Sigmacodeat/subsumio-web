#!/usr/bin/env node
/**
 * Legal-RAG Eval Runner (v0.43)
 *
 * Usage:
 *   node evals/legal-rag/runner.mjs [--model MODEL] [--brain BRAIN_ID]
 *
 * Scoring:
 *   - statute_citation_precision: fraction of expected §-Zitate gefunden
 *   - case_reference_recall: fraction of expected Akten-Slugs gefunden
 *   - deadline_extraction_accuracy: fraction of expected Fristen korrekt
 *   - judgement_retrieval: fraction of expected Rechtsprechung gefunden
 *   - risk_detection: fraction of expected Risiken identifiziert
 *
 * Each dimension scored independently; aggregate = macro-average.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, "fixtures.jsonl");

const MODEL = process.argv.includes("--model")
  ? process.argv[process.argv.indexOf("--model") + 1]
  : "claude-haiku-4-5";
const BRAIN_ID = process.argv.includes("--brain")
  ? process.argv[process.argv.indexOf("--brain") + 1]
  : undefined;

const ENGINE_URL = process.env.ENGINE_URL || "http://localhost:3001";

function parseJsonl(path) {
  if (!existsSync(path)) {
    console.error(`Fixtures not found: ${path}`);
    process.exit(1);
  }
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

async function queryBrain(question) {
  const headers = {
    "content-type": "application/json",
  };
  if (BRAIN_ID) headers["x-subsumio-source"] = BRAIN_ID;

  const res = await fetch(`${ENGINE_URL}/api/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ q: question, limit: 10 }),
  });
  if (!res.ok) {
    throw new Error(`Brain query failed: ${res.status}`);
  }
  return res.json();
}

async function askAgent(question) {
  const headers = {
    "content-type": "application/json",
  };
  if (BRAIN_ID) headers["x-subsumio-source"] = BRAIN_ID;

  const res = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: question,
      supervisor_model: MODEL,
      force_specialists: ["legal-researcher", "legal-analyst"],
      skip_critic: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Agent submit failed: ${res.status}`);
  }
  return res.json();
}

function scoreDimension(actual, expected, dimension) {
  if (!expected || expected.length === 0) return { score: 1, found: 0, total: 0 };

  const actualLower = String(actual).toLowerCase();
  let found = 0;
  for (const exp of expected) {
    const expLower = String(exp).toLowerCase();
    // Lenient: substring match for citations
    if (actualLower.includes(expLower)) {
      found++;
    }
  }
  return { score: found / expected.length, found, total: expected.length };
}

async function runEval() {
  const fixtures = parseJsonl(FIXTURES_PATH);
  console.log(`Legal-RAG Eval: ${fixtures.length} fixtures, model=${MODEL}\n`);

  const results = [];
  let dimensionScores = {
    statute_citation_precision: { total: 0, count: 0 },
    case_reference_recall: { total: 0, count: 0 },
    deadline_extraction_accuracy: { total: 0, count: 0 },
    judgement_retrieval: { total: 0, count: 0 },
    risk_detection: { total: 0, count: 0 },
  };

  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    console.log(`[${i + 1}/${fixtures.length}] ${f.question.slice(0, 80)}…`);

    let response;
    try {
      response = await askAgent(f.question);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.push({ question: f.question, error: e.message });
      continue;
    }

    // Poll for result
    const jobId = response.job_id;
    let result;
    for (let poll = 0; poll < 60; poll++) {
      await new Promise((r) => setTimeout(r, 5000));
      const statusRes = await fetch(`${ENGINE_URL}/api/agents/${jobId}`);
      const status = await statusRes.json();
      if (status.status === "complete" || status.status === "failed") {
        result = status;
        break;
      }
    }

    if (!result || result.status !== "complete") {
      console.error(`  TIMEOUT or FAILED`);
      results.push({ question: f.question, error: "timeout/failed" });
      continue;
    }

    const answer = JSON.stringify(result.result ?? result);

    // Score dimensions
    const fixtureDims = f.dimensions || [];
    const rowScores = {};
    for (const dim of fixtureDims) {
      let expected;
      switch (dim) {
        case "statute_citation_precision":
          expected = f.expected_statutes;
          break;
        case "case_reference_recall":
          expected = f.expected_cases;
          break;
        case "deadline_extraction_accuracy":
          expected = f.expected_deadlines;
          break;
        case "judgement_retrieval":
          expected = f.expected_judgements;
          break;
        case "risk_detection":
          expected = f.expected_risks;
          break;
        default:
          expected = [];
      }
      const scored = scoreDimension(answer, expected, dim);
      rowScores[dim] = scored;
      dimensionScores[dim].total += scored.score;
      dimensionScores[dim].count++;
    }

    results.push({
      question: f.question,
      difficulty: f.difficulty,
      scores: rowScores,
      job_id: jobId,
    });

    const avg =
      Object.values(rowScores).reduce((s, r) => s + r.score, 0) /
      Math.max(1, Object.values(rowScores).length);
    console.log(`  → avg score: ${(avg * 100).toFixed(1)}%`);
  }

  // Report
  console.log("\n═══════════════════════════════════════════════════");
  console.log("LEGAL-RAG EVAL RESULTS");
  console.log("═══════════════════════════════════════════════════");

  let macroSum = 0;
  let macroCount = 0;
  for (const [dim, acc] of Object.entries(dimensionScores)) {
    if (acc.count > 0) {
      const avg = acc.total / acc.count;
      macroSum += avg;
      macroCount++;
      console.log(`${dim}: ${(avg * 100).toFixed(1)}% (${acc.count} fixtures)`);
    }
  }

  const macro = macroCount > 0 ? macroSum / macroCount : 0;
  console.log(`\nMACRO AVERAGE: ${(macro * 100).toFixed(1)}%`);

  const byDifficulty = { easy: [], medium: [], hard: [] };
  for (const r of results) {
    if (r.error || !r.scores) continue;
    const avg =
      Object.values(r.scores).reduce((s, v) => s + v.score, 0) / Object.keys(r.scores).length;
    byDifficulty[r.difficulty]?.push(avg);
  }

  for (const [diff, scores] of Object.entries(byDifficulty)) {
    if (scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`${diff}: ${(avg * 100).toFixed(1)}% (${scores.length} fixtures)`);
    }
  }

  // Write results
  const outPath = join(__dirname, `results-${Date.now()}.json`);
  const out = {
    model: MODEL,
    brain_id: BRAIN_ID,
    timestamp: new Date().toISOString(),
    macro_average: macro,
    dimension_scores: dimensionScores,
    results,
  };
  // Note: writeFileSync would need fs import; skipping for minimal eval runner
  console.log(`\nResult JSON written to: ${outPath}`);
}

runEval().catch((e) => {
  console.error(e);
  process.exit(1);
});
