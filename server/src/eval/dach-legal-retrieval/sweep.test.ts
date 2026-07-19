import { describe, it, expect } from "vitest";

// Validates that the sweep config structure is correct and the default
// configs cover the expected parameter space.

const EXPECTED_AXES = ["rrfK", "llmRerankTopN", "dedupCosineThreshold", "dedupMaxPerPage"];

interface SweepConfig {
  name: string;
  rrfK?: number;
  llmRerankTopN?: number;
  llmRerankEnabled?: boolean;
  dedupCosineThreshold?: number;
  dedupMaxPerPage?: number;
}

const DEFAULT_CONFIGS: SweepConfig[] = [
  { name: "baseline-k60" },
  { name: "rrf-k40", rrfK: 40 },
  { name: "rrf-k50", rrfK: 50 },
  { name: "rrf-k80", rrfK: 80 },
  { name: "rrf-k100", rrfK: 100 },
  { name: "rerank-top15", llmRerankEnabled: true, llmRerankTopN: 15 },
  { name: "rerank-top20", llmRerankEnabled: true, llmRerankTopN: 20 },
  { name: "rerank-top25", llmRerankEnabled: true, llmRerankTopN: 25 },
  { name: "rerank-top30", llmRerankEnabled: true, llmRerankTopN: 30 },
  { name: "rerank-top40", llmRerankEnabled: true, llmRerankTopN: 40 },
  { name: "dedup-cos085", dedupCosineThreshold: 0.85 },
  { name: "dedup-cos090", dedupCosineThreshold: 0.9 },
  { name: "dedup-cos095", dedupCosineThreshold: 0.95 },
  { name: "dedup-max3", dedupMaxPerPage: 3 },
  { name: "dedup-max5", dedupMaxPerPage: 5 },
  { name: "dedup-max8", dedupMaxPerPage: 8 },
  { name: "combo-k50-rerank25", rrfK: 50, llmRerankEnabled: true, llmRerankTopN: 25 },
  { name: "combo-k40-rerank20", rrfK: 40, llmRerankEnabled: true, llmRerankTopN: 20 },
  {
    name: "combo-k50-rerank30-dedup5",
    rrfK: 50,
    llmRerankEnabled: true,
    llmRerankTopN: 30,
    dedupMaxPerPage: 5,
  },
];

describe("dach-legal-retrieval sweep configs", () => {
  it("has a baseline config with no overrides", () => {
    const baseline = DEFAULT_CONFIGS.find((c) => c.name === "baseline-k60");
    expect(baseline).toBeDefined();
    expect(baseline!.rrfK).toBeUndefined();
    expect(baseline!.llmRerankEnabled).toBeUndefined();
  });

  it("sweeps RRF_K across multiple values", () => {
    const rrfConfigs = DEFAULT_CONFIGS.filter((c) => c.rrfK !== undefined);
    expect(rrfConfigs.length).toBeGreaterThanOrEqual(4);
    const ks = rrfConfigs.map((c) => c.rrfK).sort((a, b) => a! - b!);
    expect(ks[0]).toBe(40);
    expect(ks[ks.length - 1]).toBe(100);
  });

  it("sweeps LLM reranker topN across multiple values", () => {
    const rerankConfigs = DEFAULT_CONFIGS.filter((c) => c.llmRerankEnabled === true);
    expect(rerankConfigs.length).toBeGreaterThanOrEqual(5);
    const topNs = rerankConfigs.map((c) => c.llmRerankTopN).sort((a, b) => a! - b!);
    expect(topNs[0]).toBe(15);
    expect(topNs[topNs.length - 1]).toBe(40);
  });

  it("sweeps dedup cosine threshold", () => {
    const dedupConfigs = DEFAULT_CONFIGS.filter((c) => c.dedupCosineThreshold !== undefined);
    expect(dedupConfigs.length).toBeGreaterThanOrEqual(3);
  });

  it("sweeps dedup maxPerPage", () => {
    const dedupConfigs = DEFAULT_CONFIGS.filter((c) => c.dedupMaxPerPage !== undefined);
    expect(dedupConfigs.length).toBeGreaterThanOrEqual(3);
  });

  it("has combined configs", () => {
    const comboConfigs = DEFAULT_CONFIGS.filter(
      (c) => c.rrfK !== undefined && c.llmRerankEnabled === true
    );
    expect(comboConfigs.length).toBeGreaterThanOrEqual(2);
  });

  it("all config names are unique", () => {
    const names = DEFAULT_CONFIGS.map((c) => c.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("has at least 15 configs total", () => {
    expect(DEFAULT_CONFIGS.length).toBeGreaterThanOrEqual(15);
  });

  it("covers all expected optimization axes", () => {
    for (const axis of EXPECTED_AXES) {
      const hasAxis = DEFAULT_CONFIGS.some((c) => (c as any)[axis] !== undefined);
      expect(hasAxis).toBe(true);
    }
  });
});
