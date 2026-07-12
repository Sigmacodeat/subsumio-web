/**
 * Akten-Retrieval Benchmark — Tests retrieval from uploaded case files.
 *
 * This benchmark verifies that the system can find information in
 * client-specific documents (Akten), not just statutory law. It:
 *   1. Imports synthetic case files into a dedicated eval brain source
 *   2. Runs hybrid search for case-specific questions
 *   3. Measures Hit@K and MRR against gold-standard expected slugs
 *   4. Optionally runs LLM synthesis + citation grounding check
 *
 * Usage:
 *   bun run src/eval/akten-retrieval/run.ts \
 *     --top-k 8 \
 *     --output /tmp/akten-retrieval-results.jsonl
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, resolve } from "path";
import { parseArgs } from "util";

// ─── Types ───────────────────────────────────────────────────────────────

interface AktenQuestion {
  question_id: string;
  question: string;
  case_slug: string;
  expected_slug: string;
  expected_chunk_text: string;
  legal_area: string;
  question_type: string;
  jurisdiction: string;
}

interface AktenResult {
  question_id: string;
  question: string;
  case_slug: string;
  expected_slug: string;
  expected_chunk_text: string;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  reciprocal_rank: number;
  rank: number;
  top_slugs: string[];
  top_scores: number[];
  chunk_text_match: boolean;
  error?: string;
}

interface AktenAggregate {
  total: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
  chunk_text_match_rate: number;
  hit_at_1_pct: number;
  hit_at_3_pct: number;
  hit_at_5_pct: number;
  hit_at_8_pct: number;
}

// ─── Fixture loading ─────────────────────────────────────────────────────

function loadFixture(path: string): { questions: AktenQuestion[] } {
  const raw = readFileSync(path, "utf-8");
  const lines = raw.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  const questions: AktenQuestion[] = [];
  for (const line of lines) {
    try {
      questions.push(JSON.parse(line) as AktenQuestion);
    } catch {
      // skip malformed lines
    }
  }
  return { questions };
}

// ─── Case file import ────────────────────────────────────────────────────

const CASE_FILES_DIR = join(resolve(import.meta.dir), "..", "..", "..", "test", "fixtures", "akten");
const EVAL_SOURCE_ID = "eval-akten";

async function importCaseFiles(engine: any): Promise<{ slugs: string[] }> {
  const { readdirSync } = await import("fs");
  const { importFromContent } = await import("../../core/import-file.ts");

  // Register the eval source in the sources table (idempotent)
  try {
    await engine.executeRaw(
      `INSERT INTO sources(id, name, config) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`,
      [EVAL_SOURCE_ID, EVAL_SOURCE_ID, JSON.stringify({ provisioned_by: "akten-eval" })]
    );
  } catch {
    // non-fatal — source may already exist
  }

  const files = readdirSync(CASE_FILES_DIR).filter((f) => f.endsWith(".md"));
  const slugs: string[] = [];

  for (const file of files) {
    const content = readFileSync(join(CASE_FILES_DIR, file), "utf-8");
    const slug = file.replace(/\.md$/, "");

    try {
      await importFromContent(engine, `faelle/${slug}`, content, {
        sourceId: EVAL_SOURCE_ID,
      });
      slugs.push(`faelle/${slug}`);
      process.stderr.write(`[akten-eval] imported ${slug} → faelle/${slug}\n`);
    } catch (err: any) {
      // If already exists, that's fine
      if (String(err?.message ?? err).includes("duplicate") || String(err?.message ?? err).includes("exists")) {
        slugs.push(`faelle/${slug}`);
        process.stderr.write(`[akten-eval] already exists: faelle/${slug}\n`);
      } else {
        process.stderr.write(`[akten-eval] ERROR importing ${slug}: ${err?.message}\n`);
      }
    }
  }

  return { slugs };
}

// ─── Chunk text matching ─────────────────────────────────────────────────

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if the expected chunk text appears (semantically) in any of the
 * top-K search results. We normalize both sides and check for key phrase
 * overlap rather than exact substring match.
 */
function checkChunkTextMatch(
  topResults: { slug: string; chunk_text?: string; content?: string; text?: string; chunk?: string }[],
  expectedChunkText: string
): boolean {
  const expected = normalizeText(expectedChunkText);
  const expectedWords = expected.split(" ").filter((w) => w.length > 3);
  if (expectedWords.length < 3) return false;

  for (const r of topResults) {
    const content = r.chunk_text ?? r.content ?? r.text ?? r.chunk ?? "";
    const normalized = normalizeText(content);
    // Check if at least 60% of expected key words appear in the result
    const matchCount = expectedWords.filter((w) => normalized.includes(w)).length;
    if (matchCount / expectedWords.length >= 0.6) return true;
  }
  return false;
}

// ─── Aggregate computation ───────────────────────────────────────────────

function computeAggregate(results: AktenResult[]): AktenAggregate {
  const total = results.length;
  const hit1 = results.filter((r) => r.hit_at_1).length;
  const hit3 = results.filter((r) => r.hit_at_3).length;
  const hit5 = results.filter((r) => r.hit_at_5).length;
  const hit8 = results.filter((r) => r.hit_at_8).length;
  const mrr = results.reduce((sum, r) => sum + r.reciprocal_rank, 0) / total;
  const chunkMatch = results.filter((r) => r.chunk_text_match).length;

  return {
    total,
    hit_at_1: hit1,
    hit_at_3: hit3,
    hit_at_5: hit5,
    hit_at_8: hit8,
    mrr,
    chunk_text_match_rate: chunkMatch / total,
    hit_at_1_pct: hit1 / total,
    hit_at_3_pct: hit3 / total,
    hit_at_5_pct: hit5 / total,
    hit_at_8_pct: hit8 / total,
  };
}

// ─── Report formatting ───────────────────────────────────────────────────

function formatReport(aggregate: AktenAggregate): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const gate = aggregate.hit_at_5_pct >= 0.9 ? "✅ PASS" : "❌ FAIL";

  return [
    "",
    "  ═══════════════════════════════════════════════════",
    "  AKTEN-RETRIEVAL BENCHMARK RESULTS",
    "  ═══════════════════════════════════════════════════",
    `  Questions:     ${aggregate.total}`,
    `  Hit@1:         ${pct(aggregate.hit_at_1_pct)}  (${aggregate.hit_at_1})`,
    `  Hit@3:         ${pct(aggregate.hit_at_3_pct)}  (${aggregate.hit_at_3})`,
    `  Hit@5:         ${pct(aggregate.hit_at_5_pct)}  (${aggregate.hit_at_5})`,
    `  Hit@8:         ${pct(aggregate.hit_at_8_pct)}  (${aggregate.hit_at_8})`,
    `  MRR:           ${aggregate.mrr.toFixed(3)}`,
    `  Chunk Match:   ${pct(aggregate.chunk_text_match_rate)}`,
    "",
    `  Gate (Hit@5 ≥ 90%):  ${gate}`,
    "  ═══════════════════════════════════════════════════",
    "",
  ].join("\n");
}

// ─── JSONL Emitter ───────────────────────────────────────────────────────

class JsonlEmitter {
  constructor(private path: string, private append: boolean = false) {
    if (!append && existsSync(path)) writeFileSync(path, "");
  }
  emit(obj: Record<string, unknown>) {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { values: args } = parseArgs({
    args: process.argv.slice(2),
    options: {
      "top-k": { type: "string", default: "8" },
      output: { type: "string", default: "/tmp/akten-retrieval-results.jsonl" },
      append: { type: "boolean", default: false },
      "skip-import": { type: "boolean", default: false },
      "synthesis": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const topK = parseInt(args["top-k"] as string, 10);
  const fixturePath = join(resolve(import.meta.dir), "..", "..", "..", "test", "fixtures", "akten-retrieval.jsonl");
  const { questions } = loadFixture(fixturePath);

  process.stderr.write(`[akten-eval] loaded ${questions.length} questions\n`);
  process.stderr.write(`[akten-eval] top-k=${topK}\n`);

  // Increase query embed timeout for OpenRouter latency
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  // Dynamic imports for engine connection
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine } = await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) {
    throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json before running this eval.");
  }
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[akten-eval] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try { await reconfigureGatewayWithEngine(engine); } catch { /* non-fatal */ }

  // Import case files if not skipped
  if (!args["skip-import"]) {
    process.stderr.write(`[akten-eval] importing case files...\n`);
    const { slugs } = await importCaseFiles(engine);
    process.stderr.write(`[akten-eval] imported ${slugs.length} case files: ${slugs.join(", ")}\n`);
  }

  // Run retrieval for each question
  const results: AktenResult[] = [];
  let questionIdx = 0;

  for (const q of questions) {
    questionIdx++;
    try {
      const candidateLimit = Math.max(topK * 3, 30);
      const searchOpts = {
        limit: candidateLimit,
        sourceId: EVAL_SOURCE_ID,
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
      } as const;

      const searchResults = await hybridSearch(engine, q.question, searchOpts);
      const topResults = searchResults.slice(0, topK);
      const rankedSlugs = topResults.map((r: any) => r.slug);
      const rankedScores = topResults.map((r: any) => r.score ?? 0);

      if (rankedSlugs.length === 0) {
        process.stderr.write(
          `[akten-eval] WARNING: empty search results for "${q.question}" (${q.question_id})\n`
        );
      }

      // Check if expected slug is in results
      // The expected slug is the case file slug (e.g. "faelle/mueller-gegen-huber-urteil")
      // Search results may have chunk slugs like "faelle/mueller-gegen-huber-urteil#chunk-3"
      const firstHit = rankedSlugs.findIndex((s: string) =>
        s === q.expected_slug || s.startsWith(q.expected_slug + "#") || s.startsWith(q.expected_slug + "/")
      );
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

      // Check if expected chunk text appears in any top result
      const chunkMatch = checkChunkTextMatch(topResults as any, q.expected_chunk_text);

      const result: AktenResult = {
        question_id: q.question_id,
        question: q.question,
        case_slug: q.case_slug,
        expected_slug: q.expected_slug,
        expected_chunk_text: q.expected_chunk_text,
        hit_at_1: hitAt(1),
        hit_at_3: hitAt(3),
        hit_at_5: hitAt(5),
        hit_at_8: hitAt(8),
        reciprocal_rank: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
        rank: firstHit >= 0 ? firstHit + 1 : 0,
        top_slugs: rankedSlugs.slice(0, 10),
        top_scores: rankedScores.slice(0, 10),
        chunk_text_match: chunkMatch,
      };
      results.push(result);

      const pct = Math.round((questionIdx / questions.length) * 100);
      const hit = firstHit >= 0 ? "✓" : "✗";
      const rankStr = firstHit >= 0 ? `#${firstHit + 1}` : "MISS";
      const chunkStr = chunkMatch ? "📝" : "  ";
      process.stderr.write(
        `[akten-eval] ${questionIdx}/${questions.length} (${pct}%) ${hit} ${chunkStr} ${q.question_id} ${rankStr}\n`
      );
    } catch (err: any) {
      const result: AktenResult = {
        question_id: q.question_id,
        question: q.question,
        case_slug: q.case_slug,
        expected_slug: q.expected_slug,
        expected_chunk_text: q.expected_chunk_text,
        hit_at_1: false,
        hit_at_3: false,
        hit_at_5: false,
        hit_at_8: false,
        reciprocal_rank: 0,
        rank: 0,
        top_slugs: [],
        top_scores: [],
        chunk_text_match: false,
        error: String(err?.message ?? err),
      };
      results.push(result);
      process.stderr.write(
        `[akten-eval] ${questionIdx}/${questions.length} ${q.question_id} ERROR: ${err?.message}\n`
      );
    }
  }

  // Compute aggregate metrics
  const aggregate = computeAggregate(results);

  // Print report
  const report = formatReport(aggregate);
  process.stderr.write(report);

  // Write JSONL output
  const emitter = new JsonlEmitter(args.output as string, args.append as boolean);
  for (const r of results) emitter.emit(r as unknown as Record<string, unknown>);
  emitter.emit({
    kind: "summary",
    aggregate,
    gate: {
      passed: aggregate.hit_at_5_pct >= 0.9,
      target: "Hit@5 >= 90%",
    },
  });
  process.stderr.write(`[akten-eval] output written to ${args.output}\n`);

  await engine.disconnect();
  process.stderr.write(`[akten-eval] done.\n`);

  if (aggregate.hit_at_5_pct < 0.9) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
