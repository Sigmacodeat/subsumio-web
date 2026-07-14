/**
 * LAB-DACH v3 — Component-Level Evaluation
 *
 * Measures four distinct stages SEPARATELY so that failures can be attributed
 * to the specific stage responsible:
 *
 *   STAGE 1 — QUERY-REWRITING: Does the query-planner extract the correct
 *     legal concepts from a layperson's question?
 *
 *   STAGE 2 — RETRIEVAL: Do the 3 search modes (conservative/balanced/tokenmax)
 *     surface the gold §-slugs? Standard hit@k/MRR/purity + Harvey-metric
 *     "Recall@Token-Budget" (% of gold §§ within 4K/12K token payload).
 *
 *   STAGE 3 — ANTWORT (Answer Generation): Rubric-judge score with PERFECT
 *     injected context (gold §§ directly provided) — isolates generation
 *     quality from retrieval issues.
 *
 *   STAGE 4 — ZITATE (Citations): Proportion of verified:true via
 *     groundCitations + fabricated § count (must be 0).
 *
 * Output: one table per stage in report + JSON, so it's visible WHICH stage
 * is responsible for a miss.
 *
 * CI: small fixture subset, mock mode (<60s)
 * Full: CLI with real engine + LLM
 */

import type { ComponentEvalFixture } from "./component-eval-fixtures.ts";
import type { QueryPlan } from "../../core/think/query-planner.ts";
import type { SearchResult } from "../../core/types.ts";
import type { SearchMode } from "../../core/search/mode.ts";
import type { ChatOpts, ChatResult, JudgeConfig } from "./rubric-judge.ts";

// ── Inline citation types (server doesn't import from src/lib/types.ts) ──

export interface RawCitation {
  code?: string;
  paragraph?: string;
  context?: string;
}

export interface GroundedCitation {
  code: string;
  paragraph: string;
  context?: string;
  verified: boolean;
  source_text?: string;
  source_file?: string;
}

// ── Report Types ──────────────────────────────────────────────────────

export interface QueryRewritingResult {
  intent_correct: boolean;
  extracted_laws: string[];
  extracted_sections: string[];
  extracted_terms: string[];
  concept_recall: number;
  concept_precision: number;
  concept_f1: number;
  pass: boolean;
}

export interface RetrievalModeResult {
  hit_at_1: boolean;
  hit_at_3: boolean;
  hit_at_5: boolean;
  hit_at_10: boolean;
  mrr: number;
  purity: number;
  recall_4k: number;
  recall_12k: number;
}

export interface RetrievalResult {
  modes: Record<SearchMode, RetrievalModeResult>;
  truncated: {
    recall_4k: number;
    recall_12k: number;
  };
  pass: boolean;
}

export interface AnswerResult {
  generated_text: string;
  judge_score: number;
  criterion_pass_rate: number;
  judge_details: string[];
  pass: boolean;
}

export interface CitationResult {
  total_citations: number;
  verified_count: number;
  fabricated_count: number;
  verified_ratio: number;
  gold_citation_coverage: number;
  fabricated_must_be_zero: boolean;
  pass: boolean;
}

export interface ComponentEvalReport {
  fixture_id: string;
  jurisdiction: string;
  question: string;
  stages: {
    query_rewriting: QueryRewritingResult;
    retrieval: RetrievalResult;
    answer: AnswerResult;
    citations: CitationResult;
  };
  attribution: {
    failed_stages: string[];
    first_failure: string | null;
  };
  all_pass: boolean;
}

export interface ComponentEvalSummary {
  total_fixtures: number;
  all_pass_count: number;
  all_pass_rate: number;
  stage_pass_rates: {
    query_rewriting: number;
    retrieval: number;
    answer: number;
    citations: number;
  };
  stage_failure_attribution: Record<string, number>;
  reports: ComponentEvalReport[];
}

// ── Options ───────────────────────────────────────────────────────────

export interface ComponentEvalOpts {
  fixtures: ComponentEvalFixture[];
  chatFn?: (opts: ChatOpts) => Promise<ChatResult>;
  judgeConfig?: JudgeConfig;
  searchFn?: (
    query: string,
    mode: SearchMode,
    jurisdiction?: string
  ) => Promise<SearchResult[]>;
  planQueryFn?: (question: string, jurisdiction?: string) => Promise<QueryPlan>;
  groundCitationsFn?: (citations: RawCitation[]) => Promise<GroundedCitation[]>;
}

// ── Token Estimation ──────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Known Law Abbreviations (for extraction from query strings) ───────

const KNOWN_LAW_PATTERN =
  /\b(BGB|ABGB|StGB|ZPO|StPO|UWG|HGB|InsO|AO|EStG|UStG|GewStG|KStG|ErbStG|BewG|GrEStG|GG|BauGB|BDSG|BetrVG|FamFG|GewO|GmbHG|UrhG|VwGO|ZVG|EheG|UGB|EVG|ArbVG|ASVG|AVG|KartG|DSG|BVG)\b/gi;

const SECTION_PATTERN = /§\s*(\d+[a-z]?)/gi;

// ── Stage 1: Query Rewriting ──────────────────────────────────────────

function extractConceptsFromPlan(plan: QueryPlan): {
  laws: string[];
  sections: string[];
  terms: string[];
} {
  const laws = new Set<string>();
  const sections = new Set<string>();
  const terms = new Set<string>();

  for (const sq of plan.sub_queries) {
    const queryText = sq.query;

    let match: RegExpExecArray | null;
    const lawPattern = new RegExp(KNOWN_LAW_PATTERN.source, "gi");
    while ((match = lawPattern.exec(queryText)) !== null) {
      laws.add(match[1].toUpperCase());
    }

    const sectionPattern = new RegExp(SECTION_PATTERN.source, "gi");
    while ((match = sectionPattern.exec(queryText)) !== null) {
      sections.add(match[1]);
    }

    const words = queryText.toLowerCase().split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^\wäöüß-]/g, "");
      if (clean.length > 3) {
        terms.add(clean);
      }
    }
  }

  return {
    laws: [...laws],
    sections: [...sections],
    terms: [...terms],
  };
}

function computeConceptMetrics(
  extracted: { laws: string[]; sections: string[]; terms: string[] },
  gold: { expected_laws: string[]; expected_sections: string[]; expected_terms: string[] },
): { recall: number; precision: number; f1: number } {
  const allGold = [
    ...gold.expected_laws.map((l) => l.toUpperCase()),
    ...gold.expected_sections.map((s) => s.toLowerCase()),
    ...gold.expected_terms.map((t) => t.toLowerCase()),
  ];
  const allExtracted = [
    ...extracted.laws.map((l) => l.toUpperCase()),
    ...extracted.sections.map((s) => s.toLowerCase()),
    ...extracted.terms.map((t) => t.toLowerCase()),
  ];

  const goldSet = new Set(allGold);
  const extractedSet = new Set(allExtracted);

  let hits = 0;
  for (const g of goldSet) {
    if (extractedSet.has(g)) hits++;
  }

  const recall = goldSet.size > 0 ? hits / goldSet.size : 1.0;
  const precision = extractedSet.size > 0 ? hits / extractedSet.size : 1.0;
  const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0.0;

  return { recall, precision, f1 };
}

export async function evalQueryRewriting(
  fixture: ComponentEvalFixture,
  opts: ComponentEvalOpts,
): Promise<QueryRewritingResult> {
  let plan: QueryPlan;

  if (opts.planQueryFn) {
    plan = await opts.planQueryFn(fixture.question, fixture.jurisdiction);
  } else {
    plan = mockPlan(fixture);
  }

  const extracted = extractConceptsFromPlan(plan);
  const metrics = computeConceptMetrics(extracted, fixture.gold_concepts);
  const intentCorrect = plan.intent === fixture.gold_concepts.intent;

  const pass = intentCorrect && metrics.f1 >= 0.3;

  return {
    intent_correct: intentCorrect,
    extracted_laws: extracted.laws,
    extracted_sections: extracted.sections,
    extracted_terms: extracted.terms,
    concept_recall: metrics.recall,
    concept_precision: metrics.precision,
    concept_f1: metrics.f1,
    pass,
  };
}

function mockPlan(fixture: ComponentEvalFixture): QueryPlan {
  const gold = fixture.gold_concepts;
  const queryParts: string[] = [fixture.question];
  for (const law of gold.expected_laws) {
    queryParts.push(law);
  }
  for (const sec of gold.expected_sections) {
    queryParts.push(`§ ${sec}`);
  }
  for (const term of gold.expected_terms.slice(0, 3)) {
    queryParts.push(term);
  }

  return {
    intent: gold.intent,
    sub_queries: [
      {
        query: queryParts.join(" "),
        source_type: "statutes",
        jurisdiction: fixture.jurisdiction,
      },
    ],
    decomposed: false,
  };
}

// ── Stage 2: Retrieval ────────────────────────────────────────────────

function slugMatches(resultSlug: string, goldSlug: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\/+/g, "/");
  const r = norm(resultSlug);
  const g = norm(goldSlug);
  return r === g || r.startsWith(g) || g.startsWith(r);
}

function computeHitMetrics(
  results: SearchResult[],
  goldSlugs: string[],
): { hit_at_1: boolean; hit_at_3: boolean; hit_at_5: boolean; hit_at_10: boolean; mrr: number; purity: number } {
  const slugs = results.map((r) => r.slug);

  const findFirstHit = (k: number): number => {
    for (let i = 0; i < Math.min(k, slugs.length); i++) {
      for (const g of goldSlugs) {
        if (slugMatches(slugs[i], g)) return i + 1;
      }
    }
    return 0;
  };

  const hit1 = findFirstHit(1) > 0;
  const hit3 = findFirstHit(3) > 0;
  const hit5 = findFirstHit(5) > 0;
  const hit10 = findFirstHit(10) > 0;

  const firstRank = findFirstHit(slugs.length);
  const mrr = firstRank > 0 ? 1 / firstRank : 0;

  const topK = Math.min(5, slugs.length);
  let goldInTopK = 0;
  for (let i = 0; i < topK; i++) {
    for (const g of goldSlugs) {
      if (slugMatches(slugs[i], g)) {
        goldInTopK++;
        break;
      }
    }
  }
  const purity = topK > 0 ? goldInTopK / topK : 0;

  return { hit_at_1: hit1, hit_at_3: hit3, hit_at_5: hit5, hit_at_10: hit10, mrr, purity };
}

function computeRecallAtTokenBudget(
  results: SearchResult[],
  goldSlugs: string[],
  tokenBudget: number,
): number {
  if (goldSlugs.length === 0) return 1.0;

  let cumulativeTokens = 0;
  const goldFound = new Set<number>();

  for (const r of results) {
    const tokens = estimateTokens(r.chunk_text || "");
    if (cumulativeTokens + tokens > tokenBudget) break;
    cumulativeTokens += tokens;

    for (let i = 0; i < goldSlugs.length; i++) {
      if (!goldFound.has(i) && slugMatches(r.slug, goldSlugs[i])) {
        goldFound.add(i);
      }
    }
  }

  return goldFound.size / goldSlugs.length;
}

function buildModeResult(results: SearchResult[], goldSlugs: string[]): RetrievalModeResult {
  const hit = computeHitMetrics(results, goldSlugs);
  const recall4k = computeRecallAtTokenBudget(results, goldSlugs, 4000);
  const recall12k = computeRecallAtTokenBudget(results, goldSlugs, 12000);

  return {
    hit_at_1: hit.hit_at_1,
    hit_at_3: hit.hit_at_3,
    hit_at_5: hit.hit_at_5,
    hit_at_10: hit.hit_at_10,
    mrr: hit.mrr,
    purity: hit.purity,
    recall_4k: recall4k,
    recall_12k: recall12k,
  };
}

export async function evalRetrieval(
  fixture: ComponentEvalFixture,
  opts: ComponentEvalOpts,
): Promise<RetrievalResult> {
  const modes: SearchMode[] = ["conservative", "balanced", "tokenmax"];
  const modeResults = {} as Record<SearchMode, RetrievalModeResult>;

  let tokenmaxResults: SearchResult[] = [];

  for (const mode of modes) {
    let results: SearchResult[];

    if (opts.searchFn) {
      results = await opts.searchFn(fixture.question, mode, fixture.jurisdiction);
    } else {
      results = mockSearchResults(fixture, mode);
    }

    if (mode === "tokenmax") {
      tokenmaxResults = results;
    }

    modeResults[mode] = buildModeResult(results, fixture.gold_slugs);
  }

  const truncatedRecall4k = computeRecallAtTokenBudget(tokenmaxResults, fixture.gold_slugs, 4000);
  const truncatedRecall12k = computeRecallAtTokenBudget(tokenmaxResults, fixture.gold_slugs, 12000);

  const pass = modeResults.balanced.hit_at_5 && modeResults.balanced.recall_12k >= 0.5;

  return {
    modes: modeResults,
    truncated: {
      recall_4k: truncatedRecall4k,
      recall_12k: truncatedRecall12k,
    },
    pass,
  };
}

function mockSearchResults(fixture: ComponentEvalFixture, _mode: SearchMode): SearchResult[] {
  return fixture.gold_slugs.map((slug, i) => ({
    slug,
    page_id: i + 1,
    title: `§ ${fixture.gold_citations[i]?.paragraph ?? "??"} ${fixture.gold_citations[i]?.code ?? ""}`,
    type: "source",
    chunk_text: fixture.gold_context.slice(i * 200, (i + 1) * 400) || fixture.gold_context,
    chunk_source: "compiled_truth" as const,
    chunk_id: i + 1,
    chunk_index: 0,
    score: 1 - i * 0.1,
    stale: false,
  }));
}

// ── Stage 3: Answer Generation (Perfect Context) ──────────────────────

const LEGAL_SYSTEM_PROMPT = `Du bist ein juristischer Assistent. Beantworte die Rechtsfrage auf Basis des bereitgestellten Kontexts.
Zitiere die relevanten Paragraphen mit §-Angabe und Gesetzesbezeichnung.
Antworte präzise und juristisch korrekt auf Deutsch.`;

const JUDGE_CRITERIA = [
  {
    id: "answer-legal-correctness",
    description: "Die Antwort gibt die juristisch korrekte Lösung auf Basis des Kontexts wieder.",
    question: "Ist die rechtliche Einschätzung korrekt und vollständig?",
  },
  {
    id: "answer-citation-completeness",
    description: "Die Antwort zitiert alle relevanten §§ aus dem Kontext.",
    question: "Werden alle maßgeblichen Paragraphen zitiert?",
  },
  {
    id: "answer-structure",
    description: "Die Antwort ist klar strukturiert und verständlich.",
    question: "Ist die Antwort gut strukturiert und für den Ratsuchenden verständlich?",
  },
];

export async function evalAnswer(
  fixture: ComponentEvalFixture,
  opts: ComponentEvalOpts,
): Promise<AnswerResult> {
  let generatedText: string;

  if (opts.chatFn) {
    const userPrompt = `## Rechtsfrage\n${fixture.question}\n\n## Kontext\n${fixture.gold_context}`;
    const result = await opts.chatFn({
      system: LEGAL_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2048,
      temperature: 0,
    });
    generatedText = result.text;
  } else {
    generatedText = mockAnswer(fixture);
  }

  let judgeScore = 0;
  let criterionPassRate = 0;
  let judgeDetails: string[] = [];

  if (!opts.chatFn || !opts.judgeConfig) {
    judgeScore = 8.5;
    criterionPassRate = 1.0;
    judgeDetails = ["Mock: Antwort entspricht Gold-Standard"];
  } else {
    const verdicts: boolean[] = [];
    for (const criterion of JUDGE_CRITERIA) {
      const judgePrompt = `## Kriterium\n${criterion.description}\nFrage: ${criterion.question}\n\n## Kontext\n${fixture.gold_context.slice(0, 4000)}\n\n## Antwort\n${generatedText.slice(0, 4000)}\n\nBewerte: pass oder fail? Antworte als JSON: {"status":"pass"|"fail","reasoning":"..."}`;
      try {
        const judgeResult = await opts.chatFn({
          system: "Du bist ein strenger rechtlicher Gutachter. Bewerte ein einzelnes Kriterium.",
          messages: [{ role: "user", content: judgePrompt }],
          maxTokens: 512,
          temperature: 0,
          responseFormat: { type: "json_object" },
        });
        const parsed = JSON.parse(judgeResult.text);
        const passed = parsed.status === "pass";
        verdicts.push(passed);
        judgeDetails.push(`${criterion.id}: ${parsed.status} — ${parsed.reasoning?.slice(0, 200) ?? ""}`);
      } catch {
        verdicts.push(false);
        judgeDetails.push(`${criterion.id}: judge_error`);
      }
    }
    judgeScore = (verdicts.filter(Boolean).length / verdicts.length) * 10;
    criterionPassRate = verdicts.filter(Boolean).length / verdicts.length;
  }

  const pass = judgeScore >= 6.0 && criterionPassRate >= 0.6;

  return {
    generated_text: generatedText,
    judge_score: judgeScore,
    criterion_pass_rate: criterionPassRate,
    judge_details: judgeDetails,
    pass,
  };
}

function mockAnswer(fixture: ComponentEvalFixture): string {
  const cites = fixture.gold_citations
    .map((c) => `§ ${c.paragraph} ${c.code}`)
    .join(", ");
  return `Auf Basis der gesetzlichen Bestimmungen (${cites}) lässt sich Ihre Frage wie folgt beantworten:

Die relevanten Vorschriften regeln die Rechte und Pflichten in Ihrem Fall. Gemäß ${cites} können Sie die dort vorgesehenen Maßnahmen ergreifen.

**Zusammenfassung:** Die rechtliche Situation ist durch die genannten Paragrafen klar geregelt. Es empfiehlt sich, die entsprechenden Ansprüche geltend zu machen.`;
}

// ── Stage 4: Citations ────────────────────────────────────────────────

export async function evalCitations(
  fixture: ComponentEvalFixture,
  answerText: string,
  opts: ComponentEvalOpts,
): Promise<CitationResult> {
  let grounded: GroundedCitation[];

  if (opts.groundCitationsFn) {
    const rawCitations = extractCitationsFromText(answerText);
    grounded = await opts.groundCitationsFn(rawCitations);
  } else {
    grounded = mockGroundCitations(fixture);
  }

  const totalCitations = grounded.length;
  const verifiedCount = grounded.filter((g) => g.verified).length;
  const verifiedRatio = totalCitations > 0 ? verifiedCount / totalCitations : 1.0;

  const goldSet = new Set(
    fixture.gold_citations.map((c) => `${c.code.toUpperCase()}§${c.paragraph}`),
  );
  const fabricated = grounded.filter(
    (g) => !g.verified && !goldSet.has(`${g.code.toUpperCase()}§${g.paragraph}`),
  );
  const fabricatedCount = fabricated.length;

  const goldFound = fixture.gold_citations.filter((gc) =>
    grounded.some(
      (g) =>
        g.code.toUpperCase() === gc.code.toUpperCase() &&
        g.paragraph === gc.paragraph,
    ),
  );
  const goldCitationCoverage =
    fixture.gold_citations.length > 0
      ? goldFound.length / fixture.gold_citations.length
      : 1.0;

  const fabricatedMustBeZero = fabricatedCount === 0;
  const pass = fabricatedMustBeZero && verifiedRatio >= 0.8 && goldCitationCoverage >= 0.5;

  return {
    total_citations: totalCitations,
    verified_count: verifiedCount,
    fabricated_count: fabricatedCount,
    verified_ratio: verifiedRatio,
    gold_citation_coverage: goldCitationCoverage,
    fabricated_must_be_zero: fabricatedMustBeZero,
    pass,
  };
}

function extractCitationsFromText(text: string): RawCitation[] {
  const citations: RawCitation[] = [];
  const seen = new Set<string>();

  const pattern = /§\s*(\d+[a-z]?)\s*(BGB|ABGB|StGB|ZPO|StPO|UWG|HGB|InsO|AO|EStG|UStG|GewStG|KStG|ErbStG|BewG|GrEStG|GG|BauGB|BDSG|BetrVG|FamFG|GewO|GmbHG|UrhG|VwGO|ZVG|EheG|UGB|EVG|ArbVG|ASVG|AVG|KartG|DSG|BVG)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const paragraph = match[1];
    const code = match[2];
    const key = `${code}§${paragraph}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({ code, paragraph, context: text.slice(Math.max(0, match.index - 50), match.index + 100) });
    }
  }

  return citations;
}

function mockGroundCitations(fixture: ComponentEvalFixture): GroundedCitation[] {
  return fixture.gold_citations.map((c) => ({
    code: c.code,
    paragraph: c.paragraph,
    verified: true,
    source_text: fixture.gold_context.slice(0, 200),
  }));
}

// ── Attribution ───────────────────────────────────────────────────────

function computeAttribution(
  queryResult: QueryRewritingResult,
  retrievalResult: RetrievalResult,
  answerResult: AnswerResult,
  citationResult: CitationResult,
): { failed_stages: string[]; first_failure: string | null } {
  const failed: string[] = [];
  if (!queryResult.pass) failed.push("query_rewriting");
  if (!retrievalResult.pass) failed.push("retrieval");
  if (!answerResult.pass) failed.push("answer");
  if (!citationResult.pass) failed.push("citations");

  return {
    failed_stages: failed,
    first_failure: failed.length > 0 ? failed[0] : null,
  };
}

// ── Main Runner ───────────────────────────────────────────────────────

export async function runComponentEval(
  opts: ComponentEvalOpts,
): Promise<ComponentEvalSummary> {
  const reports: ComponentEvalReport[] = [];

  for (const fixture of opts.fixtures) {
    const queryRewriting = await evalQueryRewriting(fixture, opts);
    const retrieval = await evalRetrieval(fixture, opts);
    const answer = await evalAnswer(fixture, opts);
    const citations = await evalCitations(fixture, answer.generated_text, opts);

    const attribution = computeAttribution(queryRewriting, retrieval, answer, citations);
    const allPass = attribution.failed_stages.length === 0;

    reports.push({
      fixture_id: fixture.id,
      jurisdiction: fixture.jurisdiction,
      question: fixture.question,
      stages: {
        query_rewriting: queryRewriting,
        retrieval,
        answer,
        citations,
      },
      attribution,
      all_pass: allPass,
    });
  }

  const totalFixtures = reports.length;
  const allPassCount = reports.filter((r) => r.all_pass).length;

  const stagePassRates = {
    query_rewriting: reports.filter((r) => r.stages.query_rewriting.pass).length / Math.max(totalFixtures, 1),
    retrieval: reports.filter((r) => r.stages.retrieval.pass).length / Math.max(totalFixtures, 1),
    answer: reports.filter((r) => r.stages.answer.pass).length / Math.max(totalFixtures, 1),
    citations: reports.filter((r) => r.stages.citations.pass).length / Math.max(totalFixtures, 1),
  };

  const stageFailureAttribution: Record<string, number> = {};
  for (const r of reports) {
    for (const stage of r.attribution.failed_stages) {
      stageFailureAttribution[stage] = (stageFailureAttribution[stage] ?? 0) + 1;
    }
  }

  return {
    total_fixtures: totalFixtures,
    all_pass_count: allPassCount,
    all_pass_rate: totalFixtures > 0 ? allPassCount / totalFixtures : 0,
    stage_pass_rates: stagePassRates,
    stage_failure_attribution: stageFailureAttribution,
    reports,
  };
}

// ── Report Formatting ─────────────────────────────────────────────────

export function formatReportTable(summary: ComponentEvalSummary): string {
  const lines: string[] = [];

  lines.push("# Component Evaluation Report");
  lines.push("");
  lines.push(`**Fixtures:** ${summary.total_fixtures} | **All-Pass:** ${summary.all_pass_count}/${summary.total_fixtures} (${(summary.all_pass_rate * 100).toFixed(1)}%)`);
  lines.push("");

  // ── Stage Pass Rates ──
  lines.push("## Stage Pass Rates");
  lines.push("");
  lines.push("| Stage | Pass Rate |");
  lines.push("|-------|-----------|");
  lines.push(`| Query Rewriting | ${(summary.stage_pass_rates.query_rewriting * 100).toFixed(1)}% |`);
  lines.push(`| Retrieval | ${(summary.stage_pass_rates.retrieval * 100).toFixed(1)}% |`);
  lines.push(`| Answer | ${(summary.stage_pass_rates.answer * 100).toFixed(1)}% |`);
  lines.push(`| Citations | ${(summary.stage_pass_rates.citations * 100).toFixed(1)}% |`);
  lines.push("");

  // ── Failure Attribution ──
  lines.push("## Failure Attribution");
  lines.push("");
  lines.push("| Stage | Failure Count |");
  lines.push("|-------|--------------|");
  for (const [stage, count] of Object.entries(summary.stage_failure_attribution)) {
    lines.push(`| ${stage} | ${count} |`);
  }
  if (Object.keys(summary.stage_failure_attribution).length === 0) {
    lines.push("| (none) | 0 |");
  }
  lines.push("");

  // ── Stage 1: Query Rewriting ──
  lines.push("## Stage 1: Query Rewriting");
  lines.push("");
  lines.push("| Fixture | Intent | Concept Recall | Concept Precision | F1 | Pass |");
  lines.push("|---------|--------|---------------|-------------------|----|------|");
  for (const r of summary.reports) {
    const s = r.stages.query_rewriting;
    lines.push(`| ${r.fixture_id} | ${s.intent_correct ? "Y" : "N"} | ${(s.concept_recall * 100).toFixed(0)}% | ${(s.concept_precision * 100).toFixed(0)}% | ${s.concept_f1.toFixed(2)} | ${s.pass ? "Y" : "N"} |`);
  }
  lines.push("");

  // ── Stage 2: Retrieval ──
  lines.push("## Stage 2: Retrieval");
  lines.push("");
  lines.push("### Per-Mode Results (balanced)");
  lines.push("");
  lines.push("| Fixture | Hit@1 | Hit@5 | MRR | Recall@4K | Recall@12K | Pass |");
  lines.push("|---------|-------|-------|-----|----------|-----------|------|");
  for (const r of summary.reports) {
    const s = r.stages.retrieval.modes.balanced;
    lines.push(`| ${r.fixture_id} | ${s.hit_at_1 ? "Y" : "N"} | ${s.hit_at_5 ? "Y" : "N"} | ${s.mrr.toFixed(2)} | ${(s.recall_4k * 100).toFixed(0)}% | ${(s.recall_12k * 100).toFixed(0)}% | ${r.stages.retrieval.pass ? "Y" : "N"} |`);
  }
  lines.push("");

  lines.push("### Truncated (tokenmax, token-budget simulation)");
  lines.push("");
  lines.push("| Fixture | Recall@4K (trunc) | Recall@12K (trunc) |");
  lines.push("|---------|------------------|--------------------|");
  for (const r of summary.reports) {
    const t = r.stages.retrieval.truncated;
    lines.push(`| ${r.fixture_id} | ${(t.recall_4k * 100).toFixed(0)}% | ${(t.recall_12k * 100).toFixed(0)}% |`);
  }
  lines.push("");

  // ── Stage 3: Answer ──
  lines.push("## Stage 3: Answer Generation (Perfect Context)");
  lines.push("");
  lines.push("| Fixture | Judge Score | Pass Rate | Pass |");
  lines.push("|---------|------------|-----------|------|");
  for (const r of summary.reports) {
    const s = r.stages.answer;
    lines.push(`| ${r.fixture_id} | ${s.judge_score.toFixed(1)}/10 | ${(s.criterion_pass_rate * 100).toFixed(0)}% | ${s.pass ? "Y" : "N"} |`);
  }
  lines.push("");

  // ── Stage 4: Citations ──
  lines.push("## Stage 4: Citations");
  lines.push("");
  lines.push("| Fixture | Total | Verified | Fabricated | Verified% | Gold Coverage | Pass |");
  lines.push("|---------|-------|----------|------------|----------|--------------|------|");
  for (const r of summary.reports) {
    const s = r.stages.citations;
    lines.push(`| ${r.fixture_id} | ${s.total_citations} | ${s.verified_count} | ${s.fabricated_count} | ${(s.verified_ratio * 100).toFixed(0)}% | ${(s.gold_citation_coverage * 100).toFixed(0)}% | ${s.pass ? "Y" : "N"} |`);
  }
  lines.push("");

  // ── Attribution Summary ──
  lines.push("## Attribution Summary");
  lines.push("");
  lines.push("| Fixture | Failed Stages | First Failure | All Pass |");
  lines.push("|---------|--------------|---------------|----------|");
  for (const r of summary.reports) {
    lines.push(`| ${r.fixture_id} | ${r.attribution.failed_stages.join(", ") || "-"} | ${r.attribution.first_failure ?? "-"} | ${r.all_pass ? "Y" : "N"} |`);
  }
  lines.push("");

  return lines.join("\n");
}
