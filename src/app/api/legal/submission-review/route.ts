import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { encodeSlugPath } from "@/lib/utils";
import {
  assertOutputActionAllowed,
  VerificationPolicyError,
  buildPolicyOutput,
  type AttorneyOverride,
} from "@/lib/verification-policy";

const bodySchema = z.object({
  submissionSlug: z.string().min(1).max(500),
  action: z.enum(["reviewed", "rejected"]),
  note: z.string().max(1000).optional(),
  verification: z
    .object({
      state: z.enum([
        "VERIFIED",
        "VERIFIED_WITH_WARNINGS",
        "NEEDS_HUMAN_REVIEW",
        "BLOCKED",
        "VERIFIER_ERROR",
      ]),
      content_hash: z.string().length(64),
      receipt_hash: z.string().length(64).optional(),
      override: z
        .object({
          user_id: z.string().min(1),
          reason: z.string().min(10),
          timestamp: z.string().min(1),
          output_hash: z.string().length(64),
        })
        .optional(),
    })
    .optional(),
});

export const dynamic = "force-dynamic";

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "submission.review" as const,
      entityType: "client_submission",
      entityId: body.submissionSlug,
      details: {
        action: body.action,
        note: body.note,
        actorId: ctx.user.id,
        actorEmail: ctx.user.email,
        actorName: ctx.user.name,
      },
    }),
  },
  async (ctx, body) => {
    // ── Verification policy check (share_internal) ──
    if (body.verification) {
      const output = buildPolicyOutput(
        body.submissionSlug,
        body.verification.state,
        body.verification.content_hash,
        { receipt_hash: body.verification.receipt_hash }
      );
      try {
        await assertOutputActionAllowed(
          output,
          "share_internal",
          { user_id: ctx.user.id, user_email: ctx.user.email, brain_id: ctx.brainId },
          body.verification.override as AttorneyOverride | undefined
        );
      } catch (err) {
        if (err instanceof VerificationPolicyError) {
          return apiError("verification_denied", err.decision.reason, 403);
        }
        throw err;
      }
    }

    const now = new Date().toISOString();

    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlugPath(body.submissionSlug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) {
      return apiError("not_found", "Einreichung nicht gefunden", 404);
    }
    const page = (await getRes.json()) as {
      slug: string;
      title?: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};
    const caseSlug = typeof fm.case_slug === "string" ? fm.case_slug : undefined;

    await enginePatchPage(ctx.headers, {
      slug: body.submissionSlug,
      title: page.title,
      frontmatter: {
        review_status: body.action,
        reviewed_at: now,
        reviewed_by: ctx.user.email,
        reviewed_by_name: ctx.user.name || undefined,
        review_note: body.note || undefined,
      },
    });

    return apiSuccess({
      ok: true,
      slug: body.submissionSlug,
      reviewStatus: body.action,
      reviewedAt: now,
      reviewedBy: ctx.user.email,
      caseSlug,
    });
  }
);
