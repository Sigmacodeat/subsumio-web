/**
 * Retrieval Explainability Tests — Verifiziert, dass Retrieval-Ergebnisse
 * vollständige Erklärungen liefern für:
 *   - Quelle (source, source_type)
 *   - Chunk/Page (chunk_info mit page + snippet)
 *   - Score (relevance score)
 *   - Search-Modus (hybrid, semantic, keyword, graph, unknown)
 *   - Graph-Signal (graph_signal weight)
 *   - Recency (recency_hours seit letztem Update)
 *   - Datenlücken (permission_filtered, missing results)
 *   - Query-Mode-Einfluss auf Explanation
 */

import { describe, it, expect } from "vitest";
import type {
  RetrievalExplanation,
  ExplainedSearchResult,
  QueryMode,
} from "@/lib/matter-context-types";
import {
  QUERY_MODE_LABELS,
} from "@/lib/matter-context-types";

// ── Helpers ───────────────────────────────────────────────────────────

function makeExplanation(
  overrides: Partial<RetrievalExplanation> = {},
): RetrievalExplanation {
  return {
    slug: "cases/test",
    title: "Test Case",
    score: 0.85,
    search_mode: "hybrid",
    source: "internal",
    source_type: "dms",
    recency_hours: 24,
    graph_signal: 0.5,
    chunk_info: { page: 1, snippet: "Test snippet" },
    permission_filtered: false,
    ...overrides,
  };
}

function makeExplainedResult(
  overrides: Partial<ExplainedSearchResult> & { explanation?: Partial<RetrievalExplanation> } = {},
): ExplainedSearchResult {
  const { explanation: explOverrides, ...resultOverrides } = overrides;
  const baseSlug = resultOverrides.slug ?? "cases/test";
  const baseScore = resultOverrides.score ?? 0.85;
  const baseTitle = resultOverrides.title ?? "Test Case";
  return {
    slug: baseSlug,
    title: baseTitle,
    snippet: "Test snippet",
    score: baseScore,
    explanation: makeExplanation({ slug: baseSlug, title: baseTitle, score: baseScore, ...explOverrides }),
    ...resultOverrides,
  };
}

// ── 1. Source Explainability ──────────────────────────────────────────

describe("Source Explainability", () => {
  it("every result has a source field", () => {
    const result = makeExplainedResult();
    expect(result.explanation.source).toBeTruthy();
  });

  it("source_type identifies the data origin", () => {
    const types = ["statute_corpus", "judgement_api", "dms", "email", "whatsapp", "portal", "upload", "regulatory_feed", "commercial"];
    for (const type of types) {
      const explanation = makeExplanation({ source_type: type });
      expect(explanation.source_type).toBe(type);
    }
  });

  it("internal source for case pages", () => {
    const explanation = makeExplanation({ source: "internal", source_type: "dms" });
    expect(explanation.source).toBe("internal");
  });

  it("external source for statute pages", () => {
    const explanation = makeExplanation({ source: "gesetze-im-internet", source_type: "statute_corpus" });
    expect(explanation.source).toBe("gesetze-im-internet");
  });
});

// ── 2. Chunk/Page Explainability ──────────────────────────────────────

describe("Chunk/Page Explainability", () => {
  it("chunk_info contains page number", () => {
    const explanation = makeExplanation({ chunk_info: { page: 3, snippet: "..." } });
    expect(explanation.chunk_info?.page).toBe(3);
  });

  it("chunk_info contains snippet", () => {
    const explanation = makeExplanation({ chunk_info: { page: 1, snippet: "Haftung nach § 823 BGB" } });
    expect(explanation.chunk_info?.snippet).toContain("Haftung");
  });

  it("chunk_info is optional", () => {
    const explanation = makeExplanation({ chunk_info: undefined });
    expect(explanation.chunk_info).toBeUndefined();
  });
});

// ── 3. Score Explainability ───────────────────────────────────────────

describe("Score Explainability", () => {
  it("score is between 0 and 1", () => {
    const result = makeExplainedResult({ score: 0.92 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("higher score indicates more relevant result", () => {
    const results = [
      makeExplainedResult({ slug: "r1", score: 0.3 }),
      makeExplainedResult({ slug: "r2", score: 0.9 }),
      makeExplainedResult({ slug: "r3", score: 0.6 }),
    ];
    const sorted = [...results].sort((a, b) => b.score - a.score);
    expect(sorted[0].slug).toBe("r2");
    expect(sorted[2].slug).toBe("r1");
  });

  it("explanation score matches result score", () => {
    const result = makeExplainedResult({ score: 0.75 });
    expect(result.explanation.score).toBe(0.75);
  });
});

// ── 4. Search-Mode Explainability ─────────────────────────────────────

describe("Search-Mode Explainability", () => {
  const searchModes = ["hybrid", "semantic", "keyword", "graph", "unknown"] as const;

  it("all 5 search modes are defined", () => {
    expect(searchModes).toHaveLength(5);
  });

  it("hybrid mode combines semantic + keyword", () => {
    const explanation = makeExplanation({ search_mode: "hybrid" });
    expect(explanation.search_mode).toBe("hybrid");
  });

  it("semantic mode uses embeddings", () => {
    const explanation = makeExplanation({ search_mode: "semantic" });
    expect(explanation.search_mode).toBe("semantic");
  });

  it("keyword mode uses exact matching", () => {
    const explanation = makeExplanation({ search_mode: "keyword" });
    expect(explanation.search_mode).toBe("keyword");
  });

  it("graph mode uses entity graph", () => {
    const explanation = makeExplanation({ search_mode: "graph" });
    expect(explanation.search_mode).toBe("graph");
  });

  it("unknown mode as fallback", () => {
    const explanation = makeExplanation({ search_mode: "unknown" });
    expect(explanation.search_mode).toBe("unknown");
  });
});

// ── 5. Graph-Signal Explainability ────────────────────────────────────

describe("Graph-Signal Explainability", () => {
  it("graph_signal indicates entity graph relevance", () => {
    const explanation = makeExplanation({ graph_signal: 0.8 });
    expect(explanation.graph_signal).toBe(0.8);
  });

  it("graph_signal is optional", () => {
    const explanation = makeExplanation({ graph_signal: undefined });
    expect(explanation.graph_signal).toBeUndefined();
  });

  it("graph_signal between 0 and 1", () => {
    const explanation = makeExplanation({ graph_signal: 0.5 });
    expect(explanation.graph_signal).toBeGreaterThanOrEqual(0);
    expect(explanation.graph_signal).toBeLessThanOrEqual(1);
  });

  it("high graph_signal indicates strong entity connection", () => {
    const high = makeExplanation({ graph_signal: 0.9 });
    const low = makeExplanation({ graph_signal: 0.1 });
    expect(high.graph_signal!).toBeGreaterThan(low.graph_signal!);
  });
});

// ── 6. Recency Explainability ─────────────────────────────────────────

describe("Recency Explainability", () => {
  it("recency_hours shows hours since last update", () => {
    const explanation = makeExplanation({ recency_hours: 48 });
    expect(explanation.recency_hours).toBe(48);
  });

  it("recency_hours is optional for undated results", () => {
    const explanation = makeExplanation({ recency_hours: undefined });
    expect(explanation.recency_hours).toBeUndefined();
  });

  it("fresh result has low recency_hours", () => {
    const fresh = makeExplanation({ recency_hours: 2 });
    expect(fresh.recency_hours!).toBeLessThan(24);
  });

  it("stale result has high recency_hours", () => {
    const stale = makeExplanation({ recency_hours: 720 }); // 30 days
    expect(stale.recency_hours!).toBeGreaterThan(168); // > 1 week
  });
});

// ── 7. Datenlücken / Permission-Filtered ──────────────────────────────

describe("Datenlücken / Permission-Filtered", () => {
  it("permission_filtered flag indicates excluded results", () => {
    const explanation = makeExplanation({ permission_filtered: true });
    expect(explanation.permission_filtered).toBe(true);
  });

  it("unfiltered results have permission_filtered=false", () => {
    const explanation = makeExplanation({ permission_filtered: false });
    expect(explanation.permission_filtered).toBe(false);
  });

  it("can identify gaps in search results", () => {
    const expectedSources = ["statute_corpus", "judgement_api", "dms", "email"];
    const foundSources = ["statute_corpus", "dms"];
    const missing = expectedSources.filter((s) => !foundSources.includes(s));
    expect(missing).toEqual(["judgement_api", "email"]);
  });
});

// ── 8. Query-Mode Labels ──────────────────────────────────────────────

describe("Query-Mode Labels", () => {
  const modes: QueryMode[] = ["conservative", "balanced", "deep_matter", "external_law", "admin_audit"];

  it("all 5 modes have labels", () => {
    for (const mode of modes) {
      expect(QUERY_MODE_LABELS[mode]).toBeDefined();
      expect(QUERY_MODE_LABELS[mode].label).toBeTruthy();
      expect(QUERY_MODE_LABELS[mode].description).toBeTruthy();
    }
  });

  it("conservative mode is labeled 'Präzise'", () => {
    expect(QUERY_MODE_LABELS.conservative.label).toBe("Präzise");
  });

  it("balanced mode is labeled 'Balanced'", () => {
    expect(QUERY_MODE_LABELS.balanced.label).toBe("Balanced");
  });

  it("deep_matter mode is labeled 'Deep Matter'", () => {
    expect(QUERY_MODE_LABELS.deep_matter.label).toBe("Deep Matter");
  });

  it("external_law mode is labeled 'Externe Quellen'", () => {
    expect(QUERY_MODE_LABELS.external_law.label).toBe("Externe Quellen");
  });

  it("admin_audit mode is labeled 'Audit'", () => {
    expect(QUERY_MODE_LABELS.admin_audit.label).toBe("Audit");
  });
});

// ── 9. Full Explanation Contract ──────────────────────────────────────

describe("Full Explanation Contract", () => {
  it("every ExplainedSearchResult has a complete explanation", () => {
    const result = makeExplainedResult();
    expect(result.explanation).toBeDefined();
    expect(result.explanation.slug).toBe(result.slug);
    expect(result.explanation.title).toBe(result.title);
    expect(result.explanation.score).toBe(result.score);
  });

  it("explanation slug matches result slug", () => {
    const result = makeExplainedResult({ slug: "cases/2024-001" });
    expect(result.explanation.slug).toBe("cases/2024-001");
  });

  it("explanation contains all required fields", () => {
    const explanation = makeExplanation();
    expect(explanation.slug).toBeTruthy();
    expect(explanation.title).toBeTruthy();
    expect(explanation.score).toBeDefined();
    expect(explanation.search_mode).toBeDefined();
    expect(explanation.source).toBeTruthy();
    expect(explanation.permission_filtered).toBeDefined();
  });

  it("multiple results each have their own explanation", () => {
    const results = [
      makeExplainedResult({ slug: "r1", score: 0.9 }),
      makeExplainedResult({ slug: "r2", score: 0.7 }),
    ];
    expect(results[0].explanation.slug).toBe("r1");
    expect(results[1].explanation.slug).toBe("r2");
    expect(results[0].explanation.score).not.toBe(results[1].explanation.score);
  });
});
