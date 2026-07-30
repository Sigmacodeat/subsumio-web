/**
 * E2E Subsumption Benchmark — tests the full pipeline:
 * 1. Retrieve relevant law chunks via hybridSearch (live engine)
 * 2. Generate LLM answer using retrieved chunks as context
 * 3. Verify grounding: every claim in the answer traces to retrieved law
 * 4. Verify correctness: answer contains expected keywords and mentions expected law
 * 5. Measure hallucination rate: ungrounded claims / total claims
 *
 * Usage:
 *   bun run src/eval/subsumption/run.ts \
 *     test/fixtures/de-subsumption.jsonl \
 *     --jurisdiction de \
 *     --output /tmp/subsumption-de.jsonl
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { evaluateClaims } from "../claim-evaluation.ts";
import type { ChatOpts, ChatResult } from "../lab-dach/rubric-judge.ts";

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

interface ClaimEvalSummary {
  total_claims: number;
  supported_claims: number;
  unsupported_claims: number;
  claim_precision: number;
  misgrounding_rate: number;
  claim_recall: number;
  claim_eval_pass: boolean;
  hallucinated_claim_texts: string[];
}

interface CaseResult {
  case_id: string;
  jurisdiction: string;
  question: string;
  // Retrieval
  retrieved_slugs: string[];
  retrieved_law_hit: boolean;
  retrieved_law_rank: number;
  // LLM answer
  llm_answer: string;
  answer_length: number;
  // Grounding verification (deterministic)
  grounded_claims: number;
  ungrounded_claims: number;
  hallucination_rate: number;
  // LLM-based claim evaluation (optional)
  claim_eval?: ClaimEvalSummary;
  // Correctness
  keyword_hits: string[];
  keyword_misses: string[];
  keyword_match_rate: number;
  mentions_expected_law: boolean;
  // Section + Conclusion evaluation (T2.2 audit)
  expected_section: string;
  section_hit: boolean;
  expected_conclusion: string;
  conclusion_hit: boolean;
  // Overall
  pass: boolean;
  error?: string;
}

interface BenchmarkReport {
  schema_version: 1;
  benchmark: "subsumption";
  total: number;
  jurisdiction: string;
  claim_eval_enabled: boolean;
  aggregate: {
    retrieval_hit_rate: number;
    avg_hallucination_rate: number;
    avg_keyword_match_rate: number;
    pass_rate: number;
    section_hit_rate: number;
    conclusion_hit_rate: number;
    grounded_answers: number;
    // LLM claim-eval aggregates (only if claim_eval enabled)
    avg_claim_precision?: number;
    avg_misgrounding_rate?: number;
    avg_claim_recall?: number;
    claim_eval_pass_rate?: number;
  };
  cases: CaseResult[];
}

// ─── CLI ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  fixturePath: string;
  jurisdiction: string;
  outputPath?: string;
  append: boolean;
  llmRerank: boolean;
  claimEval: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    fixturePath: "",
    jurisdiction: "de",
    append: false,
    llmRerank: false,
    claimEval: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--jurisdiction" && i + 1 < args.length) {
      out.jurisdiction = args[++i];
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
    if (a === "--llm-rerank") {
      out.llmRerank = true;
      continue;
    }
    if (a === "--claim-eval") {
      out.claimEval = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      process.stderr.write(
        `Usage: bun run src/eval/subsumption/run.ts <fixture.jsonl> [options]\n` +
          `  --jurisdiction X  de|at (default: de)\n` +
          `  --output PATH     Write JSONL results to PATH\n` +
          `  --append          Append to output\n` +
          `  --llm-rerank      Enable LLM re-ranker for paragraph-level precision\n` +
          `  --claim-eval      Enable LLM-based claim-level evaluation (precision, recall, misgrounding)\n`
      );
      process.exit(0);
    }
    if (!a.startsWith("--") && !out.fixturePath) {
      out.fixturePath = a;
      continue;
    }
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

// ─── Grounding verification ──────────────────────────────────────────────

/**
 * Extract claims (sentences containing legal assertions) from the LLM answer.
 * A claim is any sentence that contains a § reference, a law name, or
 * a legal conclusion keyword.
 */
function extractClaims(answer: string): string[] {
  const sentences = answer.split(/[.!?]\s+/).filter((s) => s.trim().length > 10);
  return sentences.filter((s) =>
    /(?:§|Art\.|Abs\.|BGB|ABGB|StGB|ZPO|HGB|GmbHG|InsO|UWG|BauGB|DSG|VwGO|AO|ArbVG|EheG|IO|AVG|GewO|Anspruch|Recht|Pflicht|Vertrag|Schadensersatz|Gewährleistung|Verjährung|nichtig|wirksam|zulässig|strafbar|schuldig)/i.test(
      s
    )
  );
}

/**
 * Check if a claim is grounded — i.e., the claim's key terms appear in the
 * retrieved context. This is a deterministic check, not an LLM judgment.
 */
function isClaimGrounded(claim: string, context: string): boolean {
  const claimTerms =
    claim
      .toLowerCase()
      .match(/[\p{L}]{4,}/gu)
      ?.filter(
        (t) =>
          ![
            "der",
            "die",
            "das",
            "ein",
            "eine",
            "ist",
            "wird",
            "wurde",
            "hat",
            "haben",
            "nach",
            "nachstehend",
            "gemäß",
            "aufgrund",
            "hinsichtlich",
            "bezüglich",
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
  const cases = loadFixture(opts.fixturePath);

  process.stderr.write(
    `[subsumption] loaded ${cases.length} cases (jurisdiction=${opts.jurisdiction})\n`
  );
  if (opts.llmRerank) {
    process.stderr.write(`[subsumption] LLM re-ranker: ENABLED (deepseek-chat)\n`);
  }
  process.env.GBRAIN_QUERY_EMBED_TIMEOUT_MS = "30000";

  const { hybridSearch } = await import("../../core/search/hybrid.ts");
  const { loadConfig, toEngineConfig } = await import("../../core/config.ts");
  const { createEngine } = await import("../../core/engine-factory.ts");
  const { buildGatewayConfig } = await import("../../core/ai/build-gateway-config.ts");
  const { configureGateway, reconfigureGatewayWithEngine, chat } =
    await import("../../core/ai/gateway.ts");

  const cfg = loadConfig();
  if (!cfg) throw new Error("No engine configured. Set DATABASE_URL / ~/.gbrain/config.json");
  configureGateway(buildGatewayConfig(cfg));

  process.stderr.write(`[subsumption] connecting to engine...\n`);
  const engine = await createEngine(toEngineConfig(cfg));
  await engine.connect(toEngineConfig(cfg));
  try {
    await reconfigureGatewayWithEngine(engine);
  } catch {}

  const sourceIds =
    opts.jurisdiction === "at" ? ["law-at", "law-at-judikatur", "law-eu"] : ["law-de", "law-eu"];
  const sourceId = opts.jurisdiction === "at" ? "law-at" : "law-de";
  const lawPrefix = opts.jurisdiction === "at" ? `legal/statutes/at/` : `legal/statutes/de/`;

  const results: CaseResult[] = [];
  let caseIdx = 0;

  for (const c of cases) {
    caseIdx++;
    try {
      // Step 1: Retrieve relevant law chunks
      const searchQuery = `${c.facts} ${c.question}`;
      const searchResults = await hybridSearch(engine, searchQuery, {
        limit: 20,
        sourceId,
        sourceIds,
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
      const expectedLawPrefix = `${lawPrefix}${c.expected_law}/`;
      const lawRank = retrievedSlugs.findIndex((s) => s.startsWith(expectedLawPrefix));
      const lawHit = lawRank >= 0;

      // Build context from retrieved chunks
      const context = searchResults
        .map((r) => {
          const chunkText = (r as any).chunk_text ?? (r as any).content ?? "";
          return `[${r.slug}]\n${chunkText}`;
        })
        .join("\n\n---\n\n");

      // Step 2: Generate LLM answer
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

      // Step 3: Grounding verification
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

      // Step 3b: LLM-based claim evaluation (optional)
      let claimEvalSummary: ClaimEvalSummary | undefined;
      if (opts.claimEval) {
        try {
          const chatFn = (copts: ChatOpts): Promise<ChatResult> => chat(copts);
          const expectedClaims = c.expected_keywords.map((k) => `Antwort erwähnt "${k}"`);
          const claimResult = await evaluateClaims({
            answer: llmAnswer,
            context,
            expectedClaims,
            chatFn,
          });
          claimEvalSummary = {
            total_claims: claimResult.metrics.total_claims,
            supported_claims: claimResult.metrics.supported_claims,
            unsupported_claims: claimResult.metrics.unsupported_claims,
            claim_precision: Math.round(claimResult.metrics.claim_precision * 10000) / 10000,
            misgrounding_rate: Math.round(claimResult.metrics.misgrounding_rate * 10000) / 10000,
            claim_recall: Math.round(claimResult.metrics.claim_recall * 10000) / 10000,
            claim_eval_pass: claimResult.metrics.pass,
            hallucinated_claim_texts: claimResult.hallucinated_claims.map((c) =>
              c.text.slice(0, 200)
            ),
          };
        } catch (claimErr: any) {
          process.stderr.write(
            `[subsumption] claim-eval error for ${c.case_id}: ${claimErr?.message}\n`
          );
        }
      }

      // Step 4: Correctness verification
      const answerLower = llmAnswer.toLowerCase();
      const keywordHits: string[] = [];
      const keywordMisses: string[] = [];
      for (const kw of c.expected_keywords) {
        const kwLower = kw.toLowerCase();
        // Partial match: first 6 chars of keyword found in answer (handles compounds)
        const partial = kwLower.length > 6 ? kwLower.slice(0, 6) : kwLower;
        if (answerLower.includes(kwLower) || answerLower.includes(partial)) {
          keywordHits.push(kw);
        } else {
          keywordMisses.push(kw);
        }
      }
      const keywordMatchRate =
        c.expected_keywords.length > 0 ? keywordHits.length / c.expected_keywords.length : 1;
      const mentionsExpectedLaw =
        answerLower.includes(c.expected_law.toLowerCase()) ||
        retrievedSlugs.some((s) => s.startsWith(expectedLawPrefix));

      // Step 4b: Section + Conclusion evaluation (T2.2 audit)
      const sectionNum = (c.expected_section ?? "").replace(/§\s*/, "");
      const sectionHit =
        !c.expected_section ||
        answerLower.includes(c.expected_section.toLowerCase()) ||
        answerLower.includes(`§ ${sectionNum}`) ||
        answerLower.includes(`§${sectionNum}`);
      const conclusionLower = c.expected_conclusion.toLowerCase();
      const conclusionKeyTerms =
        conclusionLower
          .match(/[\p{L}]{4,}/gu)
          ?.filter(
            (t) =>
              ![
                "nach",
                "ist",
                "kann",
                "wird",
                "hat",
                "haben",
                "nicht",
                "auch",
                "sich",
                "wenn",
                "dann",
                "oder",
                "und",
                "als",
                "den",
                "des",
                "dem",
                "der",
                "die",
                "das",
                "ein",
                "eine",
                "einer",
                "eines",
                "einem",
                "mit",
                "zu",
                "von",
                "für",
                "auf",
                "bei",
                "dies",
                "diese",
                "dieser",
                "dieses",
              ].includes(t)
          ) ?? [];
      const conclusionMatchedTerms = conclusionKeyTerms.filter((t) => answerLower.includes(t));
      const conclusionHit =
        conclusionKeyTerms.length > 0 &&
        conclusionMatchedTerms.length / conclusionKeyTerms.length >= 0.5;

      // Step 5: Overall pass
      const pass = lawHit && hallucinationRate <= 0.3 && keywordMatchRate >= 0.4 && sectionHit;

      const result: CaseResult = {
        case_id: c.case_id,
        jurisdiction: c.jurisdiction,
        question: c.question,
        retrieved_slugs: retrievedSlugs.slice(0, 5),
        retrieved_law_hit: lawHit,
        retrieved_law_rank: lawRank + 1,
        llm_answer: llmAnswer,
        answer_length: llmAnswer.length,
        grounded_claims: grounded,
        ungrounded_claims: ungrounded,
        hallucination_rate: hallucinationRate,
        claim_eval: claimEvalSummary,
        keyword_hits: keywordHits,
        keyword_misses: keywordMisses,
        keyword_match_rate: keywordMatchRate,
        mentions_expected_law: mentionsExpectedLaw,
        expected_section: c.expected_section ?? "",
        section_hit: sectionHit,
        expected_conclusion: c.expected_conclusion,
        conclusion_hit: conclusionHit,
        pass,
      };
      results.push(result);

      const status = pass ? "✓ PASS" : "✗ FAIL";
      process.stderr.write(
        `[subsumption] ${caseIdx}/${cases.length} (${Math.round((caseIdx / cases.length) * 100)}%) ${status} ${c.case_id} (halluc=${(hallucinationRate * 100).toFixed(0)}%, kw=${(keywordMatchRate * 100).toFixed(0)}%, law=${lawHit ? "Y" : "N"})\n`
      );
    } catch (err: any) {
      results.push({
        case_id: c.case_id,
        jurisdiction: c.jurisdiction,
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
        expected_section: c.expected_section ?? "",
        section_hit: false,
        expected_conclusion: c.expected_conclusion,
        conclusion_hit: false,
        pass: false,
        error: String(err?.message ?? err),
      });
      process.stderr.write(
        `[subsumption] ${caseIdx}/${cases.length} ${c.case_id} (error: ${err?.message})\n`
      );
    }
  }

  const n = results.length;
  const claimEvalResults = results.filter((r) => r.claim_eval);
  const claimEvalN = claimEvalResults.length;
  const report: BenchmarkReport = {
    schema_version: 1,
    benchmark: "subsumption",
    total: n,
    jurisdiction: opts.jurisdiction,
    claim_eval_enabled: opts.claimEval,
    aggregate: {
      retrieval_hit_rate: results.filter((r) => r.retrieved_law_hit).length / n,
      avg_hallucination_rate: results.reduce((s, r) => s + r.hallucination_rate, 0) / n,
      avg_keyword_match_rate: results.reduce((s, r) => s + r.keyword_match_rate, 0) / n,
      pass_rate: results.filter((r) => r.pass).length / n,
      section_hit_rate: results.filter((r) => r.section_hit).length / n,
      conclusion_hit_rate: results.filter((r) => r.conclusion_hit).length / n,
      grounded_answers: results.filter((r) => r.hallucination_rate <= 0.3).length,
      ...(claimEvalN > 0
        ? {
            avg_claim_precision:
              claimEvalResults.reduce((s, r) => s + (r.claim_eval?.claim_precision ?? 0), 0) /
              claimEvalN,
            avg_misgrounding_rate:
              claimEvalResults.reduce((s, r) => s + (r.claim_eval?.misgrounding_rate ?? 0), 0) /
              claimEvalN,
            avg_claim_recall:
              claimEvalResults.reduce((s, r) => s + (r.claim_eval?.claim_recall ?? 0), 0) /
              claimEvalN,
            claim_eval_pass_rate:
              claimEvalResults.filter((r) => r.claim_eval?.claim_eval_pass).length / claimEvalN,
          }
        : {}),
    },
    cases: results,
  };

  process.stderr.write(`\n[subsumption] RESULTS (${n} cases, jurisdiction=${opts.jurisdiction})\n`);
  process.stderr.write(
    `  Retrieval Hit Rate:     ${(report.aggregate.retrieval_hit_rate * 100).toFixed(1)}%\n` +
      `  Avg Hallucination Rate: ${(report.aggregate.avg_hallucination_rate * 100).toFixed(1)}%\n` +
      `  Avg Keyword Match:      ${(report.aggregate.avg_keyword_match_rate * 100).toFixed(1)}%\n` +
      `  Grounded Answers:       ${report.aggregate.grounded_answers}/${n}\n` +
      `  Section Hit Rate:       ${(report.aggregate.section_hit_rate * 100).toFixed(1)}%\n` +
      `  Conclusion Hit Rate:    ${(report.aggregate.conclusion_hit_rate * 100).toFixed(1)}%\n` +
      `  Pass Rate:              ${(report.aggregate.pass_rate * 100).toFixed(1)}%\n`
  );

  if (opts.claimEval && claimEvalN > 0) {
    process.stderr.write(
      `\n  Claim-Level Evaluation (${claimEvalN} cases):\n` +
        `    Avg Claim Precision:   ${(report.aggregate.avg_claim_precision! * 100).toFixed(1)}%\n` +
        `    Avg Misgrounding Rate: ${(report.aggregate.avg_misgrounding_rate! * 100).toFixed(1)}%\n` +
        `    Avg Claim Recall:      ${(report.aggregate.avg_claim_recall! * 100).toFixed(1)}%\n` +
        `    Claim-Eval Pass Rate:  ${(report.aggregate.claim_eval_pass_rate! * 100).toFixed(1)}%\n`
    );
  }

  if (opts.outputPath) {
    if (opts.append && existsSync(opts.outputPath)) {
      appendFileSync(opts.outputPath, JSON.stringify(report) + "\n");
    } else {
      writeFileSync(opts.outputPath, JSON.stringify(report, null, 2) + "\n");
    }
    process.stderr.write(`[subsumption] output written to ${opts.outputPath}\n`);
  }

  await engine.disconnect();
  process.stderr.write(`[subsumption] done.\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
