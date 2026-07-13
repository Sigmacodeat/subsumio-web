/**
 * German Legal Retrieval Benchmark — verifies embedding + hybrid search
 * quality for German legal texts (BGB, ZPO, HGB, StGB, AO, etc.).
 *
 * Imports all law-corpus/de/*.md files into an in-memory PGLite engine,
 * then runs hybrid search for each benchmark question and measures
 * Recall@K (K=1,3,5,8) broken down by legal area.
 *
 * Usage:
 *   bun run src/eval/de-legal-retrieval/run.ts \
 *     test/fixtures/de-legal-retrieval.jsonl \
 *     --top-k 5 \
 *     --output /tmp/de-legal-ro.jsonl
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

// ─── Types ───────────────────────────────────────────────────────────────

interface DeLegalQuestion {
  question_id: string;
  question: string;
  answer_slug: string;
  expected_section?: string;
  legal_area: string;
  question_type: string;
}

interface PracticeQuestion {
  question_id: string;
  question: string;
  expected_slugs: string[];
  legal_area: string;
  difficulty: string;
}

interface QuestionResult {
  question_id: string;
  question: string;
  legal_area: string;
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_8: boolean;
  reciprocal_rank: number;
  top_slugs: string[];
  error?: string;
}

interface AreaReport {
  legal_area: string;
  n: number;
  hit_at_1: number;
  hit_at_3: number;
  hit_at_5: number;
  hit_at_8: number;
  mrr: number;
}

interface BenchmarkReport {
  schema_version: 1;
  benchmark: string;
  total: number;
  top_k: number;
  areas: AreaReport[];
  aggregate: {
    hit_at_1: number;
    hit_at_3: number;
    hit_at_5: number;
    hit_at_8: number;
    mrr: number;
  };
  questions: QuestionResult[];
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  fixturePath: string;
  topK: number;
  outputPath?: string;
  append: boolean;
  byType: boolean;
  llmRerank: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    fixturePath: "",
    topK: 5,
    append: false,
    byType: false,
    llmRerank: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--top-k" && i + 1 < args.length) {
      out.topK = parseInt(args[++i], 10);
      continue;
    }
    if (a === "--output" && i + 1 < args.length) {
      out.outputPath = args[++i];
      continue;
    }
    if (a === "--append") {
      out.append = true;
      continue;
    }
    if (a === "--by-type") {
      out.byType = true;
      continue;
    }
    if (a === "--llm-rerank") {
      out.llmRerank = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/de-legal-retrieval/run.ts <fixture.jsonl> [options]\n` +
          `  --top-k N        Top-K results to retrieve (default: 5)\n` +
          `  --output PATH    Write JSONL results to PATH\n` +
          `  --append         Append to output file instead of overwriting\n` +
          `  --by-type        Break down results by legal_area\n` +
          `  --llm-rerank     Re-rank top results with LLM (DeepSeek) for paragraph-level precision\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) {
      out.fixturePath = a;
    }
  }
  if (!out.fixturePath) {
    process.stderr.write("Error: fixture path required\n");
    process.exit(1);
  }
  return out;
}

// ─── Fixture loading ─────────────────────────────────────────────────────

function loadFixture(path: string): any[] {
  const raw = readFileSync(path, "utf-8");
  const lines = raw
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));
  return lines.map((l) => JSON.parse(l));
}

// ─── Law corpus loading ──────────────────────────────────────────────────

interface CorpusFile {
  slug: string;
  content: string;
  abbreviation: string;
}

function loadLawCorpus(): CorpusFile[] {
  const corpusDir = join(REPO_ROOT, "law-corpus/de");
  if (!existsSync(corpusDir)) {
    throw new Error(`law-corpus/de not found at ${corpusDir}`);
  }
  const files = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));
  const out: CorpusFile[] = [];
  for (const file of files) {
    const content = readFileSync(join(corpusDir, file), "utf-8");
    const slug = file.replace(/\.md$/, "");
    // Extract abbreviation from frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let abbreviation = slug.toUpperCase();
    if (fmMatch) {
      const abbrMatch = fmMatch[1].match(/abbreviation:\s*"([^"]+)"/);
      if (abbrMatch) abbreviation = abbrMatch[1];
    }
    out.push({ slug, content, abbreviation });
  }
  return out;
}

// ─── JSONL emitter ───────────────────────────────────────────────────────

class JsonlEmitter {
  constructor(
    private path: string,
    private append: boolean
  ) {
    if (!append && existsSync(path)) {
      writeFileSync(path, "");
    }
  }
  emit(obj: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
  close(): void {
    // File handles are managed by appendFileSync
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);
  const corpusFiles = loadLawCorpus();

  process.stderr.write(
    `[de-legal-retrieval] loaded ${questions.length} questions, ${corpusFiles.length} corpus files\n`
  );
  process.stderr.write(`[de-legal-retrieval] top-k=${opts.topK}\n`);
  if (opts.llmRerank) {
    process.stderr.write(`[de-legal-retrieval] LLM re-ranker: ENABLED (deepseek-chat)\n`);
  }

  // Increase query embed timeout for OpenRouter latency (default 6s is too tight)
  // Must be set BEFORE importing hybrid.ts which reads it at module load time
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  // Import engine dynamically (PGLite + search)
  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  // Configure AI gateway (needed for embeddings during import)
  // Force OpenRouter for embeddings to avoid OpenAI quota issues
  const cfg = loadConfig();
  const embeddingModel = "openrouter:openai/text-embedding-3-small";
  const embeddingDims = 1536;
  configureGateway({
    embedding_model: embeddingModel,
    embedding_dimensions: embeddingDims,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);
  process.stderr.write(
    `[de-legal-retrieval] embedding model: ${embeddingModel} (${embeddingDims}d)\n`
  );

  process.stderr.write(`[de-legal-retrieval] creating in-memory engine...\n`);
  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  // Import all corpus files
  process.stderr.write(`[de-legal-retrieval] importing ${corpusFiles.length} law files...\n`);
  for (const cf of corpusFiles) {
    const slug = `law/de/${cf.slug}`;
    process.stderr.write(`  importing ${cf.abbreviation} (${cf.slug})...\n`);
    await importFromContent(engine, slug, cf.content, {
      noEmbed: false,
    });
  }
  process.stderr.write(`[de-legal-retrieval] import complete\n`);

  // Run benchmark
  const results: QuestionResult[] = [];
  const isPractice = questions.length > 0 && "expected_slugs" in (questions[0] as any);

  let questionIdx = 0;
  for (const q of questions) {
    questionIdx++;
    const question = q.question;
    const legalArea = (q as any).legal_area as string;

    // Determine expected slugs
    const expectedSlugs: string[] = isPractice
      ? (q as any).expected_slugs.map((s: string) => `law/de/${s}`)
      : [`law/de/${(q as any).answer_slug}`];

    try {
      const searchResults = await hybridSearch(engine, question, {
        limit: 8,
        autocut: false,
        jurisdiction: "de",
        embeddingColumn: {
          name: "embedding",
          type: "vector" as const,
          dimensions: 1536,
          embeddingModel: "openrouter:openai/text-embedding-3-small",
        },
        ...(opts.llmRerank
          ? {
              llmRerank: {
                enabled: true,
                topNIn: 25,
                model: "openrouter:deepseek/deepseek-chat",
                timeoutMs: 30000,
              },
            }
          : {}),
      });

      const rankedSlugs = searchResults.map((r) => r.slug);
      const expectedSet = new Set(expectedSlugs);

      if (rankedSlugs.length === 0) {
        process.stderr.write(
          `[de-legal-retrieval] WARNING: empty search results for "${question}" (id: ${q.question_id})\n`
        );
      }

      const firstHit = rankedSlugs.findIndex((s) => expectedSet.has(s));
      const hitAt = (k: number) => firstHit >= 0 && firstHit < k;

      const result: QuestionResult = {
        question_id: q.question_id,
        question,
        legal_area: legalArea,
        hit_at_1: hitAt(1),
        hit_at_3: hitAt(3),
        hit_at_5: hitAt(5),
        hit_at_8: hitAt(8),
        reciprocal_rank: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
        top_slugs: rankedSlugs.slice(0, 8),
      };
      results.push(result);

      const pct = Math.round((questionIdx / questions.length) * 100);
      const hit = firstHit >= 0 ? "✓" : "✗";
      process.stderr.write(
        `[de-legal-retrieval] ${questionIdx}/${questions.length} (${pct}%) ${hit} ${q.question_id}\n`
      );
    } catch (err: any) {
      const result: QuestionResult = {
        question_id: q.question_id,
        question,
        legal_area: legalArea,
        hit_at_1: false,
        hit_at_3: false,
        hit_at_5: false,
        hit_at_8: false,
        reciprocal_rank: 0,
        top_slugs: [],
        error: String(err?.message ?? err),
      };
      results.push(result);
      process.stderr.write(
        `[de-legal-retrieval] ${questionIdx}/${questions.length} ${q.question_id} (error: ${err?.message})\n`
      );
    }
  }

  // Build report
  const byArea = new Map<string, QuestionResult[]>();
  for (const r of results) {
    const list = byArea.get(r.legal_area) ?? [];
    list.push(r);
    byArea.set(r.legal_area, list);
  }

  const areas: AreaReport[] = [];
  for (const [area, list] of byArea) {
    const n = list.length;
    areas.push({
      legal_area: area,
      n,
      hit_at_1: list.filter((r) => r.hit_at_1).length / n,
      hit_at_3: list.filter((r) => r.hit_at_3).length / n,
      hit_at_5: list.filter((r) => r.hit_at_5).length / n,
      hit_at_8: list.filter((r) => r.hit_at_8).length / n,
      mrr: list.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    });
  }
  areas.sort((a, b) => a.legal_area.localeCompare(b.legal_area));

  const n = results.length;
  const report: BenchmarkReport = {
    schema_version: 1,
    benchmark: "de-legal-retrieval",
    total: n,
    top_k: opts.topK,
    areas,
    aggregate: {
      hit_at_1: results.filter((r) => r.hit_at_1).length / n,
      hit_at_3: results.filter((r) => r.hit_at_3).length / n,
      hit_at_5: results.filter((r) => r.hit_at_5).length / n,
      hit_at_8: results.filter((r) => r.hit_at_8).length / n,
      mrr: results.reduce((s, r) => s + r.reciprocal_rank, 0) / n,
    },
    questions: results,
  };

  // Print summary to stderr
  process.stderr.write(`\n[de-legal-retrieval] RESULTS (${n} questions, top-k=${opts.topK})\n`);
  process.stderr.write(
    `  Aggregate: Hit@1=${(report.aggregate.hit_at_1 * 100).toFixed(1)}% Hit@3=${(report.aggregate.hit_at_3 * 100).toFixed(1)}% Hit@5=${(report.aggregate.hit_at_5 * 100).toFixed(1)}% Hit@8=${(report.aggregate.hit_at_8 * 100).toFixed(1)}% MRR=${report.aggregate.mrr.toFixed(3)}\n`
  );
  if (opts.byType) {
    for (const a of areas) {
      process.stderr.write(
        `  ${a.legal_area} (n=${a.n}): Hit@1=${(a.hit_at_1 * 100).toFixed(1)}% Hit@3=${(a.hit_at_3 * 100).toFixed(1)}% Hit@5=${(a.hit_at_5 * 100).toFixed(1)}% Hit@8=${(a.hit_at_8 * 100).toFixed(1)}% MRR=${a.mrr.toFixed(3)}\n`
      );
    }
  }

  // Write output
  if (opts.outputPath) {
    const emitter = new JsonlEmitter(opts.outputPath, opts.append);
    for (const r of results) {
      emitter.emit(r as unknown as Record<string, unknown>);
    }
    emitter.emit({
      schema_version: 1,
      kind: "summary",
      benchmark: report.benchmark,
      total: report.total,
      top_k: report.top_k,
      aggregate: report.aggregate,
      areas: report.areas,
    });
    emitter.close();
    process.stderr.write(`[de-legal-retrieval] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[de-legal-retrieval] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
