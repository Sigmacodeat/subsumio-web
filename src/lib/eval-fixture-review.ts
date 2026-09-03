/**
 * Eval Fixture Review — strukturierter Jurist-Review für Retrieval-Eval-Fragen.
 *
 * Ein Eval Fixture Review ist eine Brain-Page (type="eval_fixture_review"),
 * die eine Frage aus einer Eval-Fixture (z.B. at-legal-retrieval.jsonl) mit
 * einem Korrektur-Vorschlag + Freigabe-Status verknüpft. Die Fixture-Datei
 * selbst bleibt unangetastet, bis ein approved Review per Sync-Skript
 * (server/scripts/apply-fixture-reviews.ts) kontrolliert übernommen wird —
 * damit korrigiert nie derselbe Agent, der optimiert, unbeaufsichtigt die
 * Ground Truth (Goodharting-Risiko).
 *
 * Architektur: Thin Client — Types und Helpers hier, Speicherung über
 * Brain-Pages via Engine API. Gleiches Muster wie clause-annotation.ts.
 */

export type FixtureReviewStatus = "pending" | "approved" | "rejected" | "needs_discussion";

export interface EvalFixtureReviewFrontmatter {
  type: "eval_fixture_review";
  fixture_file: string;
  question_id: string;
  question: string;
  current_expected_slug: string;
  proposed_slug: string;
  legal_area?: string;
  reasoning: string;
  status: FixtureReviewStatus;
  proposed_by: string;
  proposed_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  reviewer_note?: string;
}

export interface EvalFixtureReview {
  slug: string;
  title: string;
  frontmatter: EvalFixtureReviewFrontmatter;
}

export const STATUS_LABELS: Record<FixtureReviewStatus, string> = {
  pending: "Offen",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
  needs_discussion: "Klärungsbedarf",
};

export const STATUS_BADGE_VARIANT: Record<
  FixtureReviewStatus,
  "success" | "warning" | "danger" | "default"
> = {
  pending: "default",
  approved: "success",
  rejected: "danger",
  needs_discussion: "warning",
};

// ── Helpers ───────────────────────────────────────────────────────────

export function buildReviewSlug(fixtureFile: string, questionId: string, at?: Date): string {
  const date = at ?? new Date();
  const stamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fixtureStem =
    fixtureFile
      .split("/")
      .pop()
      ?.replace(/\.jsonl?$/, "") ?? fixtureFile;
  return `eval_fixture_reviews/${fixtureStem}/${questionId}-${stamp}`;
}

export function buildReviewTitle(questionId: string, question: string): string {
  const excerpt = question.length > 80 ? `${question.slice(0, 80)}…` : question;
  return `${questionId}: ${excerpt}`;
}

export function buildReviewFrontmatter(params: {
  fixture_file: string;
  question_id: string;
  question: string;
  current_expected_slug: string;
  proposed_slug: string;
  legal_area?: string;
  reasoning: string;
  proposed_by: string;
  at?: Date;
}): Record<string, unknown> {
  const fm: EvalFixtureReviewFrontmatter = {
    type: "eval_fixture_review",
    fixture_file: params.fixture_file,
    question_id: params.question_id,
    question: params.question,
    current_expected_slug: params.current_expected_slug,
    proposed_slug: params.proposed_slug,
    legal_area: params.legal_area,
    reasoning: params.reasoning,
    status: "pending",
    proposed_by: params.proposed_by,
    proposed_at: (params.at ?? new Date()).toISOString(),
  };
  return { ...fm };
}

export function fmToReview(page: {
  slug: string;
  title: string;
  frontmatter?: Record<string, unknown>;
}): EvalFixtureReview | null {
  const fm = (page.frontmatter ?? {}) as Partial<EvalFixtureReviewFrontmatter>;
  if (fm.type !== "eval_fixture_review") return null;

  return {
    slug: page.slug,
    title: page.title,
    frontmatter: {
      type: "eval_fixture_review",
      fixture_file: fm.fixture_file ?? "",
      question_id: fm.question_id ?? "",
      question: fm.question ?? "",
      current_expected_slug: fm.current_expected_slug ?? "",
      proposed_slug: fm.proposed_slug ?? "",
      legal_area: fm.legal_area,
      reasoning: fm.reasoning ?? "",
      status: fm.status ?? "pending",
      proposed_by: fm.proposed_by ?? "—",
      proposed_at: fm.proposed_at ?? new Date().toISOString(),
      reviewed_at: fm.reviewed_at,
      reviewed_by: fm.reviewed_by,
      reviewer_note: fm.reviewer_note,
    },
  };
}

// ── Filtering / Sorting ──────────────────────────────────────────────

export function filterByFixture(
  reviews: EvalFixtureReview[],
  fixtureFile: string
): EvalFixtureReview[] {
  return reviews.filter((r) => r.frontmatter.fixture_file === fixtureFile);
}

export function filterByStatus(
  reviews: EvalFixtureReview[],
  status: FixtureReviewStatus
): EvalFixtureReview[] {
  return reviews.filter((r) => r.frontmatter.status === status);
}

export function sortByProposedAt(
  reviews: EvalFixtureReview[],
  direction?: "asc" | "desc"
): EvalFixtureReview[] {
  const dir = direction ?? "desc";
  return [...reviews].sort((a, b) => {
    const cmp = (a.frontmatter.proposed_at ?? "").localeCompare(b.frontmatter.proposed_at ?? "");
    return dir === "desc" ? -cmp : cmp;
  });
}

// ── Stats ─────────────────────────────────────────────────────────────

export interface FixtureReviewStats {
  total: number;
  by_status: Record<FixtureReviewStatus, number>;
}

export function computeReviewStats(reviews: EvalFixtureReview[]): FixtureReviewStats {
  const stats: FixtureReviewStats = {
    total: reviews.length,
    by_status: { pending: 0, approved: 0, rejected: 0, needs_discussion: 0 },
  };
  for (const r of reviews) {
    stats.by_status[r.frontmatter.status]++;
  }
  return stats;
}

// ── Review Action ─────────────────────────────────────────────────────

export function buildReviewDecision(params: {
  status: "approved" | "rejected" | "needs_discussion";
  reviewed_by: string;
  reviewer_note?: string;
  at?: Date;
}): Record<string, unknown> {
  const now = (params.at ?? new Date()).toISOString();
  return {
    status: params.status,
    reviewed_at: now,
    reviewed_by: params.reviewed_by,
    ...(params.reviewer_note ? { reviewer_note: params.reviewer_note } : {}),
  };
}
