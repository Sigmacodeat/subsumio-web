// @vitest-environment node

import { describe, test, expect, vi, afterEach } from "vitest";
import {
  summarizeFeedback,
  promoteToFixture,
  type HumanReviewFeedback,
  type ReviewVerdict,
} from "./human-review";

function makeFeedback(overrides: Partial<HumanReviewFeedback> = {}): HumanReviewFeedback {
  return {
    id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source_endpoint: "/api/legal/chat",
    query: "What is the deadline for appeal?",
    answer_excerpt: "The deadline is 2 weeks...",
    verdict: "correct",
    reviewer_id: "user-123",
    reviewed_at: new Date().toISOString(),
    promoted_to_fixture: false,
    ...overrides,
  };
}

describe("summarizeFeedback — empty input", () => {
  test("returns zero counts for empty array", () => {
    const summary = summarizeFeedback([]);
    expect(summary.total).toBe(0);
    expect(summary.correct).toBe(0);
    expect(summary.incorrect).toBe(0);
    expect(summary.incomplete).toBe(0);
    expect(summary.accuracy_rate).toBe(0);
    expect(summary.recent).toEqual([]);
    expect(summary.by_endpoint).toEqual({});
  });
});

describe("summarizeFeedback — counts", () => {
  test("counts correct verdicts", () => {
    const feedback = [
      makeFeedback({ verdict: "correct" }),
      makeFeedback({ verdict: "correct" }),
      makeFeedback({ verdict: "incorrect" }),
    ];
    const summary = summarizeFeedback(feedback);
    expect(summary.total).toBe(3);
    expect(summary.correct).toBe(2);
    expect(summary.incorrect).toBe(1);
    expect(summary.incomplete).toBe(0);
  });

  test("counts incomplete verdicts", () => {
    const feedback = [
      makeFeedback({ verdict: "incomplete" }),
      makeFeedback({ verdict: "incomplete" }),
      makeFeedback({ verdict: "incomplete" }),
    ];
    const summary = summarizeFeedback(feedback);
    expect(summary.incomplete).toBe(3);
  });

  test("calculates accuracy_rate = correct / total", () => {
    const feedback = [
      makeFeedback({ verdict: "correct" }),
      makeFeedback({ verdict: "correct" }),
      makeFeedback({ verdict: "incorrect" }),
      makeFeedback({ verdict: "incomplete" }),
    ];
    const summary = summarizeFeedback(feedback);
    expect(summary.accuracy_rate).toBe(0.5);
  });

  test("accuracy_rate is 1.0 when all correct", () => {
    const feedback = [
      makeFeedback({ verdict: "correct" }),
      makeFeedback({ verdict: "correct" }),
    ];
    const summary = summarizeFeedback(feedback);
    expect(summary.accuracy_rate).toBe(1);
  });
});

describe("summarizeFeedback — recent", () => {
  test("returns up to 20 recent items", () => {
    const feedback = Array.from({ length: 25 }, (_, i) =>
      makeFeedback({ id: `review-${i}`, reviewed_at: new Date(2024, 0, i + 1).toISOString() }),
    );
    const summary = summarizeFeedback(feedback);
    expect(summary.recent).toHaveLength(20);
  });

  test("returns all items when fewer than 20", () => {
    const feedback = Array.from({ length: 5 }, () => makeFeedback());
    const summary = summarizeFeedback(feedback);
    expect(summary.recent).toHaveLength(5);
  });

  test("recent preserves order (first items are most recent)", () => {
    const feedback = [
      makeFeedback({ id: "review-1", reviewed_at: "2024-06-01T00:00:00Z" }),
      makeFeedback({ id: "review-2", reviewed_at: "2024-06-02T00:00:00Z" }),
    ];
    const summary = summarizeFeedback(feedback);
    expect(summary.recent[0].id).toBe("review-1");
    expect(summary.recent[1].id).toBe("review-2");
  });
});

describe("summarizeFeedback — by_endpoint", () => {
  test("groups by source_endpoint", () => {
    const feedback = [
      makeFeedback({ source_endpoint: "/api/legal/chat", verdict: "correct" }),
      makeFeedback({ source_endpoint: "/api/legal/chat", verdict: "incorrect" }),
      makeFeedback({ source_endpoint: "/api/legal/drafting", verdict: "incomplete" }),
    ];
    const summary = summarizeFeedback(feedback);
    expect(Object.keys(summary.by_endpoint)).toHaveLength(2);
    expect(summary.by_endpoint["/api/legal/chat"].total).toBe(2);
    expect(summary.by_endpoint["/api/legal/chat"].incorrect).toBe(1);
    expect(summary.by_endpoint["/api/legal/drafting"].total).toBe(1);
    expect(summary.by_endpoint["/api/legal/drafting"].incomplete).toBe(1);
  });

  test("by_endpoint counts incorrect and incomplete separately", () => {
    const feedback = [
      makeFeedback({ source_endpoint: "/api/test", verdict: "incorrect" }),
      makeFeedback({ source_endpoint: "/api/test", verdict: "incorrect" }),
      makeFeedback({ source_endpoint: "/api/test", verdict: "incomplete" }),
      makeFeedback({ source_endpoint: "/api/test", verdict: "correct" }),
    ];
    const summary = summarizeFeedback(feedback);
    expect(summary.by_endpoint["/api/test"].total).toBe(4);
    expect(summary.by_endpoint["/api/test"].incorrect).toBe(2);
    expect(summary.by_endpoint["/api/test"].incomplete).toBe(1);
  });
});

describe("promoteToFixture", () => {
  test("returns null for 'correct' verdict", () => {
    const feedback = makeFeedback({ verdict: "correct" });
    expect(promoteToFixture(feedback, ["slug-1"])).toBeNull();
  });

  test("returns null when already promoted", () => {
    const feedback = makeFeedback({ verdict: "incorrect", promoted_to_fixture: true });
    expect(promoteToFixture(feedback, ["slug-1"])).toBeNull();
  });

  test("returns PromotableFeedback for 'incorrect' verdict", () => {
    const feedback = makeFeedback({
      id: "review-123",
      verdict: "incorrect",
      query: "What is the deadline?",
      category: "procedure",
      jurisdiction: "DE",
    });
    const result = promoteToFixture(feedback, ["slug-1", "slug-2"]);
    expect(result).not.toBeNull();
    expect(result!.query).toBe("What is the deadline?");
    expect(result!.expectedSlugs).toEqual(["slug-1", "slug-2"]);
    expect(result!.category).toBe("procedure");
    expect(result!.jurisdiction).toBe("DE");
    expect(result!.source).toBe("human-review:review-123");
  });

  test("returns PromotableFeedback for 'incomplete' verdict", () => {
    const feedback = makeFeedback({ verdict: "incomplete" });
    const result = promoteToFixture(feedback, ["slug-1"]);
    expect(result).not.toBeNull();
  });

  test("defaults category to 'general' when not set", () => {
    const feedback = makeFeedback({ verdict: "incorrect", category: undefined });
    const result = promoteToFixture(feedback, []);
    expect(result!.category).toBe("general");
  });

  test("defaults jurisdiction to undefined when not set", () => {
    const feedback = makeFeedback({ verdict: "incorrect", jurisdiction: undefined });
    const result = promoteToFixture(feedback, []);
    expect(result!.jurisdiction).toBeUndefined();
  });

  test("uses feedback id in source", () => {
    const feedback = makeFeedback({ id: "my-review-id", verdict: "incorrect" });
    const result = promoteToFixture(feedback, []);
    expect(result!.source).toBe("human-review:my-review-id");
  });
});
