import { NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  reviewDraft,
  persistReviewResult,
  updateIssueStatus,
  listReviews,
  type ReviewIssueStatus,
  type DraftReviewResult,
} from "@/lib/draft-review";

const draftReviewPostSchema = z.object({
  action: z.enum(["review", "persist", "update_issue"]).optional(),
  content: z.string().max(50000).optional(),
  title: z.string().max(500).optional(),
  type: z.string().max(100).optional(),
  draftSlug: z.string().max(200).optional(),
  reviewResult: z.record(z.unknown()).optional(),
  issueId: z.string().max(200).optional(),
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
});

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
  },
  async (ctx, _body, query) => {
    const draftSlug = query?.draftSlug;
    const status = query?.status as DraftReviewResult["reviewStatus"] | undefined;

    try {
      const reviews = await listReviews({ draftSlug, status });
      return NextResponse.json({ reviews });
    } catch (err) {
      console.error(
        "[copilot/draft-review] GET failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to load reviews", 500);
    }
  }
);

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "search",
    body: draftReviewPostSchema,
    audit: (_ctx, body) => {
      const b = body as {
        action?: string;
        content?: string;
        title?: string;
        type?: string;
        draftSlug?: string;
      };
      return {
        action: "copilot.draft_review" as const,
        entityType: "draft",
        details: {
          subAction: b.action,
          title: b.title,
          type: b.type,
          draftSlug: b.draftSlug,
          contentLength: b.content?.length ?? 0,
        },
      };
    },
  },
  async (ctx, body) => {
    const { action, content, title, type, draftSlug } = body as {
      action?: string;
      content?: string;
      title?: string;
      type?: string;
      draftSlug?: string;
    };

    try {
      if (action === "review" && content && title) {
        const result = await reviewDraft({
          content,
          title,
          type: type ?? "document_draft",
          draftSlug,
        });

        // Persist non-blocking
        persistReviewResult(result, ctx.brainId).catch(() => {});

        return NextResponse.json({ review: result });
      }

      return apiError("bad_request", "Invalid action or missing fields", 400);
    } catch (err) {
      console.error(
        "[copilot/draft-review] POST failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to review draft", 500);
    }
  }
);

const draftReviewPatchSchema = z.object({
  reviewId: z.string().max(200).optional(),
  issueId: z.string().max(200).optional(),
  status: z.enum(["open", "resolved", "dismissed"]).optional(),
});

export const PATCH = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: draftReviewPatchSchema,
    audit: (_ctx, body) => {
      const b = body as { reviewId?: string; issueId?: string; status?: string };
      return {
        action: "copilot.draft_issue_update" as const,
        entityType: "draft_issue",
        entityId: b.issueId,
        details: { reviewId: b.reviewId, issueId: b.issueId, status: b.status },
      };
    },
  },
  async (ctx, body) => {
    const { reviewId, issueId, status } = body as {
      reviewId?: string;
      issueId?: string;
      status?: ReviewIssueStatus;
    };

    if (!reviewId || !issueId || !status) {
      return apiError("bad_request", "reviewId, issueId, and status required", 400);
    }

    try {
      await updateIssueStatus(reviewId, issueId, status);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(
        "[copilot/draft-review] PATCH failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to update issue", 500);
    }
  }
);
