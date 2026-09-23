import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import type { PostUploadTask } from "@/lib/post-upload-outbox";

export const dynamic = "force-dynamic";

const retrySchema = z.object({
  // Restricted to the post-upload-task namespace — this must not become a
  // generic page-status lever.
  task_slug: z.string().regex(/^legal\/post-upload-tasks\/[a-z_]+\/[a-zA-Z0-9/_-]{1,200}$/),
});

/**
 * POST: re-queue an exhausted post-upload task (analysis, contradiction
 * probe, inbound stamp, case reconciliation). The drain picks it up on the
 * next run. `blocked` tasks stay rejected — that status means the document
 * can never be processed, retrying would only burn paid calls.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: retrySchema,
    audit: (_ctx, body) => ({
      action: "post_upload_task.retry" as const,
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
      return apiError("task_not_found", "Task nicht gefunden", 404);
    }
    const page = (await res.json()) as { type?: string; frontmatter?: Partial<PostUploadTask> };
    const fm = page.frontmatter;
    if (!fm?.task_type || !fm.doc_slug) {
      return apiError("not_a_task", "Seite ist kein Post-Upload-Task", 409);
    }
    if (fm.status === "blocked") {
      return apiError(
        "task_blocked",
        "Diese Aufgabe ist endgültig blockiert — das Dokument kann nicht verarbeitet werden.",
        409
      );
    }
    if (fm.status !== "exhausted") {
      return apiError(
        "not_exhausted",
        "Nur endgültig fehlgeschlagene Aufgaben können erneut eingereiht werden",
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
