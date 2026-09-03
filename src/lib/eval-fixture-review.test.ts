import { describe, it, expect } from "vitest";
import {
  buildReviewSlug,
  buildReviewTitle,
  buildReviewFrontmatter,
  buildReviewDecision,
  fmToReview,
  filterByFixture,
  filterByStatus,
  sortByProposedAt,
  computeReviewStats,
  STATUS_LABELS,
  STATUS_BADGE_VARIANT,
  type EvalFixtureReview,
  type EvalFixtureReviewFrontmatter,
} from "./eval-fixture-review";

describe("eval-fixture-review", () => {
  // ── buildReviewSlug ──────────────────────────────────────────────────

  describe("buildReviewSlug", () => {
    it("builds a slug with fixture stem, question id, and timestamp", () => {
      const at = new Date("2026-01-15T10:30:45.000Z");
      const slug = buildReviewSlug("at-legal-retrieval.jsonl", "at-031", at);
      expect(slug).toBe("eval_fixture_reviews/at-legal-retrieval/at-031-2026-01-15T10-30-45");
    });

    it("strips directory path from fixture file", () => {
      const at = new Date("2026-01-15T10:30:45.000Z");
      const slug = buildReviewSlug("server/test/fixtures/at-legal-retrieval.jsonl", "at-001", at);
      expect(slug).toBe("eval_fixture_reviews/at-legal-retrieval/at-001-2026-01-15T10-30-45");
    });

    it("handles .json extension (not just .jsonl)", () => {
      const at = new Date("2026-01-15T10:30:45.000Z");
      const slug = buildReviewSlug("test.json", "q1", at);
      expect(slug).toBe("eval_fixture_reviews/test/q1-2026-01-15T10-30-45");
    });

    it("uses current time when no date provided", () => {
      const slug = buildReviewSlug("at-legal-retrieval.jsonl", "at-001");
      expect(slug).toMatch(
        /^eval_fixture_reviews\/at-legal-retrieval\/at-001-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/
      );
    });
  });

  // ── buildReviewTitle ─────────────────────────────────────────────────

  describe("buildReviewTitle", () => {
    it("builds title with question id and excerpt", () => {
      const title = buildReviewTitle("at-031", "Was ist der Kündigungsgrund?");
      expect(title).toBe("at-031: Was ist der Kündigungsgrund?");
    });

    it("truncates long questions with ellipsis", () => {
      const longQ = "A".repeat(100);
      const title = buildReviewTitle("at-099", longQ);
      expect(title).toBe("at-099: " + "A".repeat(80) + "…");
    });

    it("does not truncate questions exactly 80 chars", () => {
      const q = "B".repeat(80);
      const title = buildReviewTitle("at-099", q);
      expect(title).toBe("at-099: " + "B".repeat(80));
    });
  });

  // ── buildReviewFrontmatter ───────────────────────────────────────────

  describe("buildReviewFrontmatter", () => {
    it("creates frontmatter with all required fields", () => {
      const fm = buildReviewFrontmatter({
        fixture_file: "at-legal-retrieval.jsonl",
        question_id: "at-031",
        question: "Was ist der Kündigungsgrund?",
        current_expected_slug: "legal/statutes/at/arbvg/p-105",
        proposed_slug: "legal/statutes/at/vbg/p-32",
        legal_area: "arbvg",
        reasoning: "VBG §32 regelt Kündigung",
        proposed_by: "jurist@subsumio.at",
      });

      expect(fm.type).toBe("eval_fixture_review");
      expect(fm.fixture_file).toBe("at-legal-retrieval.jsonl");
      expect(fm.question_id).toBe("at-031");
      expect(fm.question).toBe("Was ist der Kündigungsgrund?");
      expect(fm.current_expected_slug).toBe("legal/statutes/at/arbvg/p-105");
      expect(fm.proposed_slug).toBe("legal/statutes/at/vbg/p-32");
      expect(fm.legal_area).toBe("arbvg");
      expect(fm.reasoning).toBe("VBG §32 regelt Kündigung");
      expect(fm.status).toBe("pending");
      expect(fm.proposed_by).toBe("jurist@subsumio.at");
      expect(fm.proposed_at).toBeDefined();
      expect(fm.reviewed_at).toBeUndefined();
      expect(fm.reviewed_by).toBeUndefined();
    });

    it("uses custom date when provided", () => {
      const at = new Date("2026-06-01T12:00:00.000Z");
      const fm = buildReviewFrontmatter({
        fixture_file: "test.jsonl",
        question_id: "q1",
        question: "Q?",
        current_expected_slug: "a",
        proposed_slug: "b",
        reasoning: "r",
        proposed_by: "x",
        at,
      });
      expect(fm.proposed_at).toBe("2026-06-01T12:00:00.000Z");
    });
  });

  // ── buildReviewDecision ──────────────────────────────────────────────

  describe("buildReviewDecision", () => {
    it("builds approved decision with reviewer info", () => {
      const decision = buildReviewDecision({
        status: "approved",
        reviewed_by: "jurist@subsumio.at",
      });
      expect(decision.status).toBe("approved");
      expect(decision.reviewed_by).toBe("jurist@subsumio.at");
      expect(decision.reviewed_at).toBeDefined();
      expect(decision.reviewer_note).toBeUndefined();
    });

    it("includes reviewer_note when provided", () => {
      const decision = buildReviewDecision({
        status: "needs_discussion",
        reviewed_by: "jurist@subsumio.at",
        reviewer_note: "Frage ist juristisch problematisch",
      });
      expect(decision.reviewer_note).toBe("Frage ist juristisch problematisch");
    });

    it("omits reviewer_note when not provided", () => {
      const decision = buildReviewDecision({
        status: "rejected",
        reviewed_by: "x",
      });
      expect(decision.reviewer_note).toBeUndefined();
    });
  });

  // ── fmToReview ───────────────────────────────────────────────────────

  describe("fmToReview", () => {
    it("converts a valid page to review", () => {
      const review = fmToReview({
        slug: "eval_fixture_reviews/test/q1-2026-01-15T10-30-45",
        title: "q1: Question?",
        frontmatter: {
          type: "eval_fixture_review",
          fixture_file: "test.jsonl",
          question_id: "q1",
          question: "Question?",
          current_expected_slug: "a",
          proposed_slug: "b",
          reasoning: "r",
          status: "pending",
          proposed_by: "x",
          proposed_at: "2026-01-15T10:30:45.000Z",
        },
      });
      expect(review).not.toBeNull();
      expect(review!.slug).toBe("eval_fixture_reviews/test/q1-2026-01-15T10-30-45");
      expect(review!.frontmatter.question_id).toBe("q1");
    });

    it("returns null for non-eval_fixture_review pages", () => {
      const review = fmToReview({
        slug: "some/other/page",
        title: "Other",
        frontmatter: { type: "clause_annotation" },
      });
      expect(review).toBeNull();
    });

    it("returns null for pages without frontmatter", () => {
      const review = fmToReview({ slug: "s", title: "t" });
      expect(review).toBeNull();
    });

    it("fills defaults for missing frontmatter fields", () => {
      const review = fmToReview({
        slug: "s",
        title: "t",
        frontmatter: { type: "eval_fixture_review" },
      });
      expect(review).not.toBeNull();
      expect(review!.frontmatter.status).toBe("pending");
      expect(review!.frontmatter.question_id).toBe("");
      expect(review!.frontmatter.proposed_by).toBe("—");
    });
  });

  // ── filterByFixture / filterByStatus ─────────────────────────────────

  describe("filterByFixture", () => {
    const reviews: EvalFixtureReview[] = [
      {
        slug: "s1",
        title: "t1",
        frontmatter: {
          ...buildReviewFrontmatter({
            fixture_file: "a.jsonl",
            question_id: "q1",
            question: "Q",
            current_expected_slug: "x",
            proposed_slug: "y",
            reasoning: "r",
            proposed_by: "p",
          }),
          type: "eval_fixture_review",
        } as EvalFixtureReviewFrontmatter,
      },
      {
        slug: "s2",
        title: "t2",
        frontmatter: {
          ...buildReviewFrontmatter({
            fixture_file: "b.jsonl",
            question_id: "q2",
            question: "Q",
            current_expected_slug: "x",
            proposed_slug: "y",
            reasoning: "r",
            proposed_by: "p",
          }),
          type: "eval_fixture_review",
        } as EvalFixtureReviewFrontmatter,
      },
    ];

    it("filters by fixture file", () => {
      expect(filterByFixture(reviews, "a.jsonl")).toHaveLength(1);
      expect(filterByFixture(reviews, "a.jsonl")[0].frontmatter.question_id).toBe("q1");
    });

    it("returns empty for non-matching fixture", () => {
      expect(filterByFixture(reviews, "c.jsonl")).toHaveLength(0);
    });
  });

  describe("filterByStatus", () => {
    const reviews: EvalFixtureReview[] = [
      {
        slug: "s1",
        title: "t1",
        frontmatter: {
          type: "eval_fixture_review",
          fixture_file: "f",
          question_id: "q1",
          question: "Q",
          current_expected_slug: "x",
          proposed_slug: "y",
          reasoning: "r",
          status: "pending",
          proposed_by: "p",
          proposed_at: "2026-01-01",
        },
      },
      {
        slug: "s2",
        title: "t2",
        frontmatter: {
          type: "eval_fixture_review",
          fixture_file: "f",
          question_id: "q2",
          question: "Q",
          current_expected_slug: "x",
          proposed_slug: "y",
          reasoning: "r",
          status: "approved",
          proposed_by: "p",
          proposed_at: "2026-01-02",
          reviewed_by: "j",
          reviewed_at: "2026-01-03",
        },
      },
    ];

    it("filters by status", () => {
      expect(filterByStatus(reviews, "pending")).toHaveLength(1);
      expect(filterByStatus(reviews, "approved")).toHaveLength(1);
      expect(filterByStatus(reviews, "rejected")).toHaveLength(0);
    });
  });

  // ── sortByProposedAt ─────────────────────────────────────────────────

  describe("sortByProposedAt", () => {
    const reviews: EvalFixtureReview[] = [
      {
        slug: "s1",
        title: "t1",
        frontmatter: {
          type: "eval_fixture_review",
          fixture_file: "f",
          question_id: "q1",
          question: "Q",
          current_expected_slug: "x",
          proposed_slug: "y",
          reasoning: "r",
          status: "pending",
          proposed_by: "p",
          proposed_at: "2026-01-01",
        },
      },
      {
        slug: "s2",
        title: "t2",
        frontmatter: {
          type: "eval_fixture_review",
          fixture_file: "f",
          question_id: "q2",
          question: "Q",
          current_expected_slug: "x",
          proposed_slug: "y",
          reasoning: "r",
          status: "pending",
          proposed_by: "p",
          proposed_at: "2026-03-01",
        },
      },
    ];

    it("sorts descending by default", () => {
      const sorted = sortByProposedAt(reviews, "desc");
      expect(sorted[0].frontmatter.proposed_at).toBe("2026-03-01");
    });

    it("sorts ascending when specified", () => {
      const sorted = sortByProposedAt(reviews, "asc");
      expect(sorted[0].frontmatter.proposed_at).toBe("2026-01-01");
    });

    it("does not mutate original array", () => {
      const original = [...reviews];
      sortByProposedAt(reviews, "desc");
      expect(reviews[0].frontmatter.proposed_at).toBe(original[0].frontmatter.proposed_at);
    });
  });

  // ── computeReviewStats ───────────────────────────────────────────────

  describe("computeReviewStats", () => {
    it("counts reviews by status", () => {
      const reviews: EvalFixtureReview[] = [
        {
          slug: "s1",
          title: "t",
          frontmatter: {
            type: "eval_fixture_review",
            fixture_file: "f",
            question_id: "q",
            question: "Q",
            current_expected_slug: "x",
            proposed_slug: "y",
            reasoning: "r",
            status: "pending",
            proposed_by: "p",
            proposed_at: "a",
          },
        },
        {
          slug: "s2",
          title: "t",
          frontmatter: {
            type: "eval_fixture_review",
            fixture_file: "f",
            question_id: "q",
            question: "Q",
            current_expected_slug: "x",
            proposed_slug: "y",
            reasoning: "r",
            status: "approved",
            proposed_by: "p",
            proposed_at: "a",
          },
        },
        {
          slug: "s3",
          title: "t",
          frontmatter: {
            type: "eval_fixture_review",
            fixture_file: "f",
            question_id: "q",
            question: "Q",
            current_expected_slug: "x",
            proposed_slug: "y",
            reasoning: "r",
            status: "approved",
            proposed_by: "p",
            proposed_at: "a",
          },
        },
        {
          slug: "s4",
          title: "t",
          frontmatter: {
            type: "eval_fixture_review",
            fixture_file: "f",
            question_id: "q",
            question: "Q",
            current_expected_slug: "x",
            proposed_slug: "y",
            reasoning: "r",
            status: "rejected",
            proposed_by: "p",
            proposed_at: "a",
          },
        },
      ];
      const stats = computeReviewStats(reviews);
      expect(stats.total).toBe(4);
      expect(stats.by_status.pending).toBe(1);
      expect(stats.by_status.approved).toBe(2);
      expect(stats.by_status.rejected).toBe(1);
      expect(stats.by_status.needs_discussion).toBe(0);
    });

    it("handles empty array", () => {
      const stats = computeReviewStats([]);
      expect(stats.total).toBe(0);
      expect(stats.by_status.pending).toBe(0);
    });
  });

  // ── Constants ────────────────────────────────────────────────────────

  describe("constants", () => {
    it("STATUS_LABELS has all 4 statuses", () => {
      expect(Object.keys(STATUS_LABELS)).toHaveLength(4);
      expect(STATUS_LABELS.pending).toBe("Offen");
      expect(STATUS_LABELS.approved).toBe("Freigegeben");
      expect(STATUS_LABELS.rejected).toBe("Abgelehnt");
      expect(STATUS_LABELS.needs_discussion).toBe("Klärungsbedarf");
    });

    it("STATUS_BADGE_VARIANT maps to valid variants", () => {
      expect(STATUS_BADGE_VARIANT.pending).toBe("default");
      expect(STATUS_BADGE_VARIANT.approved).toBe("success");
      expect(STATUS_BADGE_VARIANT.rejected).toBe("danger");
      expect(STATUS_BADGE_VARIANT.needs_discussion).toBe("warning");
    });
  });
});
