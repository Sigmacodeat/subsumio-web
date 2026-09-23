import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import type { PostUploadTask } from "@/lib/post-upload-outbox";

export const dynamic = "force-dynamic";

const retrySchema = z.object({
  task_slug: z.string().regex(/^legal\/post-upload-tasks\/inbound_stamp\/[a-zA-Z0-9/_-]{1,200}$/),
});

/**
 * POST: re-queue an exhausted inbound_stamp outbox task. The drain picks it
 * up on the next run; the fixed entry id makes the retried stamp idempotent.
 * Only exhausted inbound_stamp tasks are accepted — anything else is 409.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: retrySchema,
    audit: (_ctx, body) => ({
      action: "inbound_register.retry" as const,
      entityType: "post_upload_task",
      entityId: body.task_slug,
    }),
  },
  async (ctx, body) => {
    const res = await fetch(
      `${ENGINE_URL}/api/pages/${body.task_slug.split("/").map(encodeURIComponent).join("/")}`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) {
      return apiError("task_not_found", "Retry-Task nicht gefunden", 404);
    }
    const page = (await res.json()) as { type?: string; frontmatter?: Partial<PostUploadTask> };
    const fm = page.frontmatter;
    if (fm?.task_type !== "inbound_stamp" || !fm.inbound) {
      return apiError("not_a_stamp_task", "Task ist kein Posteingangs-Stempel", 409);
    }
    if (fm.status !== "exhausted") {
      return apiError(
        "not_exhausted",
        "Nur endgültig fehlgeschlagene Stempel können erneut werden",
        409
      );
    }
    const patch = await enginePatchPage(ctx.headers, {
      slug: body.task_slug,
      type: "post_upload_task",
      frontmatter: {
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        last_error: undefined,
        retried_by: ctx.user.email ?? ctx.user.name,
        retried_at: new Date().toISOString(),
      },
    });
    if (!patch.ok) {
      return apiError("engine_write_failed", "Retry konnte nicht eingereiht werden", 502);
    }
    return apiSuccess({ requeued: true, task_slug: body.task_slug });
  }
);
