/**
 * In-Memory Subsumption Benchmark — full pipeline test:
 * 1. Import law corpus into in-memory PGLite
 * 2. Retrieve relevant law chunks via hybridSearch (+ LLM rerank)
 * 3. Generate LLM answer using retrieved chunks as context
 * 4. Verify grounding + keyword correctness
 *
 * Usage:
 *   bun run src/eval/subsumption/run-inmemory.ts \
 *     test/fixtures/de-subsumption.jsonl \
 *     --jurisdiction de \
 *     --llm-rerank \
 *     --output /tmp/subsumption-de-llm.jsonl
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, readdirSync } from "fs";
import { join as joinPath, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../../../..");

// ─── Types ───────────────────────────────────────────────────────────────

interface SubsumptionCase {
  case_id: string;
  jurisdiction: string;
  facts: string;
  question: string;
  expected_law: string;
  expected_section?: string;
  expected_keywords: string[];
  expected_conclusion: string;
}

interface CaseResult {
  case_id: string;
  question: string;
  retrieved_slugs: string[];
  retrieved_law_hit: boolean;
  retrieved_law_rank: number;
  llm_answer: string;
  answer_length: number;
  grounded_claims: number;
  ungrounded_claims: number;
  hallucination_rate: number;
  keyword_hits: string[];
  keyword_misses: string[];
  keyword_match_rate: number;
  mentions_expected_law: boolean;
  pass: boolean;
  error?: string;
}

interface ParsedArgs {
  fixturePath: string;
  jurisdiction: string;
  outputPath?: string;
  append: boolean;
  llmRerank: boolean;
  limit?: number;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    fixturePath: "",
    jurisdiction: "de",
    append: false,
    llmRerank: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--jurisdiction" && i + 1 < args.length) { out.jurisdiction = args[++i]; continue; }
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--append") { out.append = true; continue; }
    if (a === "--llm-rerank") { out.llmRerank = true; continue; }
    if (a === "--limit" && i + 1 < args.length) { out.limit = parseInt(args[++i], 10); continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/subsumption/run-inmemory.ts <fixture.jsonl> [options]\n` +
          `  --jurisdiction X  de|at (default: de)\n` +
          `  --output PATH     Write JSONL results to PATH\n` +
          `  --append          Append to output\n` +
          `  --llm-rerank      Enable LLM re-ranker (DeepSeek)\n` +
          `  --limit N         Only run first N cases\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) { out.fixturePath = a; continue; }
  }
  if (!out.fixturePath) {
    process.stderr.write("Error: fixture path required\n");
    process.exit(1);
  }
  return out;
}

function loadFixture(path: string): SubsumptionCase[] {
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as SubsumptionCase);
}

// ─── Law corpus loading ──────────────────────────────────────────────────

interface CorpusFile {
  slug: string;
  content: string;
  abbreviation: string;
}

function loadLawCorpus(jurisdiction: string): CorpusFile[] {
  const corpusDir = joinPath(REPO_ROOT, "law-corpus", jurisdiction);
  const files = readdirSync(corpusDir).filter((f) => f.endsWith(".md"));
  const out: CorpusFile[] = [];
  for (const file of files) {
    const content = readFileSync(joinPath(corpusDir, file), "utf-8");
    const slug = file.replace(/\.md$/, "");
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

// ─── Grounding verification ──────────────────────────────────────────────

function extractClaims(answer: string): string[] {
  const sentences = answer.split(/[.!?]\s+/).filter((s) => s.trim().length > 10);
  return sentences.filter((s) =>
    /(?:§|Art\.|Abs\.|BGB|ABGB|StGB|ZPO|HGB|GmbHG|InsO|UWG|BauGB|DSG|VwGO|AO|ArbVG|EheG|IO|AVG|GewO|ASVG|KartG|UGB|BAO|Anspruch|Recht|Pflicht|Vertrag|Schadensersatz|Gewährleistung|Verjährung|nichtig|wirksam|zulässig|strafbar|schuldig)/i.test(s)
  );
}

function isClaimGrounded(claim: string, context: string): boolean {
  const claimTerms = claim
    .toLowerCase()
    .match(/[\p{L}]{4,}/gu)
    ?.filter((t) =>
      !["der", "die", "das", "ein", "eine", "ist", "wird", "wurde", "hat", "haben",
        "nach", "nachstehend", "gemäß", "aufgrund", "hinsichtlich", "bezüglich",
        "nicht", "auch", "sich", "wenn", "dann", "oder", "und", "als", "im", "in",
        "mit", "zu", "von", "für", "auf", "bei", "dem", "den", "des", "einem",
        "einer", "eines", "dieser", "diese", "dieses", "jeder", "jede", "jedes"
      ].includes(t)
    ) ?? [];
  if (claimTerms.length === 0) return true;
  const contextLower = context.toLowerCase();
  const matchedTerms = claimTerms.filter((t) => contextLower.includes(t));
  return matchedTerms.length / claimTerms.length >= 0.3;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  let cases = loadFixture(opts.fixturePath);
  if (opts.limit) cases = cases.slice(0, opts.limit);

  const corpusFiles = loadLawCorpus(opts.jurisdiction);

  process.stderr.write(
    `[subsumption-mem] loaded ${cases.length} cases, ${corpusFiles.length} corpus files (jurisdiction=${opts.jurisdiction})\n`
  );
  if (opts.llmRerank) {
    process.stderr.write(`[subsumption-mem] LLM re-ranker: ENABLED (deepseek-chat)\n`);
  }

  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";
  process.env.GBRAIN_AI_EMBED_TIMEOUT_MS = "120000";

  const { PGLiteEngine } = await import("../../core/pglite-engine.ts");
  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { importFromContent } = await import("../../core/import-file.ts");
  const { configureGateway, chat } = await import("../../core/ai/gateway.ts");
  const { loadConfig } = await import("../../core/config.ts");

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

  process.stderr.write(`[subsumption-mem] creating in-memory engine...\n`);
  const engine = new PGLiteEngine();
  await engine.connect({});
  await engine.initSchema();

  process.stderr.write(`[subsumption-mem] importing ${corpusFiles.length} law files...\n`);
  for (const cf of corpusFiles) {
    const slug = `law/${opts.jurisdiction}/${cf.slug}`;
    process.stderr.write(`  importing ${cf.abbreviation} (${cf.slug})...\n`);
    await importFromContent(engine, slug, cf.content, { noEmbed: false });
  }
  process.stderr.write(`[subsumption-mem] import complete\n`);

  const lawPrefix = `law/${opts.jurisdiction}/`;
  const results: CaseResult[] = [];
  let caseIdx = 0;

  for (const c of cases) {
    caseIdx++;
    try {
      const searchQuery = `${c.facts} ${c.question}`;
      const searchResults = await hybridSearch(engine, searchQuery, {
        limit: 20,
        jurisdiction: opts.jurisdiction,
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

      const retrievedSlugs = searchResults.map((r) => r.slug);
      const expectedLawPrefix = `${lawPrefix}${c.expected_law}`;
      const lawRank = retrievedSlugs.findIndex((s) => s.startsWith(expectedLawPrefix));
      const lawHit = lawRank >= 0;

      const context = searchResults
        .map((r) => {
          const chunkText = (r as any).chunk_text ?? (r as any).content ?? "";
          return `[${r.slug}]\n${chunkText}`;
        })
        .join("\n\n---\n\n");

      const systemPrompt = `Du bist ein juristischer Experte. Beantworte die Frage AUSSCHLIESSLICH basierend auf den bereitgestellten Gesetzestexten.

STRIKTE REGELN:
- Verwende nur Begriffe und Konzepte, die in den Gesetzestexten vorkommen.
- Erfinde keine Paragraphen oder Gesetze, die nicht in den Texten genannt werden.
- Zitiere die genaue Gesetzesstelle (§ X GesetzY).
- Wenn die Texte nicht ausreichen, sage: "Die bereitgestellten Texte reichen für eine Beantwortung nicht aus."
- Verwende die juristische Fachsprache aus den Gesetzestexten.

Gesetzestexte:
${context}`;

      const userPrompt = `Sachverhalt: ${c.facts}\n\nFrage: ${c.question}\n\nBeantworte die Frage mit Angabe der gesetzlichen Grundlage.`;

      const chatResult = await chat({
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1000,
      });

      const llmAnswer = chatResult.text || "";

      const claims = extractClaims(llmAnswer);
      let grounded = 0;
      let ungrounded = 0;
      for (const claim of claims) {
        if (isClaimGrounded(claim, context)) {
          grounded++;
        } else {
          ungrounded++;
        }
      }
      const hallucinationRate = claims.length > 0 ? ungrounded / claims.length : 0;

      const answerLower = llmAnswer.toLowerCase();
      const keywordHits: string[] = [];
      const keywordMisses: string[] = [];
      for (const kw of c.expected_keywords) {
        const kwLower = kw.toLowerCase();
        const partial = kwLower.length > 6 ? kwLower.slice(0, 6) : kwLower;
        if (answerLower.includes(kwLower) || answerLower.includes(partial)) {
          keywordHits.push(kw);
        } else {
          keywordMisses.push(kw);
        }
      }
      const keywordMatchRate = c.expected_keywords.length > 0
        ? keywordHits.length / c.expected_keywords.length
        : 1;
      const mentionsExpectedLaw = answerLower.includes(c.expected_law.toLowerCase()) ||
        retrievedSlugs.some((s) => s.startsWith(expectedLawPrefix));

      const pass = lawHit && hallucinationRate <= 0.3 && keywordMatchRate >= 0.4;

      const result: CaseResult = {
        case_id: c.case_id,
        question: c.question,
        retrieved_slugs: retrievedSlugs.slice(0, 5),
        retrieved_law_hit: lawHit,
        retrieved_law_rank: lawRank + 1,
        llm_answer: llmAnswer,
        answer_length: llmAnswer.length,
        grounded_claims: grounded,
        ungrounded_claims: ungrounded,
        hallucination_rate: hallucinationRate,
        keyword_hits: keywordHits,
        keyword_misses: keywordMisses,
        keyword_match_rate: keywordMatchRate,
        mentions_expected_law: mentionsExpectedLaw,
        pass,
      };
      results.push(result);

      const status = pass ? "✓ PASS" : "✗ FAIL";
      process.stderr.write(
        `[subsumption-mem] ${caseIdx}/${cases.length} (${Math.round(caseIdx / cases.length * 100)}%) ${status} ${c.case_id} (halluc=${(hallucinationRate * 100).toFixed(0)}%, kw=${(keywordMatchRate * 100).toFixed(0)}%, law=${lawHit ? `Y(r${lawRank + 1})` : "N"})\n`
      );
    } catch (err: any) {
      results.push({
        case_id: c.case_id,
        question: c.question,
        retrieved_slugs: [],
        retrieved_law_hit: false,
        retrieved_law_rank: 0,
        llm_answer: "",
        answer_length: 0,
        grounded_claims: 0,
        ungrounded_claims: 0,
        hallucination_rate: 1,
        keyword_hits: [],
        keyword_misses: c.expected_keywords,
        keyword_match_rate: 0,
        mentions_expected_law: false,
        pass: false,
        error: String(err?.message ?? err),
      });
      process.stderr.write(
        `[subsumption-mem] ${caseIdx}/${cases.length} ${c.case_id} (error: ${err?.message})\n`
      );
    }
  }

  const n = results.length;
  const retrievalHitRate = results.filter((r) => r.retrieved_law_hit).length / n;
  const avgHallucinationRate = results.reduce((s, r) => s + r.hallucination_rate, 0) / n;
  const avgKeywordMatchRate = results.reduce((s, r) => s + r.keyword_match_rate, 0) / n;
  const passRate = results.filter((r) => r.pass).length / n;
  const groundedAnswers = results.filter((r) => r.hallucination_rate <= 0.3).length;

  process.stderr.write(`\n[subsumption-mem] RESULTS (${n} cases, jurisdiction=${opts.jurisdiction})\n`);
  process.stderr.write(
    `  Retrieval Hit Rate:     ${(retrievalHitRate * 100).toFixed(1)}%\n` +
    `  Avg Hallucination Rate: ${(avgHallucinationRate * 100).toFixed(1)}%\n` +
    `  Avg Keyword Match:      ${(avgKeywordMatchRate * 100).toFixed(1)}%\n` +
    `  Grounded Answers:       ${groundedAnswers}/${n}\n` +
    `  Pass Rate:              ${(passRate * 100).toFixed(1)}%\n`
  );

  if (opts.outputPath) {
    const report = {
      schema_version: 1,
      benchmark: "subsumption-inmemory",
      total: n,
      jurisdiction: opts.jurisdiction,
      llm_rerank: opts.llmRerank,
      aggregate: {
        retrieval_hit_rate: retrievalHitRate,
        avg_hallucination_rate: avgHallucinationRate,
        avg_keyword_match_rate: avgKeywordMatchRate,
        pass_rate: passRate,
        grounded_answers: groundedAnswers,
      },
      cases: results,
    };
    if (opts.append && existsSync(opts.outputPath)) {
      appendFileSync(opts.outputPath, JSON.stringify(report) + "\n");
    } else {
      writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
    }
    process.stderr.write(`[subsumption-mem] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[subsumption-mem] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
