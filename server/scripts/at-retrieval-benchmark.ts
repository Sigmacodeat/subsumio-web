/**
 * AT Legal Retrieval Benchmark — Tests all 30 AT questions against
 * the live engine and measures Hit@K, MRR.
 *
 * Usage (on server, inside engine container or host):
 *   bun scripts/at-retrieval-benchmark.ts \
 *     --engine http://127.0.0.1:3131 \
 *     --api-key $SUBSUMIO_WEB_API_KEY \
 *     --source law-at \
 *     --fixture test/fixtures/at-legal-retrieval.jsonl \
 *     --output /tmp/at-benchmark-results.jsonl
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

interface ATQuestion {
  question_id: string;
  question: string;
  expected_slug: string;
  legal_area: string;
  question_type: string;
}

interface BenchmarkResult {
  question_id: string;
  question: string;
  expected_slug: string;
  legal_area: string;
  top_slugs: string[];
  top_scores: number[];
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  mrr: number;
  error?: string;
}

interface AggregateMetrics {
  total: number;
  errors: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
  per_area: Record<string, { total: number; hit_at_5: number; mrr: number }>;
}

function parseArgs(argv: string[]) {
  const out = {
    engineUrl: "http://127.0.0.1:3131",
    apiKey: process.env.SUBSUMIO_WEB_API_KEY ?? process.env.GBRAIN_WEB_API_KEY ?? "",
    source: "law-at",
    fixturePath: join(REPO_ROOT, "test", "fixtures", "at-legal-retrieval.jsonl"),
    outputPath: "/tmp/at-benchmark-results.jsonl",
    limit: 0,
    topK: 8,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--engine" && i + 1 < args.length) out.engineUrl = args[++i];
    if (a === "--api-key" && i + 1 < args.length) out.apiKey = args[++i];
    if (a === "--source" && i + 1 < args.length) out.source = args[++i];
    if (a === "--fixture" && i + 1 < args.length) out.fixturePath = args[++i];
    if (a === "--output" && i + 1 < args.length) out.outputPath = args[++i];
    if (a === "--limit" && i + 1 < args.length) out.limit = parseInt(args[++i], 10);
    if (a === "--top-k" && i + 1 < args.length) out.topK = parseInt(args[++i], 10);
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun scripts/at-retrieval-benchmark.ts [options]\n` +
        `  --engine URL       Engine URL (default: http://127.0.0.1:3131)\n` +
        `  --api-key KEY      API key (default: $SUBSUMIO_WEB_API_KEY)\n` +
        `  --source ID        Tenant source (default: law-at)\n` +
        `  --fixture PATH     Question fixture (default: test/fixtures/at-legal-retrieval.jsonl)\n` +
        `  --output PATH      Output JSONL (default: /tmp/at-benchmark-results.jsonl)\n` +
        `  --limit N          Only first N questions\n` +
        `  --top-k K          Top-K results per query (default: 8)\n`
      );
      process.exit(0);
    }
  }
  return out;
}

function loadFixture(path: string): ATQuestion[] {
  if (!existsSync(path)) throw new Error(`Fixture not found: ${path}`);
  const raw = readFileSync(path, "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => JSON.parse(l));
}

async function searchEngine(
  engineUrl: string,
  apiKey: string,
  source: string,
  query: string,
  topK: number
): Promise<Array<{ slug: string; title: string; score: number }>> {
  const url = `${engineUrl}/api/search?q=${encodeURIComponent(query)}&limit=${topK}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-subsumio-source": source,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({
    slug: String(r.slug ?? ""),
    title: String(r.title ?? ""),
    score: Number(r.score ?? 0),
  }));
}

function computeMRR(expectedSlug: string, results: string[]): number {
  const idx = results.indexOf(expectedSlug);
  if (idx < 0) return 0;
  return 1 / (idx + 1);
}

function computeAggregate(results: BenchmarkResult[]): AggregateMetrics {
  const total = results.length;
  const errors = results.filter((r) => r.error).length;
  const hit1 = results.filter((r) => r.hit_at_1).length;
  const hit3 = results.filter((r) => r.hit_at_3).length;
  const hit5 = results.filter((r) => r.hit_at_5).length;
  const hit8 = results.filter((r) => r.hit_at_8).length;
  const mrrSum = results.reduce((sum, r) => sum + r.mrr, 0);

  const perArea: Record<string, { total: number; hit_at_5: number; mrr: number }> = {};
  for (const r of results) {
    const area = r.legal_area;
    if (!perArea[area]) perArea[area] = { total: 0, hit_at_5: 0, mrr: 0 };
    perArea[area].total++;
    if (r.hit_at_5) perArea[area].hit_at_5++;
    perArea[area].mrr += r.mrr;
  }

  return {
    total,
    errors,
    hit_at_1: hit1 / total,
    hit_at_3: hit3 / total,
    hit_at_5: hit5 / total,
    hit_at_8: hit8 / total,
    mrr: mrrSum / total,
    per_area: Object.fromEntries(
      Object.entries(perArea).map(([k, v]) => [
        k,
        { total: v.total, hit_at_5: v.hit_at_5 / v.total, mrr: v.mrr / v.total },
      ])
    ),
  };
}

function formatReport(agg: AggregateMetrics): string {
  const lines: string[] = [];
  lines.push("=== AT Legal Retrieval Benchmark ===");
  lines.push("");
  lines.push(`Total Questions: ${agg.total}`);
  lines.push(`Errors: ${agg.errors}`);
  lines.push("");
  lines.push("Overall Metrics:");
  lines.push(`  Hit@1:  ${(agg.hit_at_1 * 100).toFixed(1)}%`);
  lines.push(`  Hit@3:  ${(agg.hit_at_3 * 100).toFixed(1)}%`);
  lines.push(`  Hit@5:  ${(agg.hit_at_5 * 100).toFixed(1)}%  (target: ≥90%)`);
  lines.push(`  Hit@8:  ${(agg.hit_at_8 * 100).toFixed(1)}%`);
  lines.push(`  MRR:    ${agg.mrr.toFixed(3)}`);
  lines.push("");
  lines.push("Per-Area Breakdown:");
  for (const [area, stats] of Object.entries(agg.per_area)) {
    lines.push(
      `  ${area.padEnd(12)} n=${String(stats.total).padStart(2)}  Hit@5=${(stats.hit_at_5 * 100).toFixed(1)}%  MRR=${stats.mrr.toFixed(3)}`
    );
  }
  lines.push("");
  const passFail = agg.hit_at_5 >= 0.9 ? "✅ PASS" : "❌ FAIL";
  lines.push(`Release Gate (Hit@5 ≥ 90%): ${passFail}`);
  return lines.join("\n");
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.apiKey) {
    process.stderr.write("Error: API key required. Set SUBSUMIO_WEB_API_KEY or use --api-key\n");
    process.exit(1);
  }

  const questions = loadFixture(opts.fixturePath);
  const testQs = opts.limit > 0 ? questions.slice(0, opts.limit) : questions;

  process.stderr.write(`[at-bench] ${testQs.length} questions, engine=${opts.engineUrl}, source=${opts.source}\n`);

  if (existsSync(opts.outputPath)) writeFileSync(opts.outputPath, "");

  const results: BenchmarkResult[] = [];

  for (let i = 0; i < testQs.length; i++) {
    const q = testQs[i]!;
    process.stderr.write(`[at-bench] ${i + 1}/${testQs.length} ${q.question_id}... `);

    const result: BenchmarkResult = {
      question_id: q.question_id,
      question: q.question,
      expected_slug: q.expected_slug,
      legal_area: q.legal_area,
      top_slugs: [],
      top_scores: [],
      hit_at_1: false,
      hit_at_3: false,
      hit_at_5: false,
      hit_at_8: false,
      mrr: 0,
    };

    try {
      const searchResults = await searchEngine(
        opts.engineUrl,
        opts.apiKey,
        opts.source,
        q.question,
        opts.topK
      );

      result.top_slugs = searchResults.map((r) => r.slug);
      result.top_scores = searchResults.map((r) => r.score);

      const slugList = result.top_slugs;
      result.hit_at_1 = slugList.slice(0, 1).includes(q.expected_slug);
      result.hit_at_3 = slugList.slice(0, 3).includes(q.expected_slug);
      result.hit_at_5 = slugList.slice(0, 5).includes(q.expected_slug);
      result.hit_at_8 = slugList.slice(0, 8).includes(q.expected_slug);
      result.mrr = computeMRR(q.expected_slug, slugList);

      const hitStr = result.hit_at_5 ? "✅ HIT" : "❌ MISS";
      process.stderr.write(`${hitStr} (MRR=${result.mrr.toFixed(2)})\n`);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      process.stderr.write(`ERROR: ${result.error}\n`);
    }

    results.push(result);
    appendFileSync(opts.outputPath, JSON.stringify(result) + "\n");

    // Rate limit: 200ms between queries
    await new Promise((r) => setTimeout(r, 200));
  }

  const agg = computeAggregate(results);
  const report = formatReport(agg);
  process.stdout.write("\n" + report + "\n");

  // Save aggregate
  const summaryPath = opts.outputPath.replace(/\.jsonl$/, "-summary.json");
  writeFileSync(summaryPath, JSON.stringify({ aggregate: agg, results }, null, 2));
  process.stderr.write(`\nResults: ${opts.outputPath}\nSummary: ${summaryPath}\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
