import { describe, it, expect, vi } from "vitest";
import {
  submitFeedback,
  getFeedbackForOrg,
  getFeedbackForBrain,
  getFeedbackForQuery,
  getFeedbackForSlug,
  feedbackFromPage,
  getFeedbackStats,
  getFeedbackBoosts,
  exportForEval,
  validateFeedback,
  FEEDBACK_PAGE_TYPE,
  type RetrievalFeedback,
  type FeedbackType,
  type FeedbackSeverity,
} from "@/lib/retrieval-feedback";

// ── Fixtures ──────────────────────────────────────────────────────────

type FeedbackInput = Omit<RetrievalFeedback, "id" | "query_hash" | "created_at">;

function makeFeedback(overrides: Partial<FeedbackInput> = {}): FeedbackInput {
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

function makeEntry(overrides: Partial<RetrievalFeedback> = {}): RetrievalFeedback {
  return {
    id: "retrieval-feedback/org-1/abc123",
    query: "Lieferverzug BGB",
    query_hash: "q1",
    result_slug: "test/case-1",
    result_title: "Musterfall Lieferverzug",
    feedback_type: "relevant" as FeedbackType,
    severity: "medium" as FeedbackSeverity,
    user_id: "user-1",
    brain_id: "brain-1",
    org_id: "org-1",
    created_at: "2026-06-20T12:00:00Z",
    ...overrides,
  };
}

interface FakePage {
  slug: string;
  frontmatter?: Record<string, unknown>;
}

function pageFor(entry: RetrievalFeedback): FakePage {
  return {
    slug: entry.id,
    frontmatter: { type: FEEDBACK_PAGE_TYPE, ...entry },
  };
}

/** In-test engine client: serves `pages` in limit/offset slices, records creates. */
function fakeBrain(pages: FakePage[] = []) {
  const created: Array<{
    slug: string;
    title: string;
    content?: string;
    type?: string;
    frontmatter?: Record<string, unknown>;
  }> = [];
  const listPages = vi.fn(
    async (opts: { type: string; limit: number; offset: number }): Promise<unknown[]> =>
      opts.type === FEEDBACK_PAGE_TYPE ? pages.slice(opts.offset, opts.offset + opts.limit) : []
  );
  const createPage = vi.fn(async (page: (typeof created)[number]): Promise<{ slug: string }> => {
    created.push(page);
    return { slug: page.slug };
  });
  return { created, listPages, createPage };
}

// ── Validation ────────────────────────────────────────────────────────

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

// ── Submit (engine write) ─────────────────────────────────────────────

describe("Retrieval Feedback — Submit", () => {
  it("persists feedback as retrieval_feedback page and returns the entry", async () => {
    const brain = fakeBrain();
    const entry = await submitFeedback(brain, makeFeedback());

    expect(entry.id).toMatch(/^retrieval-feedback\/org-1\//);
    expect(entry.query_hash).toBeDefined();
    expect(entry.created_at).toBeDefined();
    expect(entry.query).toBe("Lieferverzug BGB");
    expect(entry.feedback_type).toBe("relevant");

    expect(brain.createPage).toHaveBeenCalledTimes(1);
    const page = brain.created[0];
    expect(page.slug).toBe(entry.id);
    expect(page.type).toBe(FEEDBACK_PAGE_TYPE);
    const fm = page.frontmatter as Record<string, unknown>;
    expect(fm.type).toBe(FEEDBACK_PAGE_TYPE);
    expect(fm.org_id).toBe("org-1");
    expect(fm.brain_id).toBe("brain-1");
    expect(fm.user_id).toBe("user-1");
    expect(fm.query_hash).toBe(entry.query_hash);
    expect(fm.feedback_type).toBe("relevant");
  });

  it("stores the comment as page body for full-text search", async () => {
    const brain = fakeBrain();
    await submitFeedback(brain, makeFeedback({ comment: "Ergebnis veraltet" }));
    expect(brain.created[0].content).toBe("Ergebnis veraltet");
    expect(brain.created[0].frontmatter?.comment).toBe("Ergebnis veraltet");
  });

  it("sanitizes exotic org ids inside the slug", async () => {
    const brain = fakeBrain();
    const entry = await submitFeedback(brain, makeFeedback({ org_id: "org/bös€" }));
    expect(entry.id).toMatch(/^retrieval-feedback\/[a-zA-Z0-9_-]+\//);
  });

  it("propagates engine errors so the route can answer 5xx", async () => {
    const brain = fakeBrain();
    brain.createPage.mockRejectedValueOnce(new Error("engine down"));
    await expect(submitFeedback(brain, makeFeedback())).rejects.toThrow("engine down");
  });
});

// ── Page → entry mapping ──────────────────────────────────────────────

describe("Retrieval Feedback — feedbackFromPage", () => {
  it("maps a well-formed page", () => {
    const entry = feedbackFromPage(pageFor(makeEntry()));
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("retrieval-feedback/org-1/abc123");
    expect(entry!.feedback_type).toBe("relevant");
  });

  it("skips tombstoned pages", () => {
    const page = pageFor(makeEntry());
    page.frontmatter = { ...page.frontmatter, status: "tombstoned" };
    expect(feedbackFromPage(page)).toBeNull();
  });

  it("skips pages without a recognizable feedback_type", () => {
    expect(feedbackFromPage({ slug: "x", frontmatter: { feedback_type: "meh" } })).toBeNull();
    expect(feedbackFromPage({ slug: "x", frontmatter: {} })).toBeNull();
    expect(feedbackFromPage({ slug: "x" })).toBeNull();
  });
});

// ── Tenant-isolated reads ─────────────────────────────────────────────

describe("Retrieval Feedback — Org/Brain Access", () => {
  it("getFeedbackForOrg returns only the caller's org entries", async () => {
    const brain = fakeBrain([
      pageFor(makeEntry({ id: "retrieval-feedback/org-1/a", org_id: "org-1" })),
      pageFor(makeEntry({ id: "retrieval-feedback/org-2/b", org_id: "org-2" })),
    ]);
    const result = await getFeedbackForOrg(brain, "org-1");
    expect(result).toHaveLength(1);
    expect(result[0].org_id).toBe("org-1");
  });

  it("getFeedbackForBrain returns only the caller's brain entries", async () => {
    const brain = fakeBrain([
      pageFor(makeEntry({ id: "a", brain_id: "brain-1" })),
      pageFor(makeEntry({ id: "b", brain_id: "brain-2" })),
    ]);
    expect(await getFeedbackForBrain(brain, "brain-1")).toHaveLength(1);
    expect(await getFeedbackForBrain(brain, "brain-2")).toHaveLength(1);
    expect(await getFeedbackForBrain(brain, "brain-3")).toHaveLength(0);
  });

  it("returns an empty list when no feedback exists", async () => {
    const brain = fakeBrain();
    const result = await getFeedbackForOrg(brain, "org-1");
    expect(result).toEqual([]);
  });

  it("skips tombstoned and malformed pages", async () => {
    const brain = fakeBrain([
      pageFor(makeEntry({ id: "a" })),
      { slug: "b", frontmatter: { status: "tombstoned", org_id: "org-1" } },
      { slug: "c", frontmatter: { unrelated: true } },
    ]);
    const result = await getFeedbackForOrg(brain, "org-1");
    expect(result.map((f) => f.id)).toEqual(["a"]);
  });

  it("sorts newest first and pages through batches of 100", async () => {
    const pages: FakePage[] = Array.from({ length: 150 }, (_, i) =>
      pageFor(
        makeEntry({
          id: `retrieval-feedback/org-1/e${i}`,
          created_at: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
        })
      )
    );
    const brain = fakeBrain(pages);
    const result = await getFeedbackForOrg(brain, "org-1");
    expect(result).toHaveLength(150);
    expect(brain.listPages.mock.calls.length).toBeGreaterThan(1);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].created_at >= result[i].created_at).toBe(true);
    }
  });

  it("honours the limit option", async () => {
    const pages: FakePage[] = Array.from({ length: 150 }, (_, i) =>
      pageFor(makeEntry({ id: `e${i}` }))
    );
    const brain = fakeBrain(pages);
    const result = await getFeedbackForOrg(brain, "org-1", { limit: 50 });
    expect(result).toHaveLength(50);
  });

  it("propagates list errors so the route can answer 5xx", async () => {
    const brain = fakeBrain();
    brain.listPages.mockRejectedValueOnce(new Error("engine down"));
    await expect(getFeedbackForOrg(brain, "org-1")).rejects.toThrow("engine down");
  });
});

// ── Pure filters ──────────────────────────────────────────────────────

describe("Retrieval Feedback — Query/Slug filters", () => {
  it("getFeedbackForQuery groups by query hash", async () => {
    // query_hash is derived from the query text on submit — entries must
    // come through submitFeedback for the hash to be real.
    const brain = fakeBrain();
    const e1 = await submitFeedback(brain, makeFeedback({ query: "Lieferverzug" }));
    const e2 = await submitFeedback(
      brain,
      makeFeedback({ query: "Lieferverzug", result_slug: "test/other" })
    );
    const e3 = await submitFeedback(brain, makeFeedback({ query: "Kündigung" }));
    const filtered = getFeedbackForQuery([e1, e2, e3], "Lieferverzug");
    expect(filtered.map((f) => f.result_slug).sort()).toEqual(["test/case-1", "test/other"]);
  });

  it("getFeedbackForSlug returns matching entries", () => {
    const list = [
      makeEntry({ result_slug: "test/case-1" }),
      makeEntry({ result_slug: "test/case-1", feedback_type: "irrelevant" }),
      makeEntry({ result_slug: "test/case-2" }),
    ];
    expect(getFeedbackForSlug(list, "test/case-1")).toHaveLength(2);
  });
});

// ── Stats ─────────────────────────────────────────────────────────────

describe("Retrieval Feedback — Stats", () => {
  it("returns empty stats for no feedback", () => {
    const stats = getFeedbackStats([]);
    expect(stats.total_feedback).toBe(0);
    expect(stats.satisfaction_rate).toBe(0);
  });

  it("counts feedback by type", () => {
    const stats = getFeedbackStats([
      makeEntry({ feedback_type: "relevant" }),
      makeEntry({ feedback_type: "relevant" }),
      makeEntry({ feedback_type: "irrelevant" }),
      makeEntry({ feedback_type: "outdated" }),
      makeEntry({ feedback_type: "wrong" }),
    ]);
    expect(stats.by_type.relevant).toBe(2);
    expect(stats.by_type.irrelevant).toBe(1);
    expect(stats.by_type.outdated).toBe(1);
    expect(stats.by_type.wrong).toBe(1);
  });

  it("counts feedback by severity", () => {
    const stats = getFeedbackStats([
      makeEntry({ severity: "low" }),
      makeEntry({ severity: "medium" }),
      makeEntry({ severity: "high" }),
    ]);
    expect(stats.by_severity.low).toBe(1);
    expect(stats.by_severity.medium).toBe(1);
    expect(stats.by_severity.high).toBe(1);
  });

  it("calculates satisfaction rate", () => {
    const stats = getFeedbackStats([
      makeEntry({ feedback_type: "relevant" }),
      makeEntry({ feedback_type: "relevant" }),
      makeEntry({ feedback_type: "irrelevant" }),
      makeEntry({ feedback_type: "wrong" }),
    ]);
    expect(stats.satisfaction_rate).toBe(0.5);
  });

  it("identifies problematic results", () => {
    const stats = getFeedbackStats([
      makeEntry({ result_slug: "test/bad", feedback_type: "wrong", severity: "high" }),
      makeEntry({ result_slug: "test/bad", feedback_type: "outdated" }),
      makeEntry({ result_slug: "test/good", feedback_type: "relevant" }),
    ]);
    expect(stats.problematic_results).toHaveLength(1);
    expect(stats.problematic_results[0].result_slug).toBe("test/bad");
    expect(stats.problematic_results[0].negative_count).toBe(2);
  });

  it("identifies problematic queries", () => {
    const stats = getFeedbackStats([
      makeEntry({ query: "bad query", query_hash: "hb", feedback_type: "irrelevant" }),
      makeEntry({ query: "bad query", query_hash: "hb", feedback_type: "wrong" }),
      makeEntry({ query: "good query", query_hash: "hg", feedback_type: "relevant" }),
    ]);
    expect(stats.problematic_queries).toHaveLength(1);
    expect(stats.problematic_queries[0].negative_count).toBe(2);
    expect(stats.problematic_queries[0].satisfaction_rate).toBe(0);
  });

  it("counts unique queries and results", () => {
    const stats = getFeedbackStats([
      makeEntry({ query: "q1", query_hash: "q1", result_slug: "r1" }),
      makeEntry({ query: "q1", query_hash: "q1", result_slug: "r2" }),
      makeEntry({ query: "q2", query_hash: "q2", result_slug: "r1" }),
    ]);
    expect(stats.unique_queries).toBe(2);
    expect(stats.unique_results).toBe(2);
  });
});

// ── Boost Signals ─────────────────────────────────────────────────────

describe("Retrieval Feedback — Boost Signals", () => {
  it("returns empty for no feedback", () => {
    expect(getFeedbackBoosts([])).toHaveLength(0);
  });

  it("returns positive boost for relevant feedback", () => {
    const boosts = getFeedbackBoosts([
      makeEntry({ result_slug: "test/good", feedback_type: "relevant" }),
      makeEntry({ result_slug: "test/good", feedback_type: "relevant" }),
    ]);
    expect(boosts).toHaveLength(1);
    expect(boosts[0].boost).toBeGreaterThan(0);
    expect(boosts[0].result_slug).toBe("test/good");
  });

  it("returns negative boost for wrong feedback", () => {
    const boosts = getFeedbackBoosts([
      makeEntry({ result_slug: "test/bad", feedback_type: "wrong", severity: "high" }),
      makeEntry({ result_slug: "test/bad", feedback_type: "wrong", severity: "high" }),
    ]);
    expect(boosts).toHaveLength(1);
    expect(boosts[0].boost).toBeLessThan(0);
  });

  it("filters results with < 2 feedback", () => {
    const boosts = getFeedbackBoosts([
      makeEntry({ result_slug: "test/one", feedback_type: "relevant" }),
    ]);
    expect(boosts).toHaveLength(0);
  });

  it("clamps boost to [-0.5, +0.5]", () => {
    const list = Array.from({ length: 20 }, () =>
      makeEntry({ result_slug: "test/boosted", feedback_type: "relevant", severity: "high" })
    );
    const boosts = getFeedbackBoosts(list);
    expect(boosts[0].boost).toBeLessThanOrEqual(0.5);
  });

  it("calculates confidence based on count", () => {
    const list = Array.from({ length: 10 }, () =>
      makeEntry({ result_slug: "test/confident", feedback_type: "relevant" })
    );
    const boosts = getFeedbackBoosts(list);
    expect(boosts[0].confidence).toBe(1);
  });

  it("sorts by absolute boost value", () => {
    const list = [
      makeEntry({ result_slug: "test/a", feedback_type: "relevant" }),
      makeEntry({ result_slug: "test/a", feedback_type: "relevant" }),
      ...Array.from({ length: 5 }, () =>
        makeEntry({ result_slug: "test/b", feedback_type: "wrong", severity: "high" })
      ),
    ];
    const boosts = getFeedbackBoosts(list);
    expect(Math.abs(boosts[0].boost)).toBeGreaterThanOrEqual(Math.abs(boosts[1].boost));
  });
});

// ── Eval Export ───────────────────────────────────────────────────────

describe("Retrieval Feedback — Eval Export", () => {
  it("exports empty for no feedback", () => {
    expect(exportForEval([])).toHaveLength(0);
  });

  it("groups by query and categorizes slugs", () => {
    const exported = exportForEval([
      makeEntry({ query: "Q1", query_hash: "Q1", result_slug: "r1", feedback_type: "relevant" }),
      makeEntry({ query: "Q1", query_hash: "Q1", result_slug: "r2", feedback_type: "irrelevant" }),
      makeEntry({ query: "Q1", query_hash: "Q1", result_slug: "r3", feedback_type: "outdated" }),
      makeEntry({ query: "Q1", query_hash: "Q1", result_slug: "r4", feedback_type: "wrong" }),
    ]);
    expect(exported).toHaveLength(1);
    expect(exported[0].relevant_slugs).toContain("r1");
    expect(exported[0].irrelevant_slugs).toContain("r2");
    expect(exported[0].outdated_slugs).toContain("r3");
    expect(exported[0].wrong_slugs).toContain("r4");
  });

  it("deduplicates slugs within same category", () => {
    const exported = exportForEval([
      makeEntry({ query: "Q1", query_hash: "Q1", result_slug: "r1", feedback_type: "relevant" }),
      makeEntry({ query: "Q1", query_hash: "Q1", result_slug: "r1", feedback_type: "relevant" }),
    ]);
    expect(exported[0].relevant_slugs).toHaveLength(1);
  });

  it("separates different queries", () => {
    const exported = exportForEval([
      makeEntry({ query: "Q1", query_hash: "Q1", result_slug: "r1", feedback_type: "relevant" }),
      makeEntry({ query: "Q2", query_hash: "Q2", result_slug: "r2", feedback_type: "irrelevant" }),
    ]);
    expect(exported).toHaveLength(2);
  });
});
