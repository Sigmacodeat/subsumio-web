/**
 * WP8: E2E Production Benchmark — full pipeline test:
 *   case → analyze (case-analyzer) → retrieve (agentic) → answer (LLM) → fristen
 *
 * Tests the complete Harvey-level pipeline with all WP1-WP6 components:
 *   1. analyzeCaseFacts() extracts legal issues + deadlines from case facts
 *   2. retrieveStatutesForIssues() retrieves relevant statutes via concept-map + hybrid search
 *   3. LLM generates answer using retrieved statutes as context
 *   4. Grounding verification + keyword match
 *   5. Deadline extraction verification
 *
 * Usage:
 *   bun run src/eval/e2e-production/run.ts \
 *     test/fixtures/de-subsumption-expanded.jsonl \
 *     --jurisdiction de \
 *     --output /tmp/e2e-production-de.jsonl
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";

interface E2ECase {
  case_id: string;
  jurisdiction: string;
  facts: string;
  question: string;
  expected_law: string;
  expected_section?: string;
  expected_keywords: string[];
  expected_conclusion: string;
}

interface E2EResult {
  case_id: string;
  jurisdiction: string;
  // Phase 1: Analysis
  analysis_issues_count: number;
  analysis_deadlines_count: number;
  analysis_summary: string;
  // Phase 2: Retrieval
  retrieved_slugs: string[];
  retrieved_law_hit: boolean;
  retrieved_law_rank: number;
  // Phase 3: Answer
  llm_answer: string;
  answer_length: number;
  // Phase 4: Grounding
  grounded_claims: number;
  ungrounded_claims: number;
  hallucination_rate: number;
  // Phase 5: Correctness
  keyword_hits: string[];
  keyword_misses: string[];
  keyword_match_rate: number;
  mentions_expected_law: boolean;
  // Overall
  pass: boolean;
  error?: string;
}

interface E2EReport {
  schema_version: 1;
  benchmark: "e2e-production";
  total: number;
  jurisdiction: string;
  aggregate: {
    analysis_success_rate: number;
    retrieval_hit_rate: number;
    avg_hallucination_rate: number;
    avg_keyword_match_rate: number;
    pass_rate: number;
    grounded_answers: number;
    avg_issues_per_case: number;
    avg_deadlines_per_case: number;
  };
  cases: E2EResult[];
}

interface ParsedArgs {
  fixturePath: string;
  jurisdiction: string;
  outputPath?: string;
  append: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { fixturePath: "", jurisdiction: "de", append: false };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--jurisdiction" && i + 1 < args.length) { out.jurisdiction = args[++i]; continue; }
    if (a === "--output" && i + 1 < args.length) { out.outputPath = args[++i]; continue; }
    if (a === "--append") { out.append = true; continue; }
    if (a === "--limit" && i + 1 < args.length) { out.limit = parseInt(args[++i], 10); continue; }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/e2e-production/run.ts <fixture.jsonl> [options]\n` +
          `  --jurisdiction X  de|at (default: de)\n` +
          `  --output PATH     Write JSONL results to PATH\n` +
          `  --append          Append to output\n` +
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

function loadFixture(path: string): E2ECase[] {
  const raw = readFileSync(path, "utf-8");
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as E2ECase);
}

function extractClaims(answer: string): string[] {
  const sentences = answer.split(/[.!?]\s+/).filter((s) => s.trim().length > 10);
  return sentences.filter((s) =>
    /(?:§|Art\.|Abs\.|BGB|ABGB|StGB|ZPO|HGB|UGB|GmbHG|InsO|IO|UWG|BauGB|DSG|VwGO|AO|BAO|ArbVG|EheG|AVG|GewO|Anspruch|Recht|Pflicht|Vertrag|Schadensersatz|Schadenersatz|Gewährleistung|Verjährung|nichtig|wirksam|zulässig|strafbar|schuldig)/i.test(s)
  );
}

function isClaimGrounded(claim: string, context: string): boolean {
  const claimTerms = claim
    .toLowerCase()
    .match(/[\p{L}]{4,}/gu)
    ?.filter((t) => !["der", "die", "das", "ein", "eine", "ist", "wird", "wurde", "hat", "haben", "nach", "gemäß", "aufgrund", "hinsichtlich", "bezüglich"].includes(t))
    ?? [];
  if (claimTerms.length === 0) return true;
  const contextLower = context.toLowerCase();
  const matchedTerms = claimTerms.filter((t) => contextLower.includes(t));
  return matchedTerms.length / claimTerms.length >= 0.3;
}

async function main() {
  const opts = parseArgs(process.argv);
  let cases = loadFixture(opts.fixturePath);
  if (opts.limit) cases = cases.slice(0, opts.limit);

  process.stderr.write(`[e2e-production] loaded ${cases.length} cases (jurisdiction=${opts.jurisdiction})\n`);
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine, chat } = await import("../../core/ai/gateway.ts");
  const { analyzeAndRetrieve } = await import("../../core/legal/case-analyzer.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json");
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[e2e-production] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try { await reconfigureGatewayWithEngine(engine); } catch {}

  const sourceIds = opts.jurisdiction === "at"
    ? ["law-at", "law-at-judikatur", "law-eu"]
    : ["law-de", "law-eu"];
  const sourceId = opts.jurisdiction === "at" ? "law-at" : "law-de";
  const lawPrefix = opts.jurisdiction === "at" ? `legal/statutes/at/` : `legal/statutes/de/`;

  const results: E2EResult[] = [];
  let caseIdx = 0;

  for (const c of cases) {
    caseIdx++;
    try {
      // Phase 1+2: Analyze case facts → retrieve statutes
      const { analysis, statutes } = await analyzeAndRetrieve(
        `${c.facts} ${c.question}`,
        engine,
        {
          jurisdiction: opts.jurisdiction,
          sourceId,
          sourceIds,
          limit: 20,
        },
      );

      const retrievedSlugs = statutes.map((r) => r.slug);
      const expectedLawPrefix = `${lawPrefix}${c.expected_law}/`;
      const lawRank = retrievedSlugs.findIndex((s) => s.startsWith(expectedLawPrefix));
      const lawHit = lawRank >= 0;

      // Build context from retrieved chunks
      const context = statutes
        .map((r) => {
          const chunkText = (r as any).chunk_text ?? (r as any).content ?? "";
          return `[${r.slug}]\n${chunkText}`;
        })
        .join("\n\n---\n\n");

      // Phase 3: Generate LLM answer
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

      // Phase 4: Grounding verification
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

      // Phase 5: Correctness verification
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

      // Overall pass
      const pass = lawHit && hallucinationRate <= 0.3 && keywordMatchRate >= 0.4;

      const result: E2EResult = {
        case_id: c.case_id,
        jurisdiction: c.jurisdiction,
        analysis_issues_count: analysis.issues.length,
        analysis_deadlines_count: analysis.deadlines.length,
        analysis_summary: analysis.summary,
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
        `[e2e-production] ${caseIdx}/${cases.length} (${Math.round(caseIdx / cases.length * 100)}%) ${status} ${c.case_id} (issues=${analysis.issues.length}, halluc=${(hallucinationRate * 100).toFixed(0)}%, kw=${(keywordMatchRate * 100).toFixed(0)}%, law=${lawHit ? "Y" : "N"})\n`
      );
    } catch (err: any) {
      results.push({
        case_id: c.case_id,
        jurisdiction: c.jurisdiction,
        analysis_issues_count: 0,
        analysis_deadlines_count: 0,
        analysis_summary: "",
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
        `[e2e-production] ${caseIdx}/${cases.length} ${c.case_id} (error: ${err?.message})\n`
      );
    }
  }

  const n = results.length;
  const report: E2EReport = {
    schema_version: 1,
    benchmark: "e2e-production",
    total: n,
    jurisdiction: opts.jurisdiction,
    aggregate: {
      analysis_success_rate: results.filter((r) => r.analysis_issues_count > 0).length / n,
      retrieval_hit_rate: results.filter((r) => r.retrieved_law_hit).length / n,
      avg_hallucination_rate: results.reduce((s, r) => s + r.hallucination_rate, 0) / n,
      avg_keyword_match_rate: results.reduce((s, r) => s + r.keyword_match_rate, 0) / n,
      pass_rate: results.filter((r) => r.pass).length / n,
      grounded_answers: results.filter((r) => r.hallucination_rate <= 0.3).length,
      avg_issues_per_case: results.reduce((s, r) => s + r.analysis_issues_count, 0) / n,
      avg_deadlines_per_case: results.reduce((s, r) => s + r.analysis_deadlines_count, 0) / n,
    },
    cases: results,
  };

  process.stderr.write(`\n[e2e-production] RESULTS (${n} cases, jurisdiction=${opts.jurisdiction})\n`);
  process.stderr.write(
    `  Analysis Success Rate:  ${(report.aggregate.analysis_success_rate * 100).toFixed(1)}%\n` +
    `  Retrieval Hit Rate:     ${(report.aggregate.retrieval_hit_rate * 100).toFixed(1)}%\n` +
    `  Avg Hallucination Rate: ${(report.aggregate.avg_hallucination_rate * 100).toFixed(1)}%\n` +
    `  Avg Keyword Match:      ${(report.aggregate.avg_keyword_match_rate * 100).toFixed(1)}%\n` +
    `  Grounded Answers:       ${report.aggregate.grounded_answers}/${n}\n` +
    `  Avg Issues/Case:        ${report.aggregate.avg_issues_per_case.toFixed(1)}\n` +
    `  Avg Deadlines/Case:     ${report.aggregate.avg_deadlines_per_case.toFixed(1)}\n` +
    `  Pass Rate:              ${(report.aggregate.pass_rate * 100).toFixed(1)}%\n`
  );

  if (opts.outputPath) {
    if (opts.append && existsSync(opts.outputPath)) {
      appendFileSync(opts.outputPath, JSON.stringify(report) + "\n");
    } else {
      writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
    }
    process.stderr.write(`[e2e-production] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[e2e-production] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
