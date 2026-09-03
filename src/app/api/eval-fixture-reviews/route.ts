import { z } from "zod";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  buildReviewSlug,
  buildReviewTitle,
  buildReviewFrontmatter,
  buildReviewDecision,
  fmToReview,
  filterByFixture,
  sortByProposedAt,
  computeReviewStats,
  type EvalFixtureReview,
} from "@/lib/eval-fixture-review";

export const maxDuration = 30;

// ── GET: List fixture reviews (optionally scoped to one fixture file) ──

const getSchema = z.object({
  fixture_file: z.string().max(300).optional(),
});

export const GET = createHandler(
  {
    action: "legal.eval_fixture_review",
    rateTier: "standard",
    query: getSchema,
  },
  async (ctx, _body, query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages?type=eval_fixture_review&limit=500`, {
        headers: engineHeadersForBrain(ctx.brainId),
        signal: AbortSignal.timeout(10_000),
      });

      let reviews: EvalFixtureReview[] = [];
      if (res.ok) {
        const raw = await res.json();
        const pages = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as Record<string, unknown>)?.pages)
            ? (raw as Record<string, unknown[]>).pages
            : [];
        reviews = pages.map((p) => fmToReview(p)).filter((r): r is EvalFixtureReview => r !== null);
      }

      const scoped = query.fixture_file ? filterByFixture(reviews, query.fixture_file) : reviews;
      const sorted = sortByProposedAt(scoped, "desc");
      const stats = computeReviewStats(scoped);

      return apiSuccess({ reviews: sorted, stats, total: sorted.length });
    } catch (err) {
      return apiError(
        "eval_fixture_reviews_list_failed",
        err instanceof Error ? err.message : "eval_fixture_reviews_list_failed",
        500
      );
    }
  }
);

// ── POST: Propose a correction to an eval fixture question ─────────────

const postSchema = z.object({
  fixture_file: z.string().min(1).max(300),
  question_id: z.string().min(1).max(50),
  question: z.string().min(1).max(2000),
  current_expected_slug: z.string().min(1).max(300),
  proposed_slug: z.string().min(1).max(300),
  legal_area: z.string().max(100).optional(),
  reasoning: z.string().min(1).max(3000),
});

export const POST = createHandler(
  {
    action: "legal.eval_fixture_review",
    rateTier: "standard",
    body: postSchema,
    audit: (_ctx, body) => ({
      action: "legal.eval_fixture_review" as const,
      entityType: "eval_fixture_review",
      details: {
        fixture_file: body.fixture_file,
        question_id: body.question_id,
        current_expected_slug: body.current_expected_slug,
        proposed_slug: body.proposed_slug,
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const slug = buildReviewSlug(body.fixture_file, body.question_id);
      const title = buildReviewTitle(body.question_id, body.question);
      const frontmatter = buildReviewFrontmatter({
        fixture_file: body.fixture_file,
        question_id: body.question_id,
        question: body.question,
        current_expected_slug: body.current_expected_slug,
        proposed_slug: body.proposed_slug,
        legal_area: body.legal_area,
        reasoning: body.reasoning,
        proposed_by: ctx.user?.email ?? ctx.user?.name ?? "system",
      });

      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...engineHeadersForBrain(ctx.brainId), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title,
          type: "eval_fixture_review",
          content: body.reasoning,
          frontmatter,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        return apiError(
          "eval_fixture_review_create_failed",
          "Review-Vorschlag konnte nicht erstellt werden",
          502
        );
      }

      broadcastSseEvent(ctx.brainId, "eval_fixture_review.created", {
        slug,
        question_id: body.question_id,
      });

      return apiSuccess({
        slug,
        title,
        frontmatter,
        message: `Review-Vorschlag für '${body.question_id}' erstellt.`,
      });
    } catch (err) {
      return apiError(
        "eval_fixture_review_create_failed",
        err instanceof Error ? err.message : "eval_fixture_review_create_failed",
        500
      );
    }
  }
);

// ── PATCH: Jurist-Entscheidung (approve / reject / needs_discussion) ───

const patchSchema = z.object({
  slug: z.string().min(1).max(300),
  status: z.enum(["approved", "rejected", "needs_discussion"]),
  reviewer_note: z.string().max(2000).optional(),
});

export const PATCH = createHandler(
  {
    action: "legal.eval_fixture_review",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "legal.eval_fixture_review" as const,
      entityType: "eval_fixture_review",
      entityId: body.slug,
      details: { status: body.status },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const path = body.slug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers: engineHeadersForBrain(ctx.brainId),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return apiError(
          "eval_fixture_review_not_found",
          `Review '${body.slug}' nicht gefunden.`,
          404
        );
      }

      const page = (await res.json()) as {
        slug: string;
        title: string;
        frontmatter?: Record<string, unknown>;
      };

      const review = fmToReview(page);
      if (!review) {
        return apiError("invalid_eval_fixture_review", "Seite ist kein Eval-Fixture-Review.", 400);
      }

      const decision = buildReviewDecision({
        status: body.status,
        reviewed_by: ctx.user?.email ?? ctx.user?.name ?? "system",
        reviewer_note: body.reviewer_note,
      });

      const updatedFrontmatter = { ...review.frontmatter, ...decision };

      const updateRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "PUT",
        headers: { ...engineHeadersForBrain(ctx.brainId), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: body.slug,
          title: review.title,
          frontmatter: updatedFrontmatter,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!updateRes.ok) {
        return apiError(
          "eval_fixture_review_update_failed",
          "Review konnte nicht aktualisiert werden",
          502
        );
      }

      broadcastSseEvent(ctx.brainId, "eval_fixture_review.reviewed", {
        slug: body.slug,
        status: body.status,
        question_id: review.frontmatter.question_id,
      });

      const statusLabel =
        body.status === "approved"
          ? "freigegeben"
          : body.status === "rejected"
            ? "abgelehnt"
            : "zur Klärung markiert";

      return apiSuccess({
        slug: body.slug,
        frontmatter: updatedFrontmatter,
        message: `Review ${statusLabel}.`,
      });
    } catch (err) {
      return apiError(
        "eval_fixture_review_update_failed",
        err instanceof Error ? err.message : "eval_fixture_review_update_failed",
        500
      );
    }
  }
);
