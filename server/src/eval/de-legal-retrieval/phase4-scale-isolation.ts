/**
 * German Legal Retrieval — Phase 4: Scale & Multi-Tenant Isolation Test
 *
 * Test A — Scale: Retrieval quality at 10, 20, 30 corpus files.
 * Test B — Multi-Tenant Isolation: Two tenants with disjoint law sets,
 *   verify zero cross-tenant leakage.
 * Test C — Federated Read: Search across both tenants via sourceIds[].
 *
 * Usage:
 *   bun run src/eval/de-legal-retrieval/phase4-scale-isolation.ts \
 *     test/fixtures/legal-practice-questions.jsonl \
 *     --output /tmp/de-legal-phase4.jsonl
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");

// ─── Types ───────────────────────────────────────────────────────────────

interface PracticeQuestion {
  question_id: string;
  question: string;
  expected_slugs: string[];
  legal_area: string;
  difficulty: string;
}

interface ScaleResult {
  scale_tier: string;
  file_count: number;
  total_questions: number;
  hit_at_5: number;
  hit_at_5_pct: number;
  mrr: number;
  empty_results: number;
  errors: number;
  per_area: Record<string, { n: number; hit_at_5: number }>;
}

interface IsolationResult {
  test: string;
  tenant: string;
  query: string;
  result_count: number;
  result_slugs: string[];
  result_sources: string[];
  leaked_slugs: string[];
  leaked_sources: string[];
  passed: boolean;
  error?: string;
}

interface Phase4Report {
  scale_results: ScaleResult[];
  isolation_results: IsolationResult[];
  isolation_summary: {
    total_tests: number;
    passed: number;
    failed: number;
    zero_leakage: boolean;
  };
  federated_results: IsolationResult[];
  federated_summary: {
    total_tests: number;
    passed: number;
    both_tenants_present: number;
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  fixturePath: string;
  outputPath?: string;
  limit?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { fixturePath: "" };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--limit" && i + 1 < args.length) { out.limit = parseInt(args[++i], 10); continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/de-legal-retrieval/phase4-scale-isolation.ts <fixture.jsonl> [options]\n` +
        `  --output PATH   Write JSONL results to PATH\n` +
        `  --limit N       Only run first N questions (for quick tests)\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) out.fixturePath = a;
  }
  if (!out.fixturePath) { process.stderr.write("Error: fixture path required\n"); process.exit(1); }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function loadFixture(path: string): PracticeQuestion[] {
  const raw = readFileSync(path, "utf-8");
  return raw.trim().split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => JSON.parse(l));
}

interface CorpusFile { slug: string; content: string; abbreviation: string; }

function loadLawCorpus(): CorpusFile[] {
  const corpusDir = join(REPO_ROOT, "law-corpus/de");
  if (!existsSync(corpusDir)) throw new Error(`law-corpus/de not found at ${corpusDir}`);
  const files = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));
  const out: CorpusFile[] = [];
  for (const file of files) {
    const content = readFileSync(join(corpusDir, file), "utf-8");
    const slug = file.replace(/\.md$/, "");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    let abbreviation = slug.toUpperCase();
    if (fmMatch) {
      const abbrMatch = fmMatch[1].match(/abbreviation:\s*"([^"]+)"/);
      if (abbrMatch) abbreviation = abbrMatch[1];
    }
    out.push({ slug, content, abbreviation });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

class JsonlEmitter {
  constructor(private path: string) {
    if (existsSync(path)) writeFileSync(path, "");
  }
  emit(obj: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }
}

const EMBEDDING_COLUMN = {
  name: "embedding",
  type: "vector" as const,
  dimensions: 1536,
  embeddingModel: "openrouter:openai/text-embedding-3-small",
};

// ─── Test A: Scale ───────────────────────────────────────────────────────

async function runScaleTest(
  questions: PracticeQuestion[],
  corpusFiles: CorpusFile[],
  topK: number,
  emitter: JsonlEmitter | null
): Promise<ScaleResult[]> {
  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  const cfg = loadConfig();
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: 1536,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);

  const tiers = [
    { name: "10-files", count: 10 },
    { name: "20-files", count: 20 },
    { name: "30-files", count: 30 },
  ];

  const results: ScaleResult[] = [];

  for (const tier of tiers) {
    const files = corpusFiles.slice(0, tier.count);
    process.stderr.write(`\n[phase4-scale] === Tier: ${tier.name} (${files.length} files) ===\n`);

    const engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();

    for (const cf of files) {
      const slug = `law/de/${cf.slug}`;
      process.stderr.write(`  importing ${cf.abbreviation}...\n`);
      await importFromContent(engine, slug, cf.content, { noEmbed: false });
    }
    process.stderr.write(`  import complete. Running ${questions.length} questions...\n`);

    // Only test questions whose expected law is actually in this tier's files
    const tierSlugs = new Set(files.map((f) => `law/de/${f.slug}`));
    const applicableQuestions = questions.filter((q) =>
      q.expected_slugs.some((s) => tierSlugs.has(`law/de/${s}`))
    );
    process.stderr.write(`  ${applicableQuestions.length}/${questions.length} questions have expected law in this tier\n`);

    let hit5 = 0;
    let empty = 0;
    let errors = 0;
    let mrrSum = 0;
    const perArea: Record<string, { n: number; hit_at_5: number }> = {};

    let qIdx = 0;
    for (const q of applicableQuestions) {
      qIdx++;
      const expectedSlug = `law/de/${q.expected_slugs[0]}`;

      // Per-area init
      const area = q.legal_area;
      if (!perArea[area]) perArea[area] = { n: 0, hit_at_5: 0 };
      perArea[area].n++;

      try {
        const searchResults = await hybridSearch(engine, q.question, {
          limit: topK,
          autocut: false,
          embeddingColumn: EMBEDDING_COLUMN,
        });

        const rankedSlugs = searchResults.map((r) => r.slug);

        if (searchResults.length === 0) {
          empty++;
          process.stderr.write(`  ${qIdx}/${applicableQuestions.length} ${q.question_id} EMPTY\n`);
        } else {
          const hitIdx = rankedSlugs.indexOf(expectedSlug);
          if (hitIdx >= 0 && hitIdx < topK) {
            hit5++;
            mrrSum += 1 / (hitIdx + 1);
            perArea[area].hit_at_5++;
          }
        }
      } catch (err: any) {
        errors++;
        process.stderr.write(`  ${qIdx}/${applicableQuestions.length} ${q.question_id} ERROR: ${err.message}\n`);
      }
    }

    const total = applicableQuestions.length || 1;
    const result: ScaleResult = {
      scale_tier: tier.name,
      file_count: files.length,
      total_questions: applicableQuestions.length,
      hit_at_5: hit5,
      hit_at_5_pct: (hit5 / total) * 100,
      mrr: mrrSum / total,
      empty_results: empty,
      errors,
      per_area: perArea,
    };

    process.stderr.write(
      `  RESULT: Hit@5=${result.hit_at_5_pct.toFixed(1)}% MRR=${result.mrr.toFixed(3)} empty=${empty} errors=${errors}\n`
    );
    for (const [area, stats] of Object.entries(perArea)) {
      process.stderr.write(`    ${area} (n=${stats.n}): Hit@5=${((stats.hit_at_5 / stats.n) * 100).toFixed(1)}%\n`);
    }

    results.push(result);
    if (emitter) emitter.emit({ kind: "scale_result", ...result } as unknown as Record<string, unknown>);

    await engine.disconnect();
  }

  return results;
}

// ─── Test B: Multi-Tenant Isolation ──────────────────────────────────────

async function runIsolationTest(
  corpusFiles: CorpusFile[],
  emitter: JsonlEmitter | null
): Promise<{ isolation: IsolationResult[]; federated: IsolationResult[] }> {
  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

  const cfg = loadConfig();
  configureGateway({
    embedding_model: "openrouter:openai/text-embedding-3-small",
    embedding_dimensions: 1536,
    expansion_model: cfg?.expansion_model ?? "openrouter:deepseek/deepseek-chat",
    chat_model: cfg?.chat_model ?? "openrouter:deepseek/deepseek-chat",
    env: { ...process.env },
  } as any);

  // Split corpus: tenant-a gets first 15, tenant-b gets last 15
  // Ensure no overlap
  const tenantAFiles = corpusFiles.slice(0, 15);
  const tenantBFiles = corpusFiles.slice(15, 30);
  const tenantASlugs = new Set(tenantAFiles.map((f) => `law/de/${f.slug}`));
  const tenantBSlugs = new Set(tenantBFiles.map((f) => `law/de/${f.slug}`));

  process.stderr.write(`\n[phase4-isolation] === Setting up multi-tenant engine ===\n`);
  process.stderr.write(`  Tenant-A: ${tenantAFiles.length} files (${tenantAFiles.map(f => f.abbreviation).join(", ")})\n`);
  process.stderr.write(`  Tenant-B: ${tenantBFiles.length} files (${tenantBFiles.map(f => f.abbreviation).join(", ")})\n`);

  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  // Register tenant sources in the sources table (FK requirement)
  process.stderr.write(`\n  Registering tenant sources...\n`);
  for (const tenantId of ["tenant-a", "tenant-b"]) {
    await engine.executeRaw(
      `INSERT INTO sources (id, name, config) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO NOTHING`,
      [tenantId, tenantId, JSON.stringify({ provisioned_by: "phase4_test" })]
    );
  }

  // Import tenant-a files with sourceId="tenant-a"
  process.stderr.write(`\n  Importing tenant-a files...\n`);
  for (const cf of tenantAFiles) {
    const slug = `law/de/${cf.slug}`;
    process.stderr.write(`    ${cf.abbreviation} → tenant-a\n`);
    await importFromContent(engine, slug, cf.content, { noEmbed: false, sourceId: "tenant-a" });
  }

  // Import tenant-b files with sourceId="tenant-b"
  process.stderr.write(`\n  Importing tenant-b files...\n`);
  for (const cf of tenantBFiles) {
    const slug = `law/de/${cf.slug}`;
    process.stderr.write(`    ${cf.abbreviation} → tenant-b\n`);
    await importFromContent(engine, slug, cf.content, { noEmbed: false, sourceId: "tenant-b" });
  }

  process.stderr.write(`\n  Import complete. Running isolation tests...\n`);

  const isolationResults: IsolationResult[] = [];
  const federatedResults: IsolationResult[] = [];

  // Test queries — use questions that should match tenant-a laws
  const testQueries = [
    { query: "Was ist ein Kaufmann im Sinne des Handelsgesetzbuchs?", expected_tenant: "tenant-a", expected_law: "hgb" },
    { query: "Wer gilt als Handelsgewerbe?", expected_tenant: "tenant-a", expected_law: "hgb" },
    { query: "Wann ist eine Tat ein Verbrechen?", expected_tenant: "tenant-a", expected_law: "stgb" },
    { query: "Was ist Notwehr und wann darf man sich verteidigen?", expected_tenant: "tenant-a", expected_law: "stgb" },
    { query: "Was ist die regelmäßige Verjährungsfrist?", expected_tenant: "tenant-a", expected_law: "bgb" },
    { query: "Wie funktioniert das Mahnverfahren?", expected_tenant: "tenant-a", expected_law: "zpo" },
    { query: "Was ist das Steuergeheimnis und wer ist daran gebunden?", expected_tenant: "tenant-a", expected_law: "ao" },
    { query: "Was ist eine Betriebstätte im Steuerrecht?", expected_tenant: "tenant-a", expected_law: "ao" },
  ];

  // ── Test B: Tenant-A isolation ──
  process.stderr.write(`\n  --- Test B: Tenant-A isolation (sourceId=tenant-a) ---\n`);
  for (const tq of testQueries) {
    try {
      const results = await hybridSearch(engine, tq.query, {
        limit: 5,
        autocut: false,
        embeddingColumn: EMBEDDING_COLUMN,
        sourceId: "tenant-a",
      });

      const resultSlugs = results.map((r) => r.slug);
      const resultSources = results.map((r) => r.source_id ?? "unknown");
      const leakedSlugs = resultSlugs.filter((s) => !tenantASlugs.has(s));
      const leakedSources = resultSources.filter((s) => s !== "tenant-a");

      const passed = leakedSlugs.length === 0 && leakedSources.length === 0;

      const ir: IsolationResult = {
        test: "tenant-a-isolation",
        tenant: "tenant-a",
        query: tq.query,
        result_count: results.length,
        result_slugs: resultSlugs,
        result_sources: resultSources,
        leaked_slugs: leakedSlugs,
        leaked_sources: leakedSources,
        passed,
      };
      isolationResults.push(ir);
      if (emitter) emitter.emit({ kind: "isolation_result", ...ir } as unknown as Record<string, unknown>);

      process.stderr.write(
        `    ${tq.expected_law}: ${results.length} results, leaked=${leakedSlugs.length} ${passed ? "✓" : "✗ LEAK"}\n`
      );
      if (!passed) {
        process.stderr.write(`      LEAKED: ${leakedSlugs.join(", ")} from sources: ${leakedSources.join(", ")}\n`);
      }
    } catch (err: any) {
      const ir: IsolationResult = {
        test: "tenant-a-isolation",
        tenant: "tenant-a",
        query: tq.query,
        result_count: 0,
        result_slugs: [],
        result_sources: [],
        leaked_slugs: [],
        leaked_sources: [],
        passed: false,
        error: String(err.message),
      };
      isolationResults.push(ir);
      if (emitter) emitter.emit({ kind: "isolation_result", ...ir } as unknown as Record<string, unknown>);
      process.stderr.write(`    ${tq.expected_law}: ERROR: ${err.message}\n`);
    }
  }

  // ── Test B: Tenant-B isolation ──
  process.stderr.write(`\n  --- Test B: Tenant-B isolation (sourceId=tenant-b) ---\n`);
  // Use queries that should match tenant-b laws
  const tenantBQueries = [
    { query: "Was ist das Gesetz gegen den unlauteren Wettbewerb?", expected_law: "uwg" },
    { query: "Was sind Grundrechte und welche gibt es?", expected_law: "gg" },
    { query: "Was ist das Baugesetzbuch und was regelt es?", expected_law: "baugb" },
    { query: "Wie funktioniert die Zwangsvollstreckung in das unbewegliche Vermögen?", expected_law: "zvg" },
    { query: "Was ist die Insolvenzordnung?", expected_law: "inso" },
    { query: "Was ist das Urheberrechtsgesetz?", expected_law: "urhg" },
    { query: "Was ist das Gewerbeordnung?", expected_law: "gewo" },
    { query: "Was ist das Familienverfahrensgesetz?", expected_law: "famfg" },
  ];

  for (const tq of tenantBQueries) {
    try {
      const results = await hybridSearch(engine, tq.query, {
        limit: 5,
        autocut: false,
        embeddingColumn: EMBEDDING_COLUMN,
        sourceId: "tenant-b",
      });

      const resultSlugs = results.map((r) => r.slug);
      const resultSources = results.map((r) => r.source_id ?? "unknown");
      const leakedSlugs = resultSlugs.filter((s) => !tenantBSlugs.has(s));
      const leakedSources = resultSources.filter((s) => s !== "tenant-b");

      const passed = leakedSlugs.length === 0 && leakedSources.length === 0;

      const ir: IsolationResult = {
        test: "tenant-b-isolation",
        tenant: "tenant-b",
        query: tq.query,
        result_count: results.length,
        result_slugs: resultSlugs,
        result_sources: resultSources,
        leaked_slugs: leakedSlugs,
        leaked_sources: leakedSources,
        passed,
      };
      isolationResults.push(ir);
      if (emitter) emitter.emit({ kind: "isolation_result", ...ir } as unknown as Record<string, unknown>);

      process.stderr.write(
        `    ${tq.expected_law}: ${results.length} results, leaked=${leakedSlugs.length} ${passed ? "✓" : "✗ LEAK"}\n`
      );
      if (!passed) {
        process.stderr.write(`      LEAKED: ${leakedSlugs.join(", ")} from sources: ${leakedSources.join(", ")}\n`);
      }
    } catch (err: any) {
      const ir: IsolationResult = {
        test: "tenant-b-isolation",
        tenant: "tenant-b",
        query: tq.query,
        result_count: 0,
        result_slugs: [],
        result_sources: [],
        leaked_slugs: [],
        leaked_sources: [],
        passed: false,
        error: String(err.message),
      };
      isolationResults.push(ir);
      if (emitter) emitter.emit({ kind: "isolation_result", ...ir } as unknown as Record<string, unknown>);
      process.stderr.write(`    ${tq.expected_law}: ERROR: ${err.message}\n`);
    }
  }

  // ── Test C: Federated Read (sourceIds: both tenants) ──
  process.stderr.write(`\n  --- Test C: Federated Read (sourceIds=[tenant-a, tenant-b]) ---\n`);
  const federatedQueries = [
    "Was ist ein Kaufmann im Sinne des Handelsgesetzbuchs?",
    "Was sind Grundrechte und welche gibt es?",
    "Wann ist eine Tat ein Verbrechen?",
    "Was ist die Insolvenzordnung?",
    "Was ist die regelmäßige Verjährungsfrist?",
  ];

  for (const query of federatedQueries) {
    try {
      const results = await hybridSearch(engine, query, {
        limit: 10,
        autocut: false,
        embeddingColumn: EMBEDDING_COLUMN,
        sourceIds: ["tenant-a", "tenant-b"],
      });

      const resultSlugs = results.map((r) => r.slug);
      const resultSources = results.map((r) => r.source_id ?? "unknown");
      const uniqueSources = [...new Set(resultSources)];
      const hasBothTenants = uniqueSources.includes("tenant-a") && uniqueSources.includes("tenant-b");
      const leakedSources = resultSources.filter((s) => s !== "tenant-a" && s !== "tenant-b");

      const passed = leakedSources.length === 0 && results.length > 0;

      const ir: IsolationResult = {
        test: "federated-read",
        tenant: "both",
        query,
        result_count: results.length,
        result_slugs: resultSlugs,
        result_sources: resultSources,
        leaked_slugs: [],
        leaked_sources: leakedSources,
        passed,
      };
      federatedResults.push(ir);
      if (emitter) emitter.emit({ kind: "federated_result", ...ir } as unknown as Record<string, unknown>);

      process.stderr.write(
        `    ${results.length} results, sources=[${uniqueSources.join(", ")}] both=${hasBothTenants} ${passed ? "✓" : "✗"}\n`
      );
    } catch (err: any) {
      const ir: IsolationResult = {
        test: "federated-read",
        tenant: "both",
        query,
        result_count: 0,
        result_slugs: [],
        result_sources: [],
        leaked_slugs: [],
        leaked_sources: [],
        passed: false,
        error: String(err.message),
      };
      federatedResults.push(ir);
      if (emitter) emitter.emit({ kind: "federated_result", ...ir } as unknown as Record<string, unknown>);
      process.stderr.write(`    ERROR: ${err.message}\n`);
    }
  }

  // ── Test D: No sourceId (unscoped search — should return from both) ──
  process.stderr.write(`\n  --- Test D: Unscoped search (no sourceId) ---\n`);
  const unscopedQueries = [
    "Was ist ein Kaufmann?",
    "Was sind Grundrechte?",
  ];

  for (const query of unscopedQueries) {
    try {
      const results = await hybridSearch(engine, query, {
        limit: 10,
        autocut: false,
        embeddingColumn: EMBEDDING_COLUMN,
      });

      const resultSources = results.map((r) => r.source_id ?? "unknown");
      const uniqueSources = [...new Set(resultSources)];

      const ir: IsolationResult = {
        test: "unscoped",
        tenant: "none",
        query,
        result_count: results.length,
        result_slugs: results.map((r) => r.slug),
        result_sources: resultSources,
        leaked_slugs: [],
        leaked_sources: [],
        passed: results.length > 0,
      };
      isolationResults.push(ir);
      if (emitter) emitter.emit({ kind: "isolation_result", ...ir } as unknown as Record<string, unknown>);

      process.stderr.write(
        `    ${results.length} results, sources=[${uniqueSources.join(", ")}]\n`
      );
    } catch (err: any) {
      process.stderr.write(`    ERROR: ${err.message}\n`);
    }
  }

  await engine.disconnect();
  return { isolation: isolationResults, federated: federatedResults };
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const questions = loadFixture(opts.fixturePath);
  const corpusFiles = loadLawCorpus();

  let testQuestions = questions;
  if (opts.limit && opts.limit > 0) testQuestions = questions.slice(0, opts.limit);

  process.stderr.write(`[phase4] loaded ${testQuestions.length} questions, ${corpusFiles.length} corpus files\n`);

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const emitter = opts.outputPath ? new JsonlEmitter(opts.outputPath) : null;

  // ── Test A: Scale ──
  process.stderr.write(`\n[phase4] ═══ TEST A: SCALE ═══\n`);
  const scaleResults = await runScaleTest(testQuestions, corpusFiles, 5, emitter);

  // Print scale summary
  process.stderr.write(`\n[phase4] SCALE SUMMARY:\n`);
  process.stderr.write(`  Tier       Files  Hit@5     MRR    Empty  Errors\n`);
  for (const sr of scaleResults) {
    process.stderr.write(
      `  ${sr.scale_tier.padEnd(10)} ${String(sr.file_count).padStart(5)}  ${sr.hit_at_5_pct.toFixed(1).padStart(7)}%  ${sr.mrr.toFixed(3)}  ${String(sr.empty_results).padStart(5)}  ${String(sr.errors).padStart(5)}\n`
    );
  }

  // ── Test B+C: Isolation ──
  process.stderr.write(`\n[phase4] ═══ TEST B+C: MULTI-TENANT ISOLATION ═══\n`);
  const { isolation, federated } = await runIsolationTest(corpusFiles, emitter);

  // Isolation summary
  const isolationPassed = isolation.filter((r) => r.test !== "unscoped" && r.passed).length;
  const isolationFailed = isolation.filter((r) => r.test !== "unscoped" && !r.passed).length;
  const isolationTotal = isolation.filter((r) => r.test !== "unscoped").length;
  const zeroLeakage = isolationFailed === 0;

  process.stderr.write(`\n[phase4] ISOLATION SUMMARY:\n`);
  process.stderr.write(`  Tests: ${isolationTotal}, Passed: ${isolationPassed}, Failed: ${isolationFailed}\n`);
  process.stderr.write(`  Zero cross-tenant leakage: ${zeroLeakage ? "✅ YES" : "❌ NO"}\n`);

  if (!zeroLeakage) {
    process.stderr.write(`\n  LEAK DETAILS:\n`);
    for (const ir of isolation.filter((r) => r.test !== "unscoped" && !r.passed)) {
      process.stderr.write(`    ${ir.tenant} / "${ir.query.slice(0, 50)}...": leaked ${ir.leaked_slugs.length} slugs from ${ir.leaked_sources.length} sources\n`);
    }
  }

  // Federated summary
  const fedPassed = federated.filter((r) => r.passed).length;
  const fedBoth = federated.filter((r) => {
    const sources = [...new Set(r.result_sources)];
    return sources.includes("tenant-a") && sources.includes("tenant-b");
  }).length;

  process.stderr.write(`\n[phase4] FEDERATED READ SUMMARY:\n`);
  process.stderr.write(`  Tests: ${federated.length}, Passed: ${fedPassed}, Both tenants present: ${fedBoth}\n`);

  // Final report
  const report: Phase4Report = {
    scale_results: scaleResults,
    isolation_results: isolation,
    isolation_summary: {
      total_tests: isolationTotal,
      passed: isolationPassed,
      failed: isolationFailed,
      zero_leakage: zeroLeakage,
    },
    federated_results: federated,
    federated_summary: {
      total_tests: federated.length,
      passed: fedPassed,
      both_tenants_present: fedBoth,
    },
  };

  if (emitter) {
    emitter.emit({ kind: "final_report", ...report } as unknown as Record<string, unknown>);
    process.stderr.write(`\n[phase4] output written to ${opts.outputPath}\n`);
  }

  // Verdict
  const scalePass = scaleResults.every((sr) => sr.hit_at_5_pct >= 90);
  const isolationPass = zeroLeakage;
  const federatedPass = fedPassed === federated.length;

  process.stderr.write(`\n[phase4] ═══ FINAL VERDICT ═══\n`);
  process.stderr.write(`  Scale test (Hit@5 ≥ 90% at all tiers): ${scalePass ? "✅ PASS" : "❌ FAIL"}\n`);
  process.stderr.write(`  Isolation test (zero leakage):          ${isolationPass ? "✅ PASS" : "❌ FAIL"}\n`);
  process.stderr.write(`  Federated read (both tenants):          ${federatedPass ? "✅ PASS" : "❌ FAIL"}\n`);
  process.stderr.write(`  Overall:                                ${scalePass && isolationPass && federatedPass ? "✅ ALL PASS" : "❌ FAILURES"}\n`);

  process.stderr.write(`\n[phase4] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
