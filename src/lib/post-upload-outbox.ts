/**
 * Post-upload task outbox — persists bookkeeping tasks to the brain as
 * `post_upload_task` pages so they survive web container restarts.
 *
 * The drain cron (/api/cron/post-upload-drain) picks up pending tasks,
 * executes them, and marks them done. Tasks that fail are retried up to
 * MAX_ATTEMPTS with exponential backoff before being marked exhausted.
 *
 * Tasks written here are idempotent by (doc_slug, task_type) — a duplicate
 * enqueue for the same slug+type is a no-op if a pending task already exists.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { createHash } from "node:crypto";

export type PostUploadTaskType =
  | "reconcile_case" // update case.documents[] array
  | "analyze" // run legal analysis on the document
  | "contradiction"; // run contradiction probe for the case

export interface PostUploadTask {
  doc_slug: string;
  case_slug?: string;
  brain_id: string;
  doc_title?: string;
  doc_size?: number;
  uploaded_at?: string;
  task_type: PostUploadTaskType;
  attempts: number;
  next_attempt_at: string; // ISO timestamp
  status: "pending" | "done" | "exhausted";
  last_error?: string;
}

export const MAX_ATTEMPTS = 4;

function taskSlug(docSlug: string, taskType: PostUploadTaskType): string {
  // Stable slug: deterministic, idempotent re-enqueue same doc+type
  const safe = docSlug.replace(/[^a-z0-9-]/gi, "-").slice(0, 48);
  const hash = createHash("sha256").update(docSlug).digest("hex").slice(0, 16);
  return `legal/post-upload-tasks/${taskType}/${safe}-${hash}`;
}

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

/**
 * Enqueue a post-upload task. Idempotent: if a pending task already exists
 * for this (doc_slug, task_type) it is left unchanged.
 */
export async function enqueuePostUploadTask(
  task: Omit<PostUploadTask, "attempts" | "next_attempt_at" | "status">,
  brainId: string
): Promise<void> {
  const slug = taskSlug(task.doc_slug, task.task_type);
  const headers = {
    ...engineHeadersForBrain(brainId),
    "Content-Type": "application/json",
  };

  // Check if a pending task already exists (idempotency)
  try {
    const existing = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (existing.ok) {
      const page = (await existing.json()) as { frontmatter?: { status?: string } };
      if (page.frontmatter?.status === "pending") return; // already queued
    }
  } catch {
    /* not found or unreachable — proceed to create */
  }

  const payload: PostUploadTask = {
    ...task,
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    status: "pending",
  };

  const create = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      slug,
      title: `Post-upload: ${task.task_type} for ${task.doc_slug}`,
      type: "post_upload_task",
      frontmatter: payload,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!create.ok) {
    throw new Error(`task_create_failed_${create.status}: ${(await create.text()).slice(0, 300)}`);
  }
}

/**
 * Enqueue all standard post-upload tasks for a document in one call.
 */
export async function enqueueAllPostUploadTasks(params: {
  doc_slug: string;
  case_slug?: string;
  brain_id: string;
  doc_title?: string;
  doc_size?: number;
  uploaded_at?: string;
}): Promise<void> {
  const base = {
    doc_slug: params.doc_slug,
    case_slug: params.case_slug,
    brain_id: params.brain_id,
    doc_title: params.doc_title,
    doc_size: params.doc_size,
    uploaded_at: params.uploaded_at ?? new Date().toISOString(),
  };

  const tasks: PostUploadTaskType[] = ["analyze"];
  if (params.case_slug) {
    tasks.push("reconcile_case", "contradiction");
  }

  // Fire all enqueues in parallel — each is idempotent
  await Promise.all(
    tasks.map((task_type) => enqueuePostUploadTask({ ...base, task_type }, params.brain_id))
  );
}
