import { describe, it, expect, beforeEach } from "vitest";
import {
  submitFeedback,
  getFeedback,
  getAllFeedback,
  getFeedbackForQuery,
  getFeedbackForSlug,
  getFeedbackForOrg,
  getFeedbackForBrain,
  getFeedbackStats,
  getFeedbackBoosts,
  exportForEval,
  validateFeedback,
  clearFeedbackStore,
  type RetrievalFeedback,
  type FeedbackType,
  type FeedbackSeverity,
} from "@/lib/retrieval-feedback";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeFeedback(
  overrides: Partial<Omit<RetrievalFeedback, "id" | "query_hash" | "created_at">> = {}
): Omit<RetrievalFeedback, "id" | "query_hash" | "created_at"> {
  return {
    query: "Lieferverzug BGB",
    result_slug: "test/case-1",
    result_title: "Musterfall Lieferverzug",
    feedback_type: "relevant" as FeedbackType,
    severity: "medium" as FeedbackSeverity,
    user_id: "user-1",
    brain_id: "brain-1",
    org_id: "org-1",
    ...overrides,
  };
}

const _NOW = "2026-06-20T12:00:00Z";

describe("Retrieval Feedback — Validation", () => {
  it("validates correct feedback", () => {
    const result = validateFeedback(makeFeedback());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty query", () => {
    const result = validateFeedback(makeFeedback({ query: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("query is required");
  });

  it("rejects empty result_slug", () => {
    const result = validateFeedback(makeFeedback({ result_slug: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("result_slug is required");
  });

  it("rejects missing user_id", () => {
    const result = validateFeedback(makeFeedback({ user_id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("user_id is required");
  });

  it("rejects missing brain_id", () => {
    const result = validateFeedback(makeFeedback({ brain_id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("brain_id is required");
  });

  it("rejects missing org_id", () => {
    const result = validateFeedback(makeFeedback({ org_id: "" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("org_id is required");
  });
});

describe("Retrieval Feedback — Submit & Get", () => {
  beforeEach(() => {
    clearFeedbackStore();
  });

  it("submits feedback and returns entry with id and hash", () => {
    const entry = submitFeedback(makeFeedback());
    expect(entry.id).toBeDefined();
    expect(entry.query_hash).toBeDefined();
    expect(entry.created_at).toBeDefined();
    expect(entry.query).toBe("Lieferverzug BGB");
    expect(entry.feedback_type).toBe("relevant");
  });

  it("retrieves feedback by id", () => {
    const entry = submitFeedback(makeFeedback());
    const retrieved = getFeedback(entry.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(entry.id);
  });

  it("returns undefined for non-existent id", () => {
    expect(getFeedback("non-existent")).toBeUndefined();
  });

  it("getAllFeedback returns all entries", () => {
    submitFeedback(makeFeedback({ result_slug: "test/a" }));
    submitFeedback(makeFeedback({ result_slug: "test/b" }));
    expect(getAllFeedback()).toHaveLength(2);
  });
});

describe("Retrieval Feedback — Query/Slug/Org/Brain Access", () => {
  beforeEach(() => {
    clearFeedbackStore();
  });

  it("getFeedbackForQuery returns matching entries", () => {
    submitFeedback(makeFeedback({ query: "Lieferverzug" }));
    submitFeedback(makeFeedback({ query: "Lieferverzug", result_slug: "test/other" }));
    submitFeedback(makeFeedback({ query: "Kündigung" }));
    const results = getFeedbackForQuery("Lieferverzug");
    expect(results).toHaveLength(2);
  });

  it("getFeedbackForSlug returns matching entries", () => {
    submitFeedback(makeFeedback({ result_slug: "test/case-1" }));
    submitFeedback(makeFeedback({ result_slug: "test/case-1", feedback_type: "irrelevant" }));
    submitFeedback(makeFeedback({ result_slug: "test/case-2" }));
    const results = getFeedbackForSlug("test/case-1");
    expect(results).toHaveLength(2);
  });

  it("getFeedbackForOrg filters by org_id", () => {
    submitFeedback(makeFeedback({ org_id: "org-1" }));
    submitFeedback(makeFeedback({ org_id: "org-2" }));
    expect(getFeedbackForOrg("org-1")).toHaveLength(1);
    expect(getFeedbackForOrg("org-2")).toHaveLength(1);
  });

  it("getFeedbackForBrain filters by brain_id", () => {
    submitFeedback(makeFeedback({ brain_id: "brain-1" }));
    submitFeedback(makeFeedback({ brain_id: "brain-2" }));
    expect(getFeedbackForBrain("brain-1")).toHaveLength(1);
    expect(getFeedbackForBrain("brain-2")).toHaveLength(1);
  });
});

describe("Retrieval Feedback — Stats", () => {
  beforeEach(() => {
    clearFeedbackStore();
  });

  it("returns empty stats for no feedback", () => {
    const stats = getFeedbackStats();
    expect(stats.total_feedback).toBe(0);
    expect(stats.satisfaction_rate).toBe(0);
  });

  it("counts feedback by type", () => {
    submitFeedback(makeFeedback({ feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ feedback_type: "irrelevant" }));
    submitFeedback(makeFeedback({ feedback_type: "outdated" }));
    submitFeedback(makeFeedback({ feedback_type: "wrong" }));
    const stats = getFeedbackStats();
    expect(stats.by_type.relevant).toBe(2);
    expect(stats.by_type.irrelevant).toBe(1);
    expect(stats.by_type.outdated).toBe(1);
    expect(stats.by_type.wrong).toBe(1);
  });

  it("counts feedback by severity", () => {
    submitFeedback(makeFeedback({ severity: "low" }));
    submitFeedback(makeFeedback({ severity: "medium" }));
    submitFeedback(makeFeedback({ severity: "high" }));
    const stats = getFeedbackStats();
    expect(stats.by_severity.low).toBe(1);
    expect(stats.by_severity.medium).toBe(1);
    expect(stats.by_severity.high).toBe(1);
  });

  it("calculates satisfaction rate", () => {
    submitFeedback(makeFeedback({ feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ feedback_type: "irrelevant" }));
    submitFeedback(makeFeedback({ feedback_type: "wrong" }));
    const stats = getFeedbackStats();
    expect(stats.satisfaction_rate).toBe(0.5);
  });

  it("identifies problematic results", () => {
    submitFeedback(
      makeFeedback({ result_slug: "test/bad", feedback_type: "wrong", severity: "high" })
    );
    submitFeedback(makeFeedback({ result_slug: "test/bad", feedback_type: "outdated" }));
    submitFeedback(makeFeedback({ result_slug: "test/good", feedback_type: "relevant" }));
    const stats = getFeedbackStats();
    expect(stats.problematic_results).toHaveLength(1);
    expect(stats.problematic_results[0].result_slug).toBe("test/bad");
    expect(stats.problematic_results[0].negative_count).toBe(2);
  });

  it("identifies problematic queries", () => {
    submitFeedback(makeFeedback({ query: "bad query", feedback_type: "irrelevant" }));
    submitFeedback(makeFeedback({ query: "bad query", feedback_type: "wrong" }));
    submitFeedback(makeFeedback({ query: "good query", feedback_type: "relevant" }));
    const stats = getFeedbackStats();
    expect(stats.problematic_queries).toHaveLength(1);
    expect(stats.problematic_queries[0].negative_count).toBe(2);
    expect(stats.problematic_queries[0].satisfaction_rate).toBe(0);
  });

  it("counts unique queries and results", () => {
    submitFeedback(makeFeedback({ query: "q1", result_slug: "r1" }));
    submitFeedback(makeFeedback({ query: "q1", result_slug: "r2" }));
    submitFeedback(makeFeedback({ query: "q2", result_slug: "r1" }));
    const stats = getFeedbackStats();
    expect(stats.unique_queries).toBe(2);
    expect(stats.unique_results).toBe(2);
  });
});

describe("Retrieval Feedback — Boost Signals", () => {
  beforeEach(() => {
    clearFeedbackStore();
  });

  it("returns empty for no feedback", () => {
    expect(getFeedbackBoosts()).toHaveLength(0);
  });

  it("returns positive boost for relevant feedback", () => {
    submitFeedback(makeFeedback({ result_slug: "test/good", feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ result_slug: "test/good", feedback_type: "relevant" }));
    const boosts = getFeedbackBoosts();
    expect(boosts).toHaveLength(1);
    expect(boosts[0].boost).toBeGreaterThan(0);
    expect(boosts[0].result_slug).toBe("test/good");
  });

  it("returns negative boost for wrong feedback", () => {
    submitFeedback(
      makeFeedback({ result_slug: "test/bad", feedback_type: "wrong", severity: "high" })
    );
    submitFeedback(
      makeFeedback({ result_slug: "test/bad", feedback_type: "wrong", severity: "high" })
    );
    const boosts = getFeedbackBoosts();
    expect(boosts).toHaveLength(1);
    expect(boosts[0].boost).toBeLessThan(0);
  });

  it("filters results with < 2 feedback", () => {
    submitFeedback(makeFeedback({ result_slug: "test/one", feedback_type: "relevant" }));
    const boosts = getFeedbackBoosts();
    expect(boosts).toHaveLength(0);
  });

  it("clamps boost to [-0.5, +0.5]", () => {
    for (let i = 0; i < 20; i++) {
      submitFeedback(
        makeFeedback({ result_slug: "test/boosted", feedback_type: "relevant", severity: "high" })
      );
    }
    const boosts = getFeedbackBoosts();
    expect(boosts[0].boost).toBeLessThanOrEqual(0.5);
  });

  it("calculates confidence based on count", () => {
    for (let i = 0; i < 10; i++) {
      submitFeedback(makeFeedback({ result_slug: "test/confident", feedback_type: "relevant" }));
    }
    const boosts = getFeedbackBoosts();
    expect(boosts[0].confidence).toBe(1);
  });

  it("sorts by absolute boost value", () => {
    submitFeedback(makeFeedback({ result_slug: "test/a", feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ result_slug: "test/a", feedback_type: "relevant" }));
    for (let i = 0; i < 5; i++) {
      submitFeedback(
        makeFeedback({ result_slug: "test/b", feedback_type: "wrong", severity: "high" })
      );
    }
    const boosts = getFeedbackBoosts();
    expect(Math.abs(boosts[0].boost)).toBeGreaterThanOrEqual(Math.abs(boosts[1].boost));
  });
});

describe("Retrieval Feedback — Eval Export", () => {
  beforeEach(() => {
    clearFeedbackStore();
  });

  it("exports empty for no feedback", () => {
    expect(exportForEval()).toHaveLength(0);
  });

  it("groups by query and categorizes slugs", () => {
    submitFeedback(makeFeedback({ query: "Q1", result_slug: "r1", feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ query: "Q1", result_slug: "r2", feedback_type: "irrelevant" }));
    submitFeedback(makeFeedback({ query: "Q1", result_slug: "r3", feedback_type: "outdated" }));
    submitFeedback(makeFeedback({ query: "Q1", result_slug: "r4", feedback_type: "wrong" }));
    const exported = exportForEval();
    expect(exported).toHaveLength(1);
    expect(exported[0].relevant_slugs).toContain("r1");
    expect(exported[0].irrelevant_slugs).toContain("r2");
    expect(exported[0].outdated_slugs).toContain("r3");
    expect(exported[0].wrong_slugs).toContain("r4");
  });

  it("deduplicates slugs within same category", () => {
    submitFeedback(makeFeedback({ query: "Q1", result_slug: "r1", feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ query: "Q1", result_slug: "r1", feedback_type: "relevant" }));
    const exported = exportForEval();
    expect(exported[0].relevant_slugs).toHaveLength(1);
  });

  it("separates different queries", () => {
    submitFeedback(makeFeedback({ query: "Q1", result_slug: "r1", feedback_type: "relevant" }));
    submitFeedback(makeFeedback({ query: "Q2", result_slug: "r2", feedback_type: "irrelevant" }));
    const exported = exportForEval();
    expect(exported).toHaveLength(2);
  });
});
