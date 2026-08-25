#!/usr/bin/env bun
/**
 * Retrieval Eval — runs at-legal-retrieval.jsonl (80 AT statute questions)
 * directly against the configured Postgres engine via hybridSearch.
 *
 * Measures Hit@1, Hit@3, Hit@5, Hit@8, MRR — no LLM needed, < $0.01.
 *
 * Usage:
 *   GBRAIN_DATABASE_URL=postgres://... bun run server/scripts/run-retrieval-eval.ts
 *   bun run server/scripts/run-retrieval-eval.ts --top-k 8 --fixture server/test/fixtures/at-legal-retrieval.jsonl
 */

import { readFileSync, existsSync, writeFileSync, appendFileSync } from "fs";
import { parseArgs } from "util";
import { createHash } from "crypto";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    "top-k": { type: "string", default: "8" },
    fixture: { type: "string", default: "server/test/fixtures/at-legal-retrieval.jsonl" },
    output: { type: "string" },
    "source-ids": { type: "string", default: "law-at-normen" },
    reranker: { type: "string", default: "none" },
    "top-n-in": { type: "string", default: "30" },
    "prompt-mode": { type: "string", default: "baseline" },
    "snippet-len": { type: "string", default: "500" },
    jurisdiction: { type: "string" },
    "inner-limit": { type: "string" },
    "search-limit": { type: "string", default: "200" },
    "cache-file": { type: "string", default: "/tmp/retrieval-eval-reranker-cache.jsonl" },
    "no-cache": { type: "boolean", default: false },
    repeat: { type: "string", default: "1" },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Retrieval Eval — Hit@K + MRR + Recall@K against live engine

Usage:
  bun run server/scripts/run-retrieval-eval.ts [options]

Options:
  --fixture PATH       Fixture JSONL (default: server/test/fixtures/at-legal-retrieval.jsonl)
  --top-k N            Top-K for Hit@K reporting (default: 8, all Hit@K from same run)
  --search-limit N     Internal search limit / candidate pool (default: 200)
  --source-ids IDS     Comma-separated source IDs (default: law-at-normen)
  --reranker MODE      none | bge | deepseek (default: none)
  --top-n-in N         Reranker candidate pool size (default: 30)
  --prompt-mode MODE   baseline | legal-criteria | answer-oriented (default: baseline)
  --snippet-len N      Chars per doc sent to reranker (default: 500)
  --jurisdiction CODE  Force legal path for all queries, e.g. 'at' (default: auto-detect)
  --inner-limit N      Override inner candidate limit (default: auto from jurisdiction)
  --cache-file PATH    Reranker response cache (default: /tmp/retrieval-eval-reranker-cache.jsonl)
  --no-cache           Disable reranker response cache (for noise-band measurement)
  --repeat N           Run N times with cache disabled, output mean ± SD (default: 1)
  --output PATH        Write JSON results to PATH
  --help               This help
`);
  process.exit(0);
}

const TOP_K = parseInt(String(values["top-k"]), 10) || 8;
const RERANKER_MODE = String(values["reranker"]) as "none" | "bge" | "deepseek";
const TOP_N_IN = parseInt(String(values["top-n-in"]), 10) || 30;
const PROMPT_MODE = String(values["prompt-mode"]) as
  | "baseline"
  | "legal-criteria"
  | "answer-oriented";
const SNIPPET_LEN = parseInt(String(values["snippet-len"]), 10) || 500;
const JURISDICTION = values.jurisdiction as string | undefined;
const INNER_LIMIT = values["inner-limit"] ? parseInt(String(values["inner-limit"]), 10) : undefined;
const SEARCH_LIMIT = parseInt(String(values["search-limit"]), 10) || 200;
const CACHE_FILE = String(values["cache-file"]);
const NO_CACHE = values["no-cache"] as boolean;
const REPEAT = parseInt(String(values.repeat), 10) || 1;
const FIXTURE = String(values.fixture);
const OUTPUT = values.output as string | undefined;
const SOURCE_IDS = (values["source-ids"] as string).split(",");

interface Question {
  question_id: string;
  question: string;
  expected_slug: string;
  legal_area: string;
  question_type: string;
}

interface Result {
  question_id: string;
  question: string;
  legal_area: string;
  question_type: string;
  expected_slug: string;
  rank: number;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  recall_at_10: boolean;
  recall_at_30: boolean;
  recall_at_50: boolean;
  recall_at_100: boolean;
  reciprocal_rank: number;
  top_slugs: string[];
  top_scores: number[];
  vector_enabled?: boolean;
  expansion_applied?: boolean;
  error?: string;
}

function loadFixture(path: string): Question[] {
  const raw = readFileSync(path, "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => JSON.parse(l));
}

async function main() {
  const questions = loadFixture(FIXTURE);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`  Retrieval Eval — ${questions.length} questions, top-k=${TOP_K}`);
  console.log(`  Sources: ${SOURCE_IDS.join(", ")}`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log("");

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "60000";

  const { hybridSearch } = await import("../src/core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../src/core/config.ts");
  const { createEngine } = await import("../src/core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../src/core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } =
    await import("../src/core/ai/gateway.ts");

  // ── Embedding cache (3A-determinism): persistent disk-based cache so the
  // same query text always produces the same vector — across processes.
  // Without it, text-embedding-3-small via OpenRouter returns slightly different
  // vectors (~1e-5 diff) on ~20% of calls, causing non-deterministic IVFFlat
  // candidate sets → different reranker inputs → noise.
  const EMBEDDING_CACHE_FILE = "/tmp/retrieval-eval-embedding-cache.jsonl";
  const embeddingModule = await import("../src/core/embedding.ts");
  if (!NO_CACHE) {
    embeddingModule.enableQueryEmbedCache(EMBEDDING_CACHE_FILE);
    const stats = embeddingModule.getQueryEmbedCacheStats();
    console.log(`[init] embedding cache: ON (${stats.size} entries from ${EMBEDDING_CACHE_FILE})`);
  } else {
    embeddingModule.disableQueryEmbedCache();
    console.log(`[init] embedding cache: OFF (--no-cache)`);
  }

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured");
  configureGateway(buildGatewayConfig(cfg));

  console.log(`[init] connecting to engine...`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {}
  console.log(`[init] connected!`);

  // ── Reranker setup ──────────────────────────────────────────────
  // Modes: "none" (RRF only), "bge" (local cross-encoder), "deepseek" (LLM listwise)
  let rerankerFn:
    | ((input: {
        query: string;
        documents: string[];
      }) => Promise<{ index: number; relevanceScore: number }[]>)
    | null = null;
  let rerankerLabel = "none (RRF only)";

  if (RERANKER_MODE === "bge") {
    const RERANKER_URL = process.env.RERANKER_URL || "http://127.0.0.1:8787";
    const bgeFn = async (input: { query: string; documents: string[] }) => {
      const res = await fetch(`${RERANKER_URL}/v1/rerank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: input.query, documents: input.documents }),
      });
      if (!res.ok) throw new Error(`bge reranker HTTP ${res.status}`);
      const data = (await res.json()) as { results: { index: number; relevance_score: number }[] };
      return data.results.map((r) => ({ index: r.index, relevanceScore: r.relevance_score }));
    };
    const bgeHealth = await fetch(`${RERANKER_URL}/health`)
      .then((r) => r.ok)
      .catch(() => false);
    if (bgeHealth) {
      rerankerFn = bgeFn;
      rerankerLabel = `bge-reranker-v2-m3 (topNIn=${TOP_N_IN})`;
    } else console.log("[init] ⚠️ bge reranker not available, falling back to RRF");
  }

  if (RERANKER_MODE === "deepseek") {
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY required for --reranker deepseek");
    const DEEPSEEK_MODEL = "deepseek/deepseek-chat";

    // ── Reranker response cache (3a) ───────────────────────────────
    // Key = sha256(model + prompt_mode + snippet_len + query + doc_hashes)
    // Makes re-runs of the same config deterministic AND free.
    const cacheEnabled = !NO_CACHE;
    const cacheMap = new Map<string, number[]>();
    if (cacheEnabled && existsSync(CACHE_FILE)) {
      const raw = readFileSync(CACHE_FILE, "utf-8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as { key: string; indices: number[] };
          cacheMap.set(entry.key, entry.indices);
        } catch {}
      }
      console.log(`[init] reranker cache: ${cacheMap.size} entries loaded from ${CACHE_FILE}`);
    } else if (cacheEnabled) {
      console.log(`[init] reranker cache: empty (will create ${CACHE_FILE})`);
    } else {
      console.log(`[init] reranker cache: DISABLED (--no-cache)`);
    }
    let cacheHits = 0;
    let cacheMisses = 0;

    // ── Prompt variants for A/B/C testing ──────────────────────────
    const PROMPTS: Record<string, { system: string; user: string }> = {
      baseline: {
        system: `You are a legal document relevance ranker. Given a user query and a list of document passages, output a JSON array of document indices sorted from MOST relevant to LEAST relevant to the query. Output ONLY the JSON array, no explanation.`,
        user: `Query: {QUERY}\n\nDocuments:\n{DOCS}\n\nOutput the sorted index array (most relevant first), e.g. [3, 0, 7, ...]`,
      },
      "legal-criteria": {
        system: `You are an expert Austrian legal document ranker. Given a legal question and a list of statutory passages, rank them by relevance using these criteria in priority order:

1. DIRECTLY ANSWERS the legal question (the passage contains the specific rule, definition, or procedure asked about)
2. SAME LEGAL NORM — the passage is from the same paragraph/section that governs the question
3. SAME LEGAL CONSEQUENCE — the passage describes the same legal effect or remedy
4. SAME TATBESTAND (facts/elements) — the passage covers the same legal requirements
5. GENERAL TOPIC — only if none of the above match

Output ONLY a JSON array of document indices, most relevant first. No explanation.`,
        user: `Legal Question: {QUERY}\n\nStatutory Passages:\n{DOCS}\n\nRanked indices (most relevant first):`,
      },
      "answer-oriented": {
        system: `You are a legal research assistant helping an Austrian lawyer. The lawyer has a specific legal question. From the provided passages, identify which ones would MOST LIKELY HELP the lawyer answer that specific question.

A passage "helps" if it contains:
- The specific statutory rule that answers the question
- The legal definition the question asks about
- The procedural rule the question refers to
- The elements/requirements of the legal concept in question

Rank passages by how directly they help answer the question, not by general topical similarity.

Output ONLY a JSON array of document indices, most helpful first. No explanation.`,
        user: `Lawyer's Question: {QUERY}\n\nAvailable Passages:\n{DOCS}\n\nMost helpful passages first (JSON array of indices):`,
      },
    };
    const promptTemplate = PROMPTS[PROMPT_MODE] ?? PROMPTS["baseline"];

    const deepseekFn = async (input: { query: string; documents: string[] }) => {
      // Build cache key from all inputs that affect the LLM response
      const docHashes = input.documents.map((d) =>
        createHash("sha256").update(d.substring(0, SNIPPET_LEN), "utf-8").digest("hex").slice(0, 16)
      );
      const keyMaterial = `${DEEPSEEK_MODEL}|${PROMPT_MODE}|${SNIPPET_LEN}|${input.query}|${docHashes.join(",")}`;
      const cacheKey = createHash("sha256").update(keyMaterial, "utf-8").digest("hex");

      if (cacheEnabled && cacheMap.has(cacheKey)) {
        cacheHits++;
        const indices = cacheMap.get(cacheKey)!;
        return indices
          .filter((i) => i >= 0 && i < input.documents.length)
          .map((idx, position) => ({ index: idx, relevanceScore: 1.0 - position * 0.01 }));
      }
      cacheMisses++;

      const docs = input.documents
        .map((d, i) => {
          const truncated = d.substring(0, SNIPPET_LEN).replace(/\s+/g, " ").trim();
          return `[${i}] ${truncated}`;
        })
        .join("\n");

      const systemPrompt = promptTemplate.system;
      const userPrompt = promptTemplate.user
        .replace("{QUERY}", input.query)
        .replace("{DOCS}", docs);

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0,
          max_tokens: 200,
          top_p: 1,
          seed: 0,
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as any;
      const text = data.choices?.[0]?.message?.content || "";
      const match = text.match(/\[[\d\s,]+\]/);
      if (!match) throw new Error(`DeepSeek response not parseable: ${text.substring(0, 200)}`);
      const indices: number[] = JSON.parse(match[0]);

      // Write to cache
      if (cacheEnabled) {
        cacheMap.set(cacheKey, indices);
        appendFileSync(CACHE_FILE, JSON.stringify({ key: cacheKey, indices }) + "\n");
      }

      return indices
        .filter((i) => i >= 0 && i < input.documents.length)
        .map((idx, position) => ({ index: idx, relevanceScore: 1.0 - position * 0.01 }));
    };
    rerankerFn = deepseekFn;
    rerankerLabel = `deepseek-chat LLM listwise (topNIn=${TOP_N_IN}, prompt=${PROMPT_MODE}, snippet=${SNIPPET_LEN}, cache=${cacheEnabled ? "on" : "off"})`;
  }

  console.log(`[init] reranker: ${rerankerFn ? `✅ ${rerankerLabel}` : "none (RRF only)"}`);
  console.log("");

  // ── runOnce: single pass over all questions, returns results ────
  async function runOnce(runLabel: string): Promise<Result[]> {
    const results: Result[] = [];
    const t0 = Date.now();
    console.log(`\n── ${runLabel} ──`);

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(
        `[${runLabel}] [${i + 1}/${questions.length}] (${elapsed}s) ${q.question_id}: ${q.question.substring(0, 60)}... `
      );

      try {
        // onMeta callback — captures whether vector arm ran or fell back
        let metaCaptured: { vector_enabled: boolean; expansion_applied: boolean } | null = null;
        const searchResults = await hybridSearch(engine, q.question, {
          limit: SEARCH_LIMIT,
          sourceIds: SOURCE_IDS,
          ...(JURISDICTION ? { jurisdiction: JURISDICTION } : {}),
          ...(INNER_LIMIT ? { innerLimit: INNER_LIMIT } : {}),
          embeddingColumn: {
            name: "embedding",
            type: "vector" as const,
            dimensions: 1536,
            embeddingModel: "openrouter:openai/text-embedding-3-small",
          },
          onMeta: (m: any) => {
            metaCaptured = {
              vector_enabled: m.vector_enabled,
              expansion_applied: m.expansion_applied,
            };
          },
          reranker: rerankerFn
            ? {
                enabled: true,
                topNIn: TOP_N_IN,
                topNOut: null,
                rerankerFn: rerankerFn as any,
              }
            : undefined,
        });

        const rankedSlugs = searchResults.map((r) => r.slug);
        const rankedScores = searchResults.map((r) => r.score);
        const firstHit = rankedSlugs.indexOf(q.expected_slug);
        const hitAt = (k: number) => firstHit >= 0 && firstHit < k;
        const recallAt = (k: number) => firstHit >= 0 && firstHit < k;

        const result: Result = {
          question_id: q.question_id,
          question: q.question,
          legal_area: q.legal_area,
          question_type: q.question_type,
          expected_slug: q.expected_slug,
          rank: firstHit >= 0 ? firstHit + 1 : -1,
          hit_at_1: hitAt(1),
          hit_at_3: hitAt(3),
          hit_at_5: hitAt(5),
          hit_at_8: hitAt(8),
          recall_at_10: recallAt(10),
          recall_at_30: recallAt(30),
          recall_at_50: recallAt(50),
          recall_at_100: recallAt(100),
          reciprocal_rank: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
          top_slugs: rankedSlugs,
          top_scores: rankedScores,
          ...(metaCaptured
            ? {
                vector_enabled: metaCaptured.vector_enabled,
                expansion_applied: metaCaptured.expansion_applied,
              }
            : {}),
        };

        results.push(result);
        const vecFlag = metaCaptured ? (metaCaptured.vector_enabled ? "" : " ⚠️NO-VEC") : "";
        const mark = result.hit_at_1
          ? "✅ #1"
          : result.hit_at_3
            ? "🟢 #3"
            : result.hit_at_5
              ? "🟡 #5"
              : result.hit_at_8
                ? "🟠 #8"
                : "❌ miss";
        console.log(`${mark} (rank=${result.rank})${vecFlag}`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.log(`❌ ERROR: ${errMsg.substring(0, 80)}`);
        results.push({
          question_id: q.question_id,
          question: q.question,
          legal_area: q.legal_area,
          question_type: q.question_type,
          expected_slug: q.expected_slug,
          rank: -1,
          hit_at_1: false,
          hit_at_3: false,
          hit_at_5: false,
          hit_at_8: false,
          recall_at_10: false,
          recall_at_30: false,
          recall_at_50: false,
          recall_at_100: false,
          reciprocal_rank: 0,
          top_slugs: [],
          top_scores: [],
          error: errMsg,
        });
      }
    }
    return results;
  }

  function computeAgg(results: Result[]) {
    const n = results.length || 1;
    return {
      hit_at_1: results.filter((r) => r.hit_at_1).length / n,
      hit_at_3: results.filter((r) => r.hit_at_3).length / n,
      hit_at_5: results.filter((r) => r.hit_at_5).length / n,
      hit_at_8: results.filter((r) => r.hit_at_8).length / n,
      recall_at_10: results.filter((r) => r.recall_at_10).length / n,
      recall_at_30: results.filter((r) => r.recall_at_30).length / n,
      recall_at_50: results.filter((r) => r.recall_at_50).length / n,
      recall_at_100: results.filter((r) => r.recall_at_100).length / n,
      mrr: results.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    };
  }

  function printAgg(
    label: string,
    agg: ReturnType<typeof computeAgg>,
    n: number,
    elapsedS: number,
    results?: Result[]
  ) {
    console.log("");
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`  ${label} — ${n} questions, ${elapsedS.toFixed(1)}s`);
    console.log(
      `  search_limit=${SEARCH_LIMIT}, jurisdiction=${JURISDICTION ?? "auto"}, inner_limit=${INNER_LIMIT ?? "auto"}`
    );
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`  Hit@1:       ${(agg.hit_at_1 * 100).toFixed(1)}%`);
    console.log(`  Hit@3:       ${(agg.hit_at_3 * 100).toFixed(1)}%`);
    console.log(`  Hit@5:       ${(agg.hit_at_5 * 100).toFixed(1)}%`);
    console.log(`  Hit@8:       ${(agg.hit_at_8 * 100).toFixed(1)}%`);
    console.log(`  MRR:         ${agg.mrr.toFixed(4)}`);
    console.log(`  Recall@10:   ${(agg.recall_at_10 * 100).toFixed(1)}%`);
    console.log(`  Recall@30:   ${(agg.recall_at_30 * 100).toFixed(1)}%`);
    console.log(`  Recall@50:   ${(agg.recall_at_50 * 100).toFixed(1)}%`);
    console.log(`  Recall@100:  ${(agg.recall_at_100 * 100).toFixed(1)}%`);
    if (results) {
      const withMeta = results.filter((r) => r.vector_enabled !== undefined);
      const noVec = results.filter((r) => r.vector_enabled === false);
      if (withMeta.length > 0) {
        console.log(
          `  Vector arm:  ${withMeta.length - noVec.length}/${withMeta.length} ran, ${noVec.length} fell back to keyword-only ⚠️`
        );
        if (noVec.length > 0) {
          console.log(`  ⚠️ NO-VEC queries: ${noVec.map((r) => r.question_id).join(", ")}`);
        }
      }
    }
    console.log(`═══════════════════════════════════════════════════════════`);
  }

  // ── Run N times (3b: --repeat for noise-band measurement) ───────
  const allRunResults: Result[][] = [];
  const allRunAggs: ReturnType<typeof computeAgg>[] = [];
  const allRunTimes: number[] = [];

  for (let run = 0; run < REPEAT; run++) {
    const runLabel = REPEAT > 1 ? `Run ${run + 1}/${REPEAT}` : "Single run";
    const t0 = Date.now();
    const results = await runOnce(runLabel);
    const elapsed = (Date.now() - t0) / 1000;
    allRunResults.push(results);
    allRunAggs.push(computeAgg(results));
    allRunTimes.push(elapsed);

    if (REPEAT === 1) {
      printAgg("RESULTS", allRunAggs[0], results.length, elapsed, results);
    } else {
      printAgg(runLabel, allRunAggs[run], results.length, elapsed, results);
    }
  }

  // ── Noise-band summary (3b): mean ± SD across runs ──────────────
  if (REPEAT > 1) {
    const metricKeys = Object.keys(allRunAggs[0]) as (keyof ReturnType<typeof computeAgg>)[];
    console.log("");
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`  NOISE BAND — ${REPEAT} runs, mean ± SD`);
    console.log(`═══════════════════════════════════════════════════════════`);
    for (const key of metricKeys) {
      const vals = allRunAggs.map((a) => a[key]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      const sd = Math.sqrt(variance);
      const isMrr = key === "mrr";
      const fmt = isMrr
        ? `${mean.toFixed(4)} ± ${sd.toFixed(4)}`
        : `${(mean * 100).toFixed(1)}% ± ${(sd * 100).toFixed(1)}pp`;
      console.log(`  ${key.padEnd(16)} ${fmt}`);
    }
    console.log(`  Times: ${allRunTimes.map((t) => t.toFixed(1) + "s").join(", ")}`);
    console.log(`═══════════════════════════════════════════════════════════`);
  }

  // ── Use first run for per-area + output (deterministic with cache) ──
  const results = allRunResults[0];
  const agg = allRunAggs[0];
  const n = results.length || 1;

  // Per-area breakdown
  const areas: Record<string, Result[]> = {};
  for (const r of results) {
    if (!areas[r.legal_area]) areas[r.legal_area] = [];
    areas[r.legal_area].push(r);
  }

  console.log(``);
  console.log(`  Per legal_area (run 1):`);
  for (const [area, rs] of Object.entries(areas)) {
    const an = rs.length || 1;
    console.log(
      `    ${area.padEnd(20)} n=${rs.length}  H@1=${((rs.filter((r) => r.hit_at_1).length / an) * 100).toFixed(0)}%  H@5=${((rs.filter((r) => r.hit_at_5).length / an) * 100).toFixed(0)}%  R@30=${((rs.filter((r) => r.recall_at_30).length / an) * 100).toFixed(0)}%  MRR=${(rs.reduce((s, r) => s + r.reciprocal_rank, 0) / an).toFixed(3)}`
    );
  }
  console.log(`═══════════════════════════════════════════════════════════`);

  if (OUTPUT) {
    const report = {
      schema_version: 3,
      benchmark: "at-legal-retrieval",
      total: n,
      top_k: TOP_K,
      search_limit: SEARCH_LIMIT,
      jurisdiction: JURISDICTION ?? "auto",
      inner_limit: INNER_LIMIT ?? "auto",
      reranker: rerankerLabel,
      snippet_len: SNIPPET_LEN,
      prompt_mode: PROMPT_MODE,
      source_ids: SOURCE_IDS,
      repeat: REPEAT,
      cache_enabled: !NO_CACHE,
      aggregate: agg,
      ...(REPEAT > 1
        ? {
            noise_band: Object.fromEntries(
              Object.entries(allRunAggs[0]).map(([key]) => {
                const vals = allRunAggs.map((a) => a[key as keyof typeof a]);
                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
                const sd = Math.sqrt(variance);
                return [key, { mean, sd, runs: vals }];
              })
            ),
          }
        : {}),
      areas: Object.fromEntries(
        Object.entries(areas).map(([area, rs]) => [
          area,
          {
            n: rs.length,
            hit_at_1: rs.filter((r) => r.hit_at_1).length / (rs.length || 1),
            hit_at_3: rs.filter((r) => r.hit_at_3).length / (rs.length || 1),
            hit_at_5: rs.filter((r) => r.hit_at_5).length / (rs.length || 1),
            hit_at_8: rs.filter((r) => r.hit_at_8).length / (rs.length || 1),
            mrr: rs.reduce((s, r) => s + r.reciprocal_rank, 0) / (rs.length || 1),
          },
        ])
      ),
      questions: results,
    };
    writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
    console.log(`\nReport written to ${OUTPUT}`);
  }

  await engine.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
