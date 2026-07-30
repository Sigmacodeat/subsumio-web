import { describe, it, expect } from "vitest";
import {
  FACTORIAL_QUESTIONS,
  DEFAULT_EMBEDDINGS,
  DEFAULT_LLMS,
  runFactorialEval,
  formatFactorialReport,
  mockFactorialSearchFn,
  mockFactorialAnswerFn,
} from "./factorial-harness.ts";
import {
  MULTILINGUAL_CH_FIXTURES,
  getMultilingualFixtures,
  getCrossLingualPairs,
} from "./multilingual-fixtures.ts";

// ── Factorial Harness Tests ───────────────────────────────────────────

describe("Factorial Harness", () => {
  it("has at least 10 questions", () => {
    expect(FACTORIAL_QUESTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("questions cover multiple jurisdictions", () => {
    const jurisdictions = new Set(FACTORIAL_QUESTIONS.map((q) => q.jurisdiction));
    expect(jurisdictions.size).toBeGreaterThanOrEqual(3);
  });

  it("all questions have expected slugs and keywords", () => {
    for (const q of FACTORIAL_QUESTIONS) {
      expect(q.expected_slugs.length).toBeGreaterThan(0);
      expect(q.expected_keywords.length).toBeGreaterThan(0);
    }
  });

  it("default embeddings include at least 2 models", () => {
    expect(DEFAULT_EMBEDDINGS.length).toBeGreaterThanOrEqual(2);
  });

  it("default LLMs include at least 2 models", () => {
    expect(DEFAULT_LLMS.length).toBeGreaterThanOrEqual(2);
  });

  it("runs factorial evaluation with mock functions", async () => {
    const questions = FACTORIAL_QUESTIONS.slice(0, 3);
    const embeddings = ["openrouter:openai/text-embedding-3-small"];
    const llms = ["openrouter:deepseek/deepseek-chat"];
    const rerankOptions = [false];

    const report = await runFactorialEval(
      questions,
      embeddings,
      llms,
      rerankOptions,
      mockFactorialSearchFn(),
      mockFactorialAnswerFn()
    );

    expect(report.total_cells).toBe(1);
    expect(report.cells.length).toBe(1);
    expect(report.cells[0].questions.length).toBe(3);
  });

  it("runs with multiple embeddings and LLMs", async () => {
    const questions = FACTORIAL_QUESTIONS.slice(0, 2);
    const embeddings = ["emb-a", "emb-b"];
    const llms = ["llm-1", "llm-2"];
    const rerankOptions = [false];

    const report = await runFactorialEval(
      questions,
      embeddings,
      llms,
      rerankOptions,
      mockFactorialSearchFn(),
      mockFactorialAnswerFn()
    );

    expect(report.total_cells).toBe(4); // 2×2×1
    expect(report.cells.length).toBe(4);
  });

  it("runs with rerank options", async () => {
    const questions = FACTORIAL_QUESTIONS.slice(0, 2);
    const embeddings = ["emb-a"];
    const llms = ["llm-1"];
    const rerankOptions = [false, true];

    const report = await runFactorialEval(
      questions,
      embeddings,
      llms,
      rerankOptions,
      mockFactorialSearchFn(),
      mockFactorialAnswerFn()
    );

    expect(report.total_cells).toBe(2); // 1×1×2
  });

  it("builds comparison matrix", async () => {
    const questions = FACTORIAL_QUESTIONS.slice(0, 3);
    const embeddings = ["emb-a", "emb-b"];
    const llms = ["llm-1", "llm-2"];
    const rerankOptions = [false];

    const report = await runFactorialEval(
      questions,
      embeddings,
      llms,
      rerankOptions,
      mockFactorialSearchFn(),
      mockFactorialAnswerFn()
    );

    expect(Object.keys(report.matrix)).toContain("emb-a");
    expect(Object.keys(report.matrix)).toContain("emb-b");
    expect(report.matrix["emb-a"]["llm-1"]).toBeDefined();
    expect(report.matrix["emb-a"]["llm-1"].hit_at_5).toBeGreaterThanOrEqual(0);
  });

  it("identifies best combination", async () => {
    const questions = FACTORIAL_QUESTIONS.slice(0, 3);
    const report = await runFactorialEval(
      questions,
      ["emb-a", "emb-b"],
      ["llm-1"],
      [false],
      mockFactorialSearchFn(),
      mockFactorialAnswerFn()
    );

    expect(report.best_combination).not.toBeNull();
    expect(report.best_combination!.embedding_model).toBeDefined();
  });

  it("calls onProgress callback", async () => {
    const progress: Array<{ cell: number; total: number }> = [];
    await runFactorialEval(
      FACTORIAL_QUESTIONS.slice(0, 2),
      ["emb-a"],
      ["llm-1"],
      [false],
      mockFactorialSearchFn(),
      mockFactorialAnswerFn(),
      (cell, total) => progress.push({ cell, total })
    );

    expect(progress.length).toBe(1);
    expect(progress[0]).toEqual({ cell: 1, total: 1 });
  });

  it("formats a readable report", async () => {
    const report = await runFactorialEval(
      FACTORIAL_QUESTIONS.slice(0, 2),
      ["emb-a", "emb-b"],
      ["llm-1", "llm-2"],
      [false],
      mockFactorialSearchFn(),
      mockFactorialAnswerFn()
    );

    const text = formatFactorialReport(report);
    expect(text).toContain("Full Factorial Evaluation Report");
    expect(text).toContain("Hit@5 Matrix");
    expect(text).toContain("MRR Matrix");
    expect(text).toContain("Best Combination");
    expect(text).toContain("Per-Cell Details");
  });

  it("handles search errors gracefully", async () => {
    const errorSearchFn = async () => {
      throw new Error("Search API down");
    };
    const report = await runFactorialEval(
      FACTORIAL_QUESTIONS.slice(0, 2),
      ["emb-a"],
      ["llm-1"],
      [false],
      errorSearchFn,
      mockFactorialAnswerFn()
    );

    expect(report.cells[0].aggregate.error_count).toBe(2);
    expect(report.cells[0].aggregate.hit_at_5_rate).toBe(0);
  });
});

// ── Multilingual Fixtures Tests ───────────────────────────────────────

describe("Multilingual CH Fixtures", () => {
  it("has at least 16 fixtures", () => {
    expect(MULTILINGUAL_CH_FIXTURES.length).toBeGreaterThanOrEqual(16);
  });

  it("has both French and Italian fixtures", () => {
    const fr = MULTILINGUAL_CH_FIXTURES.filter((f) => f.language === "fr");
    const it = MULTILINGUAL_CH_FIXTURES.filter((f) => f.language === "it");
    expect(fr.length).toBeGreaterThanOrEqual(8);
    expect(it.length).toBeGreaterThanOrEqual(8);
  });

  it("all fixtures are CH jurisdiction", () => {
    for (const f of MULTILINGUAL_CH_FIXTURES) {
      expect(f.jurisdiction).toBe("CH");
    }
  });

  it("all fixtures have expected slugs", () => {
    for (const f of MULTILINGUAL_CH_FIXTURES) {
      expect(f.expected_slug).toMatch(/^legal\/statutes\/ch-(fr|it)\//);
    }
  });

  it("all fixtures have German equivalents", () => {
    for (const f of MULTILINGUAL_CH_FIXTURES) {
      expect(f.german_equivalent.length).toBeGreaterThan(0);
    }
  });

  it("all fixtures have expected keywords in their language", () => {
    for (const f of MULTILINGUAL_CH_FIXTURES) {
      expect(f.expected_keywords.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("filters by language", () => {
    const fr = getMultilingualFixtures("fr");
    expect(fr.every((f) => f.language === "fr")).toBe(true);
    expect(fr.length).toBeGreaterThanOrEqual(8);

    const it = getMultilingualFixtures("it");
    expect(it.every((f) => f.language === "it")).toBe(true);
    expect(it.length).toBeGreaterThanOrEqual(8);
  });

  it("has cross-lingual pairs (FR + IT for same article)", () => {
    const pairs = getCrossLingualPairs();
    expect(pairs.length).toBeGreaterThanOrEqual(4);
    for (const pair of pairs) {
      expect(pair.fr.expected_law).toBe(pair.it.expected_law);
      expect(pair.fr.expected_section).toBe(pair.it.expected_section);
      expect(pair.german_equivalent.length).toBeGreaterThan(0);
    }
  });

  it("covers OR, ZGB, and StGB", () => {
    const laws = new Set(MULTILINGUAL_CH_FIXTURES.map((f) => f.expected_law));
    expect(laws.has("OR")).toBe(true);
    expect(laws.has("ZGB")).toBe(true);
    expect(laws.has("StGB")).toBe(true);
  });
});
