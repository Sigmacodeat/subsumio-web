import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";
import type { PostUploadTask } from "@/lib/post-upload-outbox";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["exhausted", "pending"]).default("exhausted"),
});

export interface PostUploadTaskView {
  task_slug: string;
  task_type?: string;
  doc_slug: string;
  doc_title?: string;
  case_slug?: string;
  status?: string;
  attempts?: number;
  next_attempt_at?: string;
  last_error?: string;
}

/**
 * GET: list durable post-upload tasks of this brain — exhausted ones are the
 * documents whose bookkeeping (analysis, contradiction probe, register
 * stamp, case reconciliation) permanently failed and need a manual retry.
 * Surfaced in the vault so a failed background job cannot silently leave a
 * document unprocessed.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: querySchema,
  },
  async (ctx, _body, query) => {
    const type = query?.status === "pending" ? "post_upload_task" : "post_upload_task_exhausted";
    let pages;
    try {
      pages = await listEnginePages(ctx.headers, type, 5000);
    } catch {
      return apiError("engine_error", "Engine request failed", 502);
    }
    const wanted = query?.status ?? "exhausted";
    const tasks: PostUploadTaskView[] = pages
      .map((p) => ({ slug: p.slug, ...(p.frontmatter as Partial<PostUploadTask>) }))
      .filter((t) => t.status === wanted && typeof t.task_type === "string")
      .map((t) => ({
        task_slug: t.slug,
        task_type: t.task_type,
        doc_slug: t.doc_slug ?? "",
        doc_title: t.doc_title,
        case_slug: t.case_slug,
        status: t.status,
        attempts: t.attempts,
        next_attempt_at: t.next_attempt_at,
        last_error: t.last_error,
      }));
    return apiSuccess({ tasks });
  }
);
