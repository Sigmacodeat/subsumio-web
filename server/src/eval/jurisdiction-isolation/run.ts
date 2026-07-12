/**
 * Jurisdiction Isolation Benchmark — verifies that the jurisdiction-scoped
 * source filtering (WP1-WP4) achieves ≥90% Hit@5 for same-jurisdiction queries
 * and ≤10% cross-contamination when the wrong jurisdiction's sources are used.
 *
 * Imports both AT and DE law corpus files into a single in-memory PGLite engine
 * (each under its own source_id: "law-at" / "law-de"), then runs:
 *
 *   1. AT questions with allowedSources=["law-at"]      → expect ≥90% Hit@5
 *   2. AT questions with allowedSources=["law-de"]      → expect ≤10% Hit@5 (isolation)
 *   3. DE questions with allowedSources=["law-de"]      → expect ≥90% Hit@5
 *   4. DE questions with allowedSources=["law-at"]      → expect ≤10% Hit@5 (isolation)
 *
 * Usage:
 *   bun run src/eval/jurisdiction-isolation/run.ts \
 *     --top-k 5 \
 *     --output /tmp/jurisdiction-isolation.jsonl
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

// ─── Types ───────────────────────────────────────────────────────────────

interface JurisdictionQuestion {
  question_id: string;
  question: string;
  expected_slug: string;
  legal_area: string;
  jurisdiction: "AT" | "DE";
}

interface IsolationResult {
  question_id: string;
  question: string;
  jurisdiction: "AT" | "DE";
  tested_with: "AT" | "DE";
  same_jurisdiction: boolean;
  hit_at_5: boolean;
  rank: number;
  top_slugs: string[];
  error?: string;
}

interface IsolationReport {
  schema_version: 1;
  benchmark: "jurisdiction-isolation";
  total: number;
  scenarios: {
    name: string;
    jurisdiction: "AT" | "DE";
    tested_with: "AT" | "DE";
    same_jurisdiction: boolean;
    n: number;
    hit_at_5: number;
    contamination_rate: number;
  }[];
  aggregate: {
    same_jur_hit_at_5: number;
    cross_jur_contamination: number;
    pass: boolean;
  };
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  topK: number;
  outputPath?: string;
  openRouterKey?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { topK: 5 };
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
    if (a === "--openrouter-key" && i + 1 < args.length) {
      out.openRouterKey = args[++i];
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/jurisdiction-isolation/run.ts [options]\n` +
          `  --top-k N            Top-K results to retrieve (default: 5)\n` +
          `  --output PATH        Write JSONL results to PATH\n` +
          `  --openrouter-key KEY Override OPENROUTER_API_KEY\n`
      );
      process.exit(0);
    }
  }
  return out;
}

// ─── Corpus loading ──────────────────────────────────────────────────────

interface CorpusFile {
  slug: string;
  content: string;
  sourceId: string;
}

function loadCorpus(dir: string, sourceId: string): CorpusFile[] {
  const corpusDir = join(REPO_ROOT, dir);
  if (!existsSync(corpusDir)) {
    throw new Error(`corpus dir not found: ${corpusDir}`);
  }
  const files = readdirSync(corpusDir).filter(
    (f) => f.endsWith(".md") && !f.startsWith(".")
  );
  const out: CorpusFile[] = [];
  for (const file of files) {
    const content = readFileSync(join(corpusDir, file), "utf-8");
    const slug = file.replace(/\.md$/, "");
    out.push({ slug, content, sourceId });
  }
  return out;
}

// ─── Questions ───────────────────────────────────────────────────────────

// AT questions — realistic lawyer phrasing, expected slugs match the
// in-memory engine's slug pattern: law/at/<law-file>
const AT_QUESTIONS: JurisdictionQuestion[] = [
  {
    question_id: "at-iso-001",
    question: "Wer haftet für Schäden, die er einem anderen schuldhaft zugefügt hat?",
    expected_slug: "abgb",
    legal_area: "abgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-002",
    question: "Innerhalb welcher Frist verjährt ein Schadenersatzanspruch ab Kenntnis von Schaden und Schädiger?",
    expected_slug: "abgb",
    legal_area: "abgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-003",
    question: "Wie lange ist die Gewährleistungsfrist bei beweglichen Sachen?",
    expected_slug: "abgb",
    legal_area: "abgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-004",
    question: "Wann ist ein Vertrag wegen Irrtums anfechtbar?",
    expected_slug: "abgb",
    legal_area: "abgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-005",
    question: "Wie wird der Mordtatbestand im österreichischen Strafrecht definiert?",
    expected_slug: "stgb-at",
    legal_area: "stgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-006",
    question: "Was ist der Straftatbestand des schweren Diebstahls?",
    expected_slug: "stgb-at",
    legal_area: "stgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-007",
    question: "Welche Strafe droht bei Betrug?",
    expected_slug: "stgb-at",
    legal_area: "stgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-008",
    question: "Was ist Körperverletzung im Sinne des Strafgesetzbuchs?",
    expected_slug: "stgb-at",
    legal_area: "stgb",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-009",
    question: "Wie wird das Verfahren vor dem Verwaltungsgericht geregelt?",
    expected_slug: "vavg",
    legal_area: "verwaltungsrecht",
    jurisdiction: "AT",
  },
  {
    question_id: "at-iso-010",
    question: "Was regelt das Allgemeine Verwaltungsverfahrensgesetz?",
    expected_slug: "avg",
    legal_area: "verwaltungsrecht",
    jurisdiction: "AT",
  },
];

// DE questions — expected slugs match law/de/<law-file>
const DE_QUESTIONS: JurisdictionQuestion[] = [
  {
    question_id: "de-iso-001",
    question: "Was ist ein Kaufmann im Sinne des Handelsgesetzbuchs?",
    expected_slug: "hgb",
    legal_area: "hgb",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-002",
    question: "Wer gilt als Handelsgewerbe?",
    expected_slug: "hgb",
    legal_area: "hgb",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-003",
    question: "Was bedeutet keine Strafe ohne Gesetz?",
    expected_slug: "stgb",
    legal_area: "stgb",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-004",
    question: "Was ist der Unterschied zwischen Verbrechen und Vergehen?",
    expected_slug: "stgb",
    legal_area: "stgb",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-005",
    question: "Wann ist eine Tat strafbar durch Unterlassen?",
    expected_slug: "stgb",
    legal_area: "stgb",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-006",
    question: "Was ist Notwehr und wann ist sie gerechtfertigt?",
    expected_slug: "stgb",
    legal_area: "stgb",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-007",
    question: "Was bedeutet Vorsatz im Strafrecht?",
    expected_slug: "stgb",
    legal_area: "stgb",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-008",
    question: "Was ist der allgemeine Gerichtsstand einer Person?",
    expected_slug: "zpo",
    legal_area: "zpo",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-009",
    question: "Wann ist eine Klage zulässig?",
    expected_slug: "zpo",
    legal_area: "zpo",
    jurisdiction: "DE",
  },
  {
    question_id: "de-iso-010",
    question: "Was ist das Steuergeheimnis?",
    expected_slug: "ao",
    legal_area: "ao",
    jurisdiction: "DE",
  },
];

// ─── JSONL emitter ───────────────────────────────────────────────────────

class JsonlEmitter {
  constructor(
    private path: string,
    private append: boolean
  ) {
    if (!append && existsSync(path)) writeFileSync(path, "");
  }
  emit(obj: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.openRouterKey) {
    process.env.OPENROUTER_API_KEY = opts.openRouterKey;
  }

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  process.stderr.write(`[jurisdiction-isolation] top-k=${opts.topK}\n`);

  // Load both corpora
  const atCorpus = loadCorpus("law-corpus/at", "law-at");
  const deCorpus = loadCorpus("law-corpus/de", "law-de");
  process.stderr.write(
    `[jurisdiction-isolation] loaded ${atCorpus.length} AT files, ${deCorpus.length} DE files\n`
  );

  // Import engine dynamically
  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  // Configure AI gateway for embeddings
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
    `[jurisdiction-isolation] embedding model: ${embeddingModel} (${embeddingDims}d)\n`
  );

  // Create in-memory engine
  process.stderr.write(`[jurisdiction-isolation] creating in-memory engine...\n`);
  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  // Provision sources (foreign key target for pages.source_id)
  for (const sid of ["law-at", "law-de"]) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`,
      [sid, sid, JSON.stringify({ federated: true })]
    );
  }
  process.stderr.write(`[jurisdiction-isolation] provisioned sources: law-at, law-de\n`);

  // Import AT corpus under source "law-at"
  process.stderr.write(`[jurisdiction-isolation] importing ${atCorpus.length} AT law files...\n`);
  for (const cf of atCorpus) {
    const slug = `law/at/${cf.slug}`;
    process.stderr.write(`  AT: importing ${cf.slug}...\r`);
    await importFromContent(engine, slug, cf.content, {
      noEmbed: false,
      sourceId: cf.sourceId,
    } as any);
  }

  // Import DE corpus under source "law-de"
  process.stderr.write(`[jurisdiction-isolation] importing ${deCorpus.length} DE law files...\n`);
  for (const cf of deCorpus) {
    const slug = `law/de/${cf.slug}`;
    process.stderr.write(`  DE: importing ${cf.slug}...\r`);
    await importFromContent(engine, slug, cf.content, {
      noEmbed: false,
      sourceId: cf.sourceId,
    } as any);
  }
  process.stderr.write(`[jurisdiction-isolation] import complete\n`);

  const allQuestions = [...AT_QUESTIONS, ...DE_QUESTIONS];
  const results: IsolationResult[] = [];

  // Test scenarios: each question tested with both same and cross jurisdiction
  let questionIdx = 0;
  for (const q of allQuestions) {
    questionIdx++;
    for (const testedWith of ["AT", "DE"] as const) {
      const sameJur = q.jurisdiction === testedWith;
      const sourceIds = testedWith === "AT" ? ["law-at"] : ["law-de"];
      const expectedSlugPrefix = testedWith === "AT" ? "law/at/" : "law/de/";
      const expectedSlug = `${expectedSlugPrefix}${q.expected_slug}`;

      try {
        const searchResults = await hybridSearch(engine, q.question, {
          limit: opts.topK,
          autocut: false,
          sourceIds,
          embeddingColumn: {
            name: "embedding",
            type: "vector" as const,
            dimensions: 1536,
            embeddingModel: embeddingModel,
          },
        });

        const rankedSlugs = searchResults.map((r) => r.slug);
        const firstHit = rankedSlugs.findIndex((s) => s === expectedSlug);
        const hitAt5 = firstHit >= 0 && firstHit < 5;

        // For cross-jurisdiction: contamination = any result from the wrong jurisdiction
        // that matches the expected law (e.g. AT question finding DE abgb)
        const result: IsolationResult = {
          question_id: q.question_id,
          question: q.question,
          jurisdiction: q.jurisdiction,
          tested_with: testedWith,
          same_jurisdiction: sameJur,
          hit_at_5: hitAt5,
          rank: firstHit >= 0 ? firstHit + 1 : 0,
          top_slugs: rankedSlugs.slice(0, 5),
        };
        results.push(result);

        const hit = hitAt5 ? "✓" : "✗";
        const label = sameJur ? "same" : "cross";
        process.stderr.write(
          `[jurisdiction-isolation] ${questionIdx}/${allQuestions.length} ${q.question_id} [${label}] ${hit} rank=${result.rank}\n`
        );
      } catch (err: any) {
        const result: IsolationResult = {
          question_id: q.question_id,
          question: q.question,
          jurisdiction: q.jurisdiction,
          tested_with: testedWith,
          same_jurisdiction: sameJur,
          hit_at_5: false,
          rank: 0,
          top_slugs: [],
          error: String(err?.message ?? err),
        };
        results.push(result);
        process.stderr.write(
          `[jurisdiction-isolation] ${questionIdx}/${allQuestions.length} ${q.question_id} (error: ${err?.message})\n`
        );
      }
    }
  }

  // Build report
  const scenarios: IsolationReport["scenarios"] = [];
  for (const jur of ["AT", "DE"] as const) {
    for (const testedWith of ["AT", "DE"] as const) {
      const subset = results.filter(
        (r) => r.jurisdiction === jur && r.tested_with === testedWith
      );
      const n = subset.length;
      if (n === 0) continue;
      const hitAt5 = subset.filter((r) => r.hit_at_5).length / n;
      const same = jur === testedWith;
      scenarios.push({
        name: `${jur} questions with ${testedWith} sources`,
        jurisdiction: jur,
        tested_with: testedWith,
        same_jurisdiction: same,
        n,
        hit_at_5: same ? hitAt5 : 0,
        contamination_rate: same ? 0 : hitAt5,
      });
    }
  }

  // Aggregate: same-jur Hit@5 and cross-jur contamination
  const sameResults = results.filter((r) => r.same_jurisdiction);
  const crossResults = results.filter((r) => !r.same_jurisdiction);
  const sameHitAt5 = sameResults.length > 0
    ? sameResults.filter((r) => r.hit_at_5).length / sameResults.length
    : 0;
  const crossContamination = crossResults.length > 0
    ? crossResults.filter((r) => r.hit_at_5).length / crossResults.length
    : 0;

  const report: IsolationReport = {
    schema_version: 1,
    benchmark: "jurisdiction-isolation",
    total: results.length,
    scenarios,
    aggregate: {
      same_jur_hit_at_5: sameHitAt5,
      cross_jur_contamination: crossContamination,
      pass: sameHitAt5 >= 0.9 && crossContamination <= 0.1,
    },
  };

  // Print summary
  process.stderr.write(`\n[jurisdiction-isolation] RESULTS\n`);
  for (const s of scenarios) {
    if (s.same_jurisdiction) {
      process.stderr.write(
        `  ${s.name}: Hit@5=${(s.hit_at_5 * 100).toFixed(1)}% (n=${s.n})\n`
      );
    } else {
      process.stderr.write(
        `  ${s.name}: Contamination=${(s.contamination_rate * 100).toFixed(1)}% (n=${s.n})\n`
      );
    }
  }
  process.stderr.write(`\n  Aggregate Same-Jur Hit@5:   ${(sameHitAt5 * 100).toFixed(1)}% (target ≥90%)\n`);
  process.stderr.write(`  Aggregate Cross-Contamination: ${(crossContamination * 100).toFixed(1)}% (target ≤10%)\n`);
  process.stderr.write(`  PASS: ${report.aggregate.pass ? "YES ✅" : "NO ❌"}\n`);

  // Write output
  if (opts.outputPath) {
    const emitter = new JsonlEmitter(opts.outputPath, false);
    for (const r of results) {
      emitter.emit(r as unknown as Record<string, unknown>);
    }
    emitter.emit({
      schema_version: 1,
      kind: "summary",
      benchmark: report.benchmark,
      total: report.total,
      aggregate: report.aggregate,
      scenarios: report.scenarios,
    });
    process.stderr.write(`[jurisdiction-isolation] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[jurisdiction-isolation] done.\n`);

  // Exit code: 0 if pass, 1 if fail
  if (!report.aggregate.pass) {
    process.stderr.write(`\n[jurisdiction-isolation] BENCHMARK FAILED ❌\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
