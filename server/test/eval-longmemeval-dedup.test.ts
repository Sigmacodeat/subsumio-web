import { describe, it, expect } from "vitest";
import type { SearchResult } from "../src/core/types.ts";
import { dedupBySlug } from "../src/commands/eval-longmemeval.ts";

function makeResult(
  slug: string,
  score: number,
  overrides: Partial<SearchResult> = {}
): SearchResult {
  return {
    slug,
    page_id: 1,
    title: `Test ${slug}`,
    type: "note",
    chunk_text: `chunk for ${slug}`,
    chunk_source: "compiled_truth",
    chunk_id: 1,
    chunk_index: 0,
    score,
    stale: false,
    ...overrides,
  };
}

describe("dedupBySlug", () => {
  it("keeps only the highest-scoring chunk per slug", () => {
    const results = [
      makeResult("chat/session-a", 0.8),
      makeResult("chat/session-a", 0.9), // higher score → should win
      makeResult("chat/session-a", 0.7),
      makeResult("chat/session-b", 0.85),
    ];

    const deduped = dedupBySlug(results, 10);

    expect(deduped.length).toBe(2);
    expect(deduped[0].slug).toBe("chat/session-a");
    expect(deduped[0].score).toBe(0.9);
    expect(deduped[1].slug).toBe("chat/session-b");
    expect(deduped[1].score).toBe(0.85);
  });

  it("sorts results by score descending", () => {
    const results = [
      makeResult("chat/low", 0.5),
      makeResult("chat/high", 0.95),
      makeResult("chat/mid", 0.7),
    ];

    const deduped = dedupBySlug(results, 10);

    expect(deduped[0].score).toBe(0.95);
    expect(deduped[1].score).toBe(0.7);
    expect(deduped[2].score).toBe(0.5);
  });

  it("truncates to topK after dedup", () => {
    const results = [
      makeResult("chat/s1", 0.9),
      makeResult("chat/s2", 0.8),
      makeResult("chat/s3", 0.7),
      makeResult("chat/s4", 0.6),
      makeResult("chat/s5", 0.5),
    ];

    const deduped = dedupBySlug(results, 3);

    expect(deduped.length).toBe(3);
    expect(deduped[0].slug).toBe("chat/s1");
    expect(deduped[1].slug).toBe("chat/s2");
    expect(deduped[2].slug).toBe("chat/s3");
  });

  it("simulates nightly-7: 3 sessions with chunk crowding", () => {
    // Simulate the nightly-7 scenario: 3 sessions (s1, s2, s3), but
    // session s1 and s2 each produce 4 chunks, filling the top-8 slots
    // and pushing s3 out entirely.
    const results = [
      makeResult("chat/nightly-7-s1", 0.92),
      makeResult("chat/nightly-7-s1", 0.88),
      makeResult("chat/nightly-7-s1", 0.85),
      makeResult("chat/nightly-7-s1", 0.82),
      makeResult("chat/nightly-7-s2", 0.9),
      makeResult("chat/nightly-7-s2", 0.87),
      makeResult("chat/nightly-7-s2", 0.84),
      makeResult("chat/nightly-7-s2", 0.81),
      // s3 is at position 9 — would be cut off by limit:8
      makeResult("chat/nightly-7-s3", 0.78),
    ];

    // Without dedup: top-8 would be s1×4 + s2×4, missing s3 entirely.
    // With dedup (topK=8, but we over-retrieved 9):
    const deduped = dedupBySlug(results, 8);

    expect(deduped.length).toBe(3);
    const slugs = deduped.map((r) => r.slug);
    expect(slugs).toContain("chat/nightly-7-s1");
    expect(slugs).toContain("chat/nightly-7-s2");
    expect(slugs).toContain("chat/nightly-7-s3");
  });

  it("handles empty results array", () => {
    const deduped = dedupBySlug([], 10);
    expect(deduped.length).toBe(0);
  });

  it("handles single result", () => {
    const deduped = dedupBySlug([makeResult("chat/only", 0.9)], 10);
    expect(deduped.length).toBe(1);
    expect(deduped[0].slug).toBe("chat/only");
  });

  it("handles all results from same slug", () => {
    const results = [
      makeResult("chat/same", 0.8),
      makeResult("chat/same", 0.9),
      makeResult("chat/same", 0.7),
    ];

    const deduped = dedupBySlug(results, 10);

    expect(deduped.length).toBe(1);
    expect(deduped[0].score).toBe(0.9);
  });

  it("topK=1 returns only the best session", () => {
    const results = [
      makeResult("chat/s1", 0.8),
      makeResult("chat/s2", 0.95),
      makeResult("chat/s3", 0.7),
    ];

    const deduped = dedupBySlug(results, 1);

    expect(deduped.length).toBe(1);
    expect(deduped[0].slug).toBe("chat/s2");
  });

  it("preserves relative ordering when scores are equal (stable sort)", () => {
    const results = [
      makeResult("chat/first", 0.8),
      makeResult("chat/second", 0.8),
      makeResult("chat/third", 0.8),
    ];

    const deduped = dedupBySlug(results, 10);

    // All same score → original order preserved (stable sort)
    expect(deduped[0].slug).toBe("chat/first");
    expect(deduped[1].slug).toBe("chat/second");
    expect(deduped[2].slug).toBe("chat/third");
  });

  it("handles topK larger than unique slugs", () => {
    const results = [makeResult("chat/s1", 0.9), makeResult("chat/s2", 0.8)];

    const deduped = dedupBySlug(results, 100);

    expect(deduped.length).toBe(2);
  });

  it("handles NaN scores (NaN treated as lowest)", () => {
    const results = [
      makeResult("chat/s1", NaN),
      makeResult("chat/s2", 0.8),
      makeResult("chat/s1", 0.9), // overrides NaN for s1
    ];

    const deduped = dedupBySlug(results, 10);

    expect(deduped.length).toBe(2);
    // s1's best non-NaN chunk (0.90) should be kept
    const s1 = deduped.find((r) => r.slug === "chat/s1");
    expect(s1?.score).toBe(0.9);
  });
});
