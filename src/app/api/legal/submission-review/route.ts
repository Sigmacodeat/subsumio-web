import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { encodeSlugPath } from "@/lib/utils";

const bodySchema = z.object({
  submissionSlug: z.string().min(1).max(500),
  action: z.enum(["reviewed", "rejected"]),
  note: z.string().max(1000).optional(),
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
