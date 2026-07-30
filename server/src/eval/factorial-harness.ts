/**
 * Full Factorial Evaluation Harness
 *
 * Systematically tests every combination of embedding models × LLM models
 * against a fixed set of legal questions, producing a comparison matrix.
 *
 * This enables data-driven model selection:
 * - Which embedding model gives best retrieval?
 * - Which LLM gives best answer quality?
 * - Is there interaction between embedding and LLM choices?
 *
 * Usage:
 *   bun run src/eval/factorial-harness.ts [--embeddings model1,model2] [--llms model1,model2] [--limit 10]
 */

import { writeFileSync } from "fs";

// ── Types ─────────────────────────────────────────────────────────────

export interface FactorialQuestion {
  id: string;
  jurisdiction: "DE" | "AT" | "CH" | "EU";
  question: string;
  expected_slugs: string[];
  expected_keywords: string[];
}

export interface FactorialConfig {
  embedding_model: string;
  llm_model: string;
  rerank_enabled: boolean;
}

export interface FactorialCellResult {
  config: FactorialConfig;
  questions: Array<{
    question_id: string;
    hit_at_1: boolean;
    hit_at_5: boolean;
    mrr: number;
    answer_keywords_hit: number;
    answer_keywords_total: number;
    latency_ms: number;
    error?: string;
  }>;
  aggregate: {
    hit_at_1_rate: number;
    hit_at_5_rate: number;
    mean_mrr: number;
    keyword_coverage: number;
    avg_latency_ms: number;
    error_count: number;
  };
}

export interface FactorialReport {
  embeddings: string[];
  llms: string[];
  rerank_options: boolean[];
  total_cells: number;
  cells: FactorialCellResult[];
  matrix: Record<
    string,
    Record<
      string,
      {
        hit_at_5: number;
        mrr: number;
        keyword_coverage: number;
      }
    >
  >;
  best_combination: FactorialConfig | null;
}

// ── Default Question Set ──────────────────────────────────────────────

export const FACTORIAL_QUESTIONS: FactorialQuestion[] = [
  {
    id: "fact-de-001",
    jurisdiction: "DE",
    question: "Was regelt § 823 BGB?",
    expected_slugs: ["legal/statutes/de/bgb/p-823"],
    expected_keywords: ["Schadensersatz", "vorsätzlich", "fahrlässig", "Rechtsgut"],
  },
  {
    id: "fact-de-002",
    jurisdiction: "DE",
    question: "Wie lange ist die regelmäßige Verjährungsfrist?",
    expected_slugs: ["legal/statutes/de/bgb/p-195"],
    expected_keywords: ["drei Jahre", "Verjährung", "Jahresende"],
  },
  {
    id: "fact-de-003",
    jurisdiction: "DE",
    question: "Welche Gewährleistungsrechte hat der Käufer?",
    expected_slugs: ["legal/statutes/de/bgb/p-437"],
    expected_keywords: ["Nacherfüllung", "Rücktritt", "Minderung", "Schadensersatz"],
  },
  {
    id: "fact-de-004",
    jurisdiction: "DE",
    question: "Wann ist ein Diebstahl vollendet?",
    expected_slugs: ["legal/statutes/de/stgb/p-242"],
    expected_keywords: ["Gewahrsam", "Zueignungsabsicht", "wegnehmen"],
  },
  {
    id: "fact-de-005",
    jurisdiction: "DE",
    question: "Wie lange habe ich für die Steuererklärung Zeit?",
    expected_slugs: ["legal/statutes/de/ao/p-149"],
    expected_keywords: ["Abgabefrist", "Steuererklärung"],
  },
  {
    id: "fact-at-001",
    jurisdiction: "AT",
    question: "Was regelt § 823 ABGB?",
    expected_slugs: ["legal/statutes/at/abgb/p-823"],
    expected_keywords: ["Schadensersatz", "Verschulden"],
  },
  {
    id: "fact-at-002",
    jurisdiction: "AT",
    question: "Wie lange ist die Berufungsfrist in Zivilsachen?",
    expected_slugs: ["legal/statutes/at/zpo/p-514"],
    expected_keywords: ["Berufung", "vier Wochen"],
  },
  {
    id: "fact-ch-001",
    jurisdiction: "CH",
    question: "Was regelt Art. 41 OR?",
    expected_slugs: ["legal/statutes/ch/or/art-41"],
    expected_keywords: ["Schadensersatz", "unerlaubte Handlung"],
  },
  {
    id: "fact-eu-001",
    jurisdiction: "EU",
    question: "Bis wann muss eine Datenpanne gemeldet werden?",
    expected_slugs: ["legal/statutes/eu/dsgvo/art-33"],
    expected_keywords: ["72 Stunden", "Meldepflicht", "Datenpanne"],
  },
  {
    id: "fact-eu-002",
    jurisdiction: "EU",
    question: "Welche Rechte hat die betroffene Person bei Auskunftsersuchen?",
    expected_slugs: ["legal/statutes/eu/dsgvo/art-15"],
    expected_keywords: ["Auskunft", "betroffene Person", "einen Monat"],
  },
];

// ── Default Model Combinations ────────────────────────────────────────

export const DEFAULT_EMBEDDINGS = [
  "openrouter:openai/text-embedding-3-small",
  "openrouter:openai/text-embedding-3-large",
];

export const DEFAULT_LLMS = [
  "openrouter:deepseek/deepseek-chat",
  "openrouter:anthropic/claude-3.5-sonnet",
];

// ── Search & Answer Function Interfaces ───────────────────────────────

export interface FactorialSearchFn {
  (
    query: string,
    opts: {
      embeddingModel: string;
      jurisdiction: string;
      rerank: boolean;
      topK: number;
    }
  ): Promise<{
    slugs: string[];
    latency_ms: number;
  }>;
}

export interface FactorialAnswerFn {
  (
    question: string,
    context: string,
    opts: {
      llmModel: string;
    }
  ): Promise<{
    answer: string;
    latency_ms: number;
  }>;
}

// ── Runner ────────────────────────────────────────────────────────────

export async function runFactorialEval(
  questions: FactorialQuestion[],
  embeddings: string[],
  llms: string[],
  rerankOptions: boolean[],
  searchFn: FactorialSearchFn,
  answerFn: FactorialAnswerFn,
  onProgress?: (cell: number, total: number, config: FactorialConfig) => void
): Promise<FactorialReport> {
  const configs: FactorialConfig[] = [];
  for (const emb of embeddings) {
    for (const llm of llms) {
      for (const rerank of rerankOptions) {
        configs.push({ embedding_model: emb, llm_model: llm, rerank_enabled: rerank });
      }
    }
  }

  const cells: FactorialCellResult[] = [];

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    onProgress?.(i + 1, configs.length, config);

    const cellResult = await runSingleCell(questions, config, searchFn, answerFn);
    cells.push(cellResult);
  }

  return buildFactorialReport(embeddings, llms, rerankOptions, cells);
}

async function runSingleCell(
  questions: FactorialQuestion[],
  config: FactorialConfig,
  searchFn: FactorialSearchFn,
  answerFn: FactorialAnswerFn
): Promise<FactorialCellResult> {
  const questionResults: FactorialCellResult["questions"] = [];

  for (const q of questions) {
    let error: string | undefined;
    let slugs: string[] = [];
    let searchLatency = 0;
    let answer = "";
    let answerLatency = 0;

    try {
      const searchResult = await searchFn(q.question, {
        embeddingModel: config.embedding_model,
        jurisdiction: q.jurisdiction.toLowerCase(),
        rerank: config.rerank_enabled,
        topK: 8,
      });
      slugs = searchResult.slugs;
      searchLatency = searchResult.latency_ms;

      const answerResult = await answerFn(q.question, slugs.join("\n"), {
        llmModel: config.llm_model,
      });
      answer = answerResult.answer;
      answerLatency = answerResult.latency_ms;
    } catch (err) {
      error = String((err as Error)?.message ?? err);
    }

    const hitAt1 = !error && q.expected_slugs.length > 0 && slugs[0] === q.expected_slugs[0];
    const hitAt5 =
      !error &&
      q.expected_slugs.length > 0 &&
      q.expected_slugs.some((s) => slugs.slice(0, 5).includes(s));
    const mrr = !error && hitAt5 ? 1 / (slugs.indexOf(q.expected_slugs[0]) + 1) : 0;

    const answerLower = answer.toLowerCase();
    const keywordHits = q.expected_keywords.filter((kw) =>
      answerLower.includes(kw.toLowerCase())
    ).length;

    questionResults.push({
      question_id: q.id,
      hit_at_1: hitAt1,
      hit_at_5: hitAt5,
      mrr,
      answer_keywords_hit: keywordHits,
      answer_keywords_total: q.expected_keywords.length,
      latency_ms: searchLatency + answerLatency,
      error,
    });
  }

  const n = questions.length;
  const validResults = questionResults.filter((r) => !r.error);
  const validN = validResults.length || 1;

  return {
    config,
    questions: questionResults,
    aggregate: {
      hit_at_1_rate: validResults.filter((r) => r.hit_at_1).length / validN,
      hit_at_5_rate: validResults.filter((r) => r.hit_at_5).length / validN,
      mean_mrr: validResults.reduce((s, r) => s + r.mrr, 0) / validN,
      keyword_coverage:
        validResults.reduce(
          (s, r) => s + r.answer_keywords_hit / Math.max(r.answer_keywords_total, 1),
          0
        ) / validN,
      avg_latency_ms: validResults.reduce((s, r) => s + r.latency_ms, 0) / validN,
      error_count: questionResults.length - validResults.length,
    },
  };
}

function buildFactorialReport(
  embeddings: string[],
  llms: string[],
  rerankOptions: boolean[],
  cells: FactorialCellResult[]
): FactorialReport {
  // Build matrix: embedding → llm → best Hit@5 (across rerank options)
  const matrix: FactorialReport["matrix"] = {};
  for (const emb of embeddings) {
    matrix[emb] = {};
    for (const llm of llms) {
      const matching = cells.filter(
        (c) => c.config.embedding_model === emb && c.config.llm_model === llm
      );
      if (matching.length === 0) continue;
      const best = matching.reduce((best, c) =>
        c.aggregate.hit_at_5_rate > best.aggregate.hit_at_5_rate ? c : best
      );
      matrix[emb][llm] = {
        hit_at_5: best.aggregate.hit_at_5_rate,
        mrr: best.aggregate.mean_mrr,
        keyword_coverage: best.aggregate.keyword_coverage,
      };
    }
  }

  // Find best combination
  let bestCell: FactorialCellResult | null = null;
  for (const cell of cells) {
    if (!bestCell || cell.aggregate.hit_at_5_rate > bestCell.aggregate.hit_at_5_rate) {
      bestCell = cell;
    }
  }

  return {
    embeddings,
    llms,
    rerank_options: rerankOptions,
    total_cells: cells.length,
    cells,
    matrix,
    best_combination: bestCell?.config ?? null,
  };
}

// ── Report Formatter ──────────────────────────────────────────────────

export function formatFactorialReport(report: FactorialReport): string {
  const lines: string[] = [];
  lines.push("=== Full Factorial Evaluation Report ===");
  lines.push("");
  lines.push(`Embedding models: ${report.embeddings.length}`);
  lines.push(`LLM models: ${report.llms.length}`);
  lines.push(`Rerank options: ${report.rerank_options.length}`);
  lines.push(`Total cells: ${report.total_cells}`);
  lines.push("");

  // Matrix table
  lines.push("--- Hit@5 Matrix ---");
  const header = "Embedding \\ LLM | " + report.llms.join(" | ");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const emb of report.embeddings) {
    const row = [emb.slice(-20).padEnd(20)];
    for (const llm of report.llms) {
      const cell = report.matrix[emb]?.[llm];
      row.push(cell ? `${(cell.hit_at_5 * 100).toFixed(1)}%`.padEnd(20) : "N/A".padEnd(20));
    }
    lines.push(row.join(" | "));
  }
  lines.push("");

  // MRR Matrix
  lines.push("--- MRR Matrix ---");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const emb of report.embeddings) {
    const row = [emb.slice(-20).padEnd(20)];
    for (const llm of report.llms) {
      const cell = report.matrix[emb]?.[llm];
      row.push(cell ? cell.mrr.toFixed(3).padEnd(20) : "N/A".padEnd(20));
    }
    lines.push(row.join(" | "));
  }
  lines.push("");

  // Best combination
  if (report.best_combination) {
    lines.push("--- Best Combination ---");
    lines.push(`Embedding: ${report.best_combination.embedding_model}`);
    lines.push(`LLM: ${report.best_combination.llm_model}`);
    lines.push(`Rerank: ${report.best_combination.rerank_enabled}`);
  }

  // Per-cell details
  lines.push("");
  lines.push("--- Per-Cell Details ---");
  for (const cell of report.cells) {
    lines.push(
      `[${cell.config.embedding_model.slice(-15)} × ${cell.config.llm_model.slice(-15)} × rerank=${cell.config.rerank_enabled}]`
    );
    lines.push(`  Hit@1: ${(cell.aggregate.hit_at_1_rate * 100).toFixed(1)}%`);
    lines.push(`  Hit@5: ${(cell.aggregate.hit_at_5_rate * 100).toFixed(1)}%`);
    lines.push(`  MRR: ${cell.aggregate.mean_mrr.toFixed(3)}`);
    lines.push(`  Keyword Coverage: ${(cell.aggregate.keyword_coverage * 100).toFixed(1)}%`);
    lines.push(`  Avg Latency: ${cell.aggregate.avg_latency_ms.toFixed(0)}ms`);
    if (cell.aggregate.error_count > 0) {
      lines.push(`  Errors: ${cell.aggregate.error_count}`);
    }
  }

  return lines.join("\n");
}

// ── Mock Functions (for testing) ──────────────────────────────────────

export function mockFactorialSearchFn(): FactorialSearchFn {
  return async (query, opts) => {
    // Simulate: better embedding models find more slugs
    const isLargeEmb = opts.embeddingModel.includes("large");
    const baseLatency = isLargeEmb ? 80 : 50;
    const rerankBonus = opts.rerank ? 0.2 : 0;

    // Find matching question
    const q = FACTORIAL_QUESTIONS.find((q) => q.question === query);
    if (!q) return { slugs: [], latency_ms: baseLatency };

    // Simulate 70% hit rate for small, 85% for large, +20% for rerank
    const hitRate = (isLargeEmb ? 0.85 : 0.7) + rerankBonus;
    if (Math.random() < hitRate) {
      return { slugs: q.expected_slugs, latency_ms: baseLatency + (opts.rerank ? 200 : 0) };
    }
    return { slugs: ["legal/statutes/de/bgb/p-999"], latency_ms: baseLatency };
  };
}

export function mockFactorialAnswerFn(): FactorialAnswerFn {
  return async (question, _context, opts) => {
    // Simulate: better LLMs produce more keywords
    const isClaude = opts.llmModel.includes("claude");
    const baseLatency = isClaude ? 1500 : 800;

    const q = FACTORIAL_QUESTIONS.find((q) => q.question === question);
    if (!q) return { answer: "", latency_ms: baseLatency };

    // Simulate keyword coverage: 60% for deepseek, 80% for claude
    const coverageRate = isClaude ? 0.8 : 0.6;
    const includedKeywords = q.expected_keywords.filter(() => Math.random() < coverageRate);
    const answer = `Basierend auf den gefundenen Rechtsnormen: ${includedKeywords.join(", ")}.`;

    return { answer, latency_ms: baseLatency };
  };
}
