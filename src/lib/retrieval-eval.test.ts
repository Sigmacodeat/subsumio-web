import { describe, it, expect } from "vitest";
import {
  runRetrievalEval,
  computeGradedRelevance,
  isPassageMatch,
  isSupportingTextFound,
  matchesNegativeAuthority,
  computeNdcg,
  generateRetrievalReport,
  DACH_RETRIEVAL_FIXTURES,
  RETRIEVAL_FIXTURE_VERSION,
  DEFAULT_K,
  type RetrievedPassage,
  type RetrievalEvalFixture,
  type RetrieverFn,
  type SourceType,
} from "./retrieval-eval";

function makePassage(slug: string, opts: Partial<RetrievedPassage> = {}): RetrievedPassage {
  const parts = slug.split("/");
  return {
    slug,
    text: opts.text ?? "",
    source_type: opts.source_type ?? "statute",
    section: opts.section,
    law: opts.law ?? parts[3]?.toUpperCase(),
    jurisdiction: opts.jurisdiction ?? parts[2]?.toUpperCase(),
  };
}

function makeFixture(
  id: string,
  slugs: string[],
  opts: Partial<RetrievalEvalFixture> = {}
): RetrievalEvalFixture {
  return {
    id,
    query: `q-${id}`,
    jurisdiction: opts.jurisdiction ?? "DE",
    category: opts.category ?? "statute",
    expected_passages: slugs.map((s) => ({ slug: s, relevance: 3 as const })),
    expected_source_types: opts.expected_source_types ?? ["statute"],
    negative_authorities: opts.negative_authorities,
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────

describe("DACH_RETRIEVAL_FIXTURES", () => {
  it("has >= 10 fixtures with unique ids", () => {
    expect(DACH_RETRIEVAL_FIXTURES.length).toBeGreaterThanOrEqual(10);
    const ids = DACH_RETRIEVAL_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers DE, AT, CH", () => {
    const j = new Set(DACH_RETRIEVAL_FIXTURES.map((f) => f.jurisdiction));
    expect(j.has("DE")).toBe(true);
    expect(j.has("AT")).toBe(true);
    expect(j.has("CH")).toBe(true);
  });

  it("DE fixtures have negative authorities for AT", () => {
    for (const f of DACH_RETRIEVAL_FIXTURES.filter((f) => f.jurisdiction === "DE")) {
      expect(f.negative_authorities?.length).toBeGreaterThan(0);
    }
  });

  it("all fixtures have >= 1 expected_passage and >= 1 source_type", () => {
    for (const f of DACH_RETRIEVAL_FIXTURES) {
      expect(f.expected_passages.length).toBeGreaterThan(0);
      expect(f.expected_source_types.length).toBeGreaterThan(0);
    }
  });
});

describe("RETRIEVAL_FIXTURE_VERSION", () => {
  it("is semver", () => expect(RETRIEVAL_FIXTURE_VERSION).toMatch(/^\d+\.\d+\.\d+$/));
});

// ── isPassageMatch ─────────────────────────────────────────────────────

describe("isPassageMatch", () => {
  it("exact slug match", () => {
    expect(
      isPassageMatch(makePassage("legal/norms/de/bgb/433"), { slug: "legal/norms/de/bgb/433" })
    ).toBe(true);
  });
  it("slug + section match", () => {
    expect(
      isPassageMatch(makePassage("legal/norms/de/bgb/433", { section: "§ 433" }), {
        slug: "legal/norms/de/bgb/433",
        section: "§ 433",
      })
    ).toBe(true);
  });
  it("slug match, section mismatch", () => {
    expect(
      isPassageMatch(makePassage("legal/norms/de/bgb/433", { section: "§ 433" }), {
        slug: "legal/norms/de/bgb/433",
        section: "§ 434",
      })
    ).toBe(false);
  });
  it("different slugs", () => {
    expect(
      isPassageMatch(makePassage("legal/norms/de/bgb/433"), { slug: "legal/norms/de/bgb/195" })
    ).toBe(false);
  });
  it("normalizes section format", () => {
    expect(
      isPassageMatch(makePassage("legal/norms/de/bgb/433", { section: "§433" }), {
        slug: "legal/norms/de/bgb/433",
        section: "§ 433",
      })
    ).toBe(true);
  });
});

// ── isSupportingTextFound ──────────────────────────────────────────────

describe("isSupportingTextFound", () => {
  it("found case-insensitive", () => {
    expect(
      isSupportingTextFound(makePassage("s", { text: "frei von Sachmängeln" }), {
        slug: "s",
        supporting_text: "SACHMÄNGEL",
      })
    ).toBe(true);
  });
  it("not found", () => {
    expect(
      isSupportingTextFound(makePassage("s", { text: "unrelated" }), {
        slug: "s",
        supporting_text: "Sachmangel",
      })
    ).toBe(false);
  });
  it("no supporting_text → false", () => {
    expect(isSupportingTextFound(makePassage("s", { text: "text" }), { slug: "s" })).toBe(false);
  });
});

// ── matchesNegativeAuthority ───────────────────────────────────────────

describe("matchesNegativeAuthority", () => {
  it("exact match", () => expect(matchesNegativeAuthority("a/b/c", "a/b/c")).toBe(true));
  it("no match", () => expect(matchesNegativeAuthority("a/b/c", "a/b/d")).toBe(false));
  it("prefix match with *", () => expect(matchesNegativeAuthority("a/b/c", "a/b/*")).toBe(true));
  it("prefix no match", () => expect(matchesNegativeAuthority("a/b/c", "x/*")).toBe(false));
});

// ── computeGradedRelevance ─────────────────────────────────────────────

describe("computeGradedRelevance", () => {
  it("3 for exact slug+section", () => {
    expect(
      computeGradedRelevance(makePassage("legal/norms/de/bgb/433", { section: "§ 433" }), [
        { slug: "legal/norms/de/bgb/433", section: "§ 433", relevance: 3 },
      ])
    ).toBe(3);
  });
  it("2 for slug match no sections", () => {
    expect(
      computeGradedRelevance(makePassage("legal/norms/de/bgb/433"), [
        { slug: "legal/norms/de/bgb/433" },
      ])
    ).toBe(2);
  });
  it("1 for same law different §", () => {
    expect(
      computeGradedRelevance(makePassage("legal/norms/de/bgb/195"), [
        { slug: "legal/norms/de/bgb/433" },
      ])
    ).toBe(1);
  });
  it("0 for no match", () => {
    expect(
      computeGradedRelevance(makePassage("legal/norms/at/abgb/1489"), [
        { slug: "legal/norms/de/bgb/433" },
      ])
    ).toBe(0);
  });
});

// ── computeNdcg ────────────────────────────────────────────────────────

describe("computeNdcg", () => {
  it("1.0 for perfect ranking", () => {
    const r = [
      makePassage("legal/norms/de/bgb/433", { section: "§ 433" }),
      makePassage("legal/norms/de/bgb/195", { section: "§ 195" }),
    ];
    const e = [
      { slug: "legal/norms/de/bgb/433", section: "§ 433", relevance: 3 as const },
      { slug: "legal/norms/de/bgb/195", section: "§ 195", relevance: 3 as const },
    ];
    expect(computeNdcg(r, e, 10)).toBeCloseTo(1.0, 5);
  });
  it("0 for no matches", () => {
    expect(
      computeNdcg(
        [makePassage("legal/norms/at/abgb/1489")],
        [{ slug: "legal/norms/de/bgb/433", relevance: 3 as const }],
        10
      )
    ).toBe(0);
  });
  it("partial match between 0 and 1", () => {
    const r = [
      makePassage("legal/norms/at/abgb/1489"),
      makePassage("legal/norms/de/bgb/433", { section: "§ 433" }),
    ];
    const e = [{ slug: "legal/norms/de/bgb/433", section: "§ 433", relevance: 3 as const }];
    const ndcg = computeNdcg(r, e, 10);
    expect(ndcg).toBeGreaterThan(0);
    expect(ndcg).toBeLessThan(1);
  });
});

// ── runRetrievalEval — Basic ───────────────────────────────────────────

describe("runRetrievalEval — basic", () => {
  it("returns summary with all metrics 0-1", async () => {
    const summary = await runRetrievalEval(
      async () => [],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(summary.totalQueries).toBe(1);
    for (const v of [
      summary.overallRecall,
      summary.overallPrecision,
      summary.overallMrr,
      summary.overallNdcg,
      summary.overallSourceTypeCoverage,
      summary.overallPassageSupportRate,
      summary.overallNegativeAuthorityRecall,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("includes fixtureVersion, timestamp, k", async () => {
    const summary = await runRetrievalEval(async () => [], [makeFixture("t1", ["s"])], { k: 5 });
    expect(summary.fixtureVersion).toBe(RETRIEVAL_FIXTURE_VERSION);
    expect(summary.timestamp).toMatch(/^\d{4}-/);
    expect(summary.k).toBe(5);
  });

  it("defaults to K=20", async () => {
    const retriever: RetrieverFn = async () =>
      Array.from({ length: 25 }, (_, i) => makePassage(`legal/norms/de/bgb/${100 + i}`));
    const summary = await runRetrievalEval(retriever, [
      makeFixture("t1", ["legal/norms/de/bgb/433"]),
    ]);
    expect(summary.k).toBe(DEFAULT_K);
    expect(summary.results[0]!.retrievedCount).toBe(20);
  });
});

// ── runRetrievalEval — Recall@k ────────────────────────────────────────

describe("runRetrievalEval — Recall@k", () => {
  it("recall=1 when all found", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433"), makePassage("legal/norms/de/bgb/195")],
      [makeFixture("t1", ["legal/norms/de/bgb/433", "legal/norms/de/bgb/195"])]
    );
    expect(s.results[0]!.recallAtK).toBe(1);
  });
  it("recall=0.5 when half found", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433"), makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433", "legal/norms/de/bgb/195"])]
    );
    expect(s.results[0]!.recallAtK).toBe(0.5);
  });
  it("recall=0 when none found", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.recallAtK).toBe(0);
  });
  it("recall is passage-level, NOT law-level (top-20 law hit alone does not count)", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/100")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.recallAtK).toBe(0);
  });
});

// ── runRetrievalEval — Precision@k ─────────────────────────────────────

describe("runRetrievalEval — Precision@k", () => {
  it("precision=1 all relevant", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.precisionAtK).toBe(1);
  });
  it("precision=0 none relevant", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.precisionAtK).toBe(0);
  });
  it("precision=0.5 half relevant", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433"), makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.precisionAtK).toBe(0.5);
  });
});

// ── runRetrievalEval — MRR ─────────────────────────────────────────────

describe("runRetrievalEval — MRR", () => {
  it("MRR=1 first relevant", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433"), makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.mrr).toBe(1);
  });
  it("MRR=0.5 second relevant", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/at/abgb/1489"), makePassage("legal/norms/de/bgb/433")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.mrr).toBe(0.5);
  });
  it("MRR=0 none relevant", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.mrr).toBe(0);
  });
});

// ── runRetrievalEval — nDCG ────────────────────────────────────────────

describe("runRetrievalEval — nDCG", () => {
  it("nDCG=1 perfect ranking", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [
          { slug: "legal/norms/de/bgb/433", section: "§ 433", relevance: 3 },
          { slug: "legal/norms/de/bgb/195", section: "§ 195", relevance: 3 },
        ],
        expected_source_types: ["statute"],
      },
    ];
    const s = await runRetrievalEval(
      async () => [
        makePassage("legal/norms/de/bgb/433", { section: "§ 433" }),
        makePassage("legal/norms/de/bgb/195", { section: "§ 195" }),
      ],
      f
    );
    expect(s.results[0]!.ndcgAtK).toBeCloseTo(1.0, 5);
  });
  it("nDCG=0 no matches", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.ndcgAtK).toBe(0);
  });
});

// ── runRetrievalEval — Source-type coverage ────────────────────────────

describe("runRetrievalEval — Source-type coverage", () => {
  it("coverage=1 all types present", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433" }],
        expected_source_types: ["statute", "procedure"] as SourceType[],
      },
    ];
    const s = await runRetrievalEval(
      async () => [
        makePassage("legal/norms/de/bgb/433", { source_type: "statute" }),
        makePassage("legal/norms/de/zpo/517", { source_type: "procedure" }),
      ],
      f
    );
    expect(s.results[0]!.sourceTypeCoverage).toBe(1);
  });
  it("coverage=0.5 half types present", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433" }],
        expected_source_types: ["statute", "case_law"] as SourceType[],
      },
    ];
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433", { source_type: "statute" })],
      f
    );
    expect(s.results[0]!.sourceTypeCoverage).toBe(0.5);
    expect(s.results[0]!.missingSourceTypes).toEqual(["case_law"]);
  });
});

// ── runRetrievalEval — Passage support rate ────────────────────────────

describe("runRetrievalEval — Passage support rate", () => {
  it("support=1 when text found", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433", supporting_text: "Sachmängeln" }],
        expected_source_types: ["statute"],
      },
    ];
    const s = await runRetrievalEval(
      async () => [
        makePassage("legal/norms/de/bgb/433", { text: "frei von Sachmängeln zu verschaffen" }),
      ],
      f
    );
    expect(s.results[0]!.passageSupportRate).toBe(1);
  });
  it("support=0 when text not found", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433", supporting_text: "Sachmängeln" }],
        expected_source_types: ["statute"],
      },
    ];
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433", { text: "unrelated" })],
      f
    );
    expect(s.results[0]!.passageSupportRate).toBe(0);
  });
  it("defaults to 1 when no supporting_text", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.passageSupportRate).toBe(1);
  });
  it("support=0.5 when half found", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [
          { slug: "legal/norms/de/bgb/433", supporting_text: "Sachmängeln" },
          { slug: "legal/norms/de/bgb/195", supporting_text: "Verjährung" },
        ],
        expected_source_types: ["statute"],
      },
    ];
    const s = await runRetrievalEval(
      async () => [
        makePassage("legal/norms/de/bgb/433", { text: "Sachmängeln" }),
        makePassage("legal/norms/de/bgb/195", { text: "unrelated" }),
      ],
      f
    );
    expect(s.results[0]!.passageSupportRate).toBe(0.5);
  });
});

// ── runRetrievalEval — Negative-authority recall ───────────────────────

describe("runRetrievalEval — Negative-authority recall", () => {
  it("1.0 when no wrong authority in top-k", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433" }],
        expected_source_types: ["statute"],
        negative_authorities: [{ pattern: "legal/norms/at/abgb/*", reason: "ABGB" }],
      },
    ];
    const s = await runRetrievalEval(async () => [makePassage("legal/norms/de/bgb/433")], f);
    expect(s.results[0]!.negativeAuthorityRecall).toBe(1.0);
    expect(s.results[0]!.negativeAuthorityHits).toHaveLength(0);
  });
  it("<1.0 when wrong authority in top-k", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433" }],
        expected_source_types: ["statute"],
        negative_authorities: [{ pattern: "legal/norms/at/abgb/*", reason: "ABGB" }],
      },
    ];
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433"), makePassage("legal/norms/at/abgb/1489")],
      f
    );
    expect(s.results[0]!.negativeAuthorityRecall).toBeLessThan(1.0);
    expect(s.results[0]!.negativeAuthorityHits).toHaveLength(1);
    expect(s.results[0]!.negativeAuthorityHits[0]!.rank).toBe(2);
  });
  it("defaults to 1.0 when no negative authorities", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.negativeAuthorityRecall).toBe(1.0);
  });
});

// ── runRetrievalEval — Pass/Fail ───────────────────────────────────────

describe("runRetrievalEval — Pass/Fail", () => {
  it("passes when all thresholds met", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433", supporting_text: "Sachmängeln" }],
        expected_source_types: ["statute"],
        negative_authorities: [{ pattern: "legal/norms/at/abgb/*", reason: "ABGB" }],
      },
    ];
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433", { text: "Sachmängeln" })],
      f
    );
    expect(s.results[0]!.pass).toBe(true);
    expect(s.passedQueries).toBe(1);
    expect(s.passRate).toBe(1);
  });
  it("fails when recall below threshold", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/at/abgb/1489")],
      [makeFixture("t1", ["legal/norms/de/bgb/433", "legal/norms/de/bgb/195"])],
      { minRecall: 0.5 }
    );
    expect(s.results[0]!.pass).toBe(false);
  });
  it("fails when negative authority appears", async () => {
    const f: RetrievalEvalFixture[] = [
      {
        id: "t1",
        query: "q",
        jurisdiction: "DE",
        category: "statute",
        expected_passages: [{ slug: "legal/norms/de/bgb/433" }],
        expected_source_types: ["statute"],
        negative_authorities: [{ pattern: "legal/norms/at/abgb/*", reason: "ABGB" }],
      },
    ];
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433"), makePassage("legal/norms/at/abgb/1489")],
      f,
      { minNegativeAuthorityRecall: 1.0 }
    );
    expect(s.results[0]!.pass).toBe(false);
  });
});

// ── runRetrievalEval — Error handling ──────────────────────────────────

describe("runRetrievalEval — Error handling", () => {
  it("throws when tolerateErrors=false", async () => {
    await expect(
      runRetrievalEval(async () => {
        throw new Error("boom");
      }, [makeFixture("t1", ["s"])])
    ).rejects.toThrow("boom");
  });
  it("tolerates errors when tolerateErrors=true", async () => {
    const s = await runRetrievalEval(
      async () => {
        throw new Error("boom");
      },
      [makeFixture("t1", ["s"])],
      { tolerateErrors: true }
    );
    expect(s.results[0]!.recallAtK).toBe(0);
  });
  it("handles empty results", async () => {
    const s = await runRetrievalEval(
      async () => [],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    expect(s.results[0]!.recallAtK).toBe(0);
    expect(s.results[0]!.precisionAtK).toBe(0);
    expect(s.results[0]!.mrr).toBe(0);
    expect(s.results[0]!.ndcgAtK).toBe(0);
    expect(s.results[0]!.sourceTypeCoverage).toBe(0);
    expect(s.results[0]!.passageSupportRate).toBe(1);
    expect(s.results[0]!.negativeAuthorityRecall).toBe(1);
  });
});

// ── runRetrievalEval — Aggregation ─────────────────────────────────────

describe("runRetrievalEval — Aggregation", () => {
  it("groups by jurisdiction", async () => {
    const fixtures = [
      makeFixture("de1", ["legal/norms/de/bgb/433"], { jurisdiction: "DE" }),
      makeFixture("at1", ["legal/norms/at/abgb/1489"], { jurisdiction: "AT" }),
    ];
    const s = await runRetrievalEval(
      async (q) =>
        q.includes("de1")
          ? [makePassage("legal/norms/de/bgb/433")]
          : [makePassage("legal/norms/at/abgb/1489")],
      fixtures
    );
    expect(s.byJurisdiction["DE"]!.count).toBe(1);
    expect(s.byJurisdiction["AT"]!.count).toBe(1);
  });
  it("groups by category", async () => {
    const fixtures = [
      makeFixture("t1", ["legal/norms/de/bgb/433"], { category: "statute" }),
      makeFixture("t2", ["legal/norms/de/zpo/517"], { category: "procedure" }),
    ];
    const s = await runRetrievalEval(
      async (q) =>
        q.includes("t1")
          ? [makePassage("legal/norms/de/bgb/433")]
          : [makePassage("legal/norms/de/zpo/517")],
      fixtures
    );
    expect(s.byCategory["statute"]!.count).toBe(1);
    expect(s.byCategory["procedure"]!.count).toBe(1);
  });
});

// ── generateRetrievalReport ────────────────────────────────────────────

describe("generateRetrievalReport", () => {
  it("generates readable report", async () => {
    const s = await runRetrievalEval(
      async () => [makePassage("legal/norms/de/bgb/433")],
      [makeFixture("t1", ["legal/norms/de/bgb/433"])]
    );
    const report = generateRetrievalReport(s);
    expect(report).toContain("Retrieval Evaluation Report");
    expect(report).toContain("Recall@");
    expect(report).toContain("Precision@");
    expect(report).toContain("MRR");
    expect(report).toContain("nDCG");
    expect(report).toContain("Source-type Coverage");
    expect(report).toContain("Passage Support Rate");
    expect(report).toContain("Negative-Auth Recall");
  });
});
