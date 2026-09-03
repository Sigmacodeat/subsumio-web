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
 *
 * G10 fix: the pre-fix code did a GET-then-POST race — two concurrent
 * enqueues could both see 404 and both create. Now we skip the GET and
 * rely on the deterministic slug + PUT (upsert) semantics. If the page
 * already exists with status "pending", the PUT overwrites it with the
 * same pending state (idempotent). If it exists with "done"/"exhausted",
 * we check first via GET but treat 409/conflict as "already queued".
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

  // Quick idempotency check: if a pending task already exists, skip.
  // This is best-effort — the PUT below is the real idempotency guarantee.
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
    /* not found or unreachable — proceed to upsert */
  }

  const payload: PostUploadTask = {
    ...task,
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
    status: "pending",
  };

  // Use PUT (upsert) instead of POST (create) — if the page already exists
  // (race condition with concurrent enqueue), PUT overwrites it idempotently
  // with the same pending state. A 409 conflict is treated as "already queued".
  const upsert = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      slug,
      title: `Post-upload: ${task.task_type} for ${task.doc_slug}`,
      type: "post_upload_task",
      frontmatter: payload,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!upsert.ok && upsert.status !== 409) {
    throw new Error(`task_upsert_failed_${upsert.status}: ${(await upsert.text()).slice(0, 300)}`);
  }
  // 409 = another concurrent enqueue won the race — that's fine, the task
  // is queued either way. No error needed.
}

/**
 * Enqueue all standard post-upload tasks for a document in one call.
 *
 * G9 fix: added retry logic (3 attempts with 1s backoff) to handle
 * transient engine failures. Pre-fix, a single failed enqueue would
 * silently lose the task — the document was already persisted but no
 * analysis/reconcile/contradiction task was ever queued.
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

  // G9 fix: retry each enqueue up to 3 times with 1s backoff.
  // Each enqueue is idempotent, so retrying is safe.
  const MAX_RETRIES = 3;
  const results = await Promise.allSettled(
    tasks.map(async (task_type) => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await enqueuePostUploadTask({ ...base, task_type }, params.brain_id);
          return; // success
        } catch (err) {
          lastErr = err;
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }
      // All retries exhausted — log and rethrow so caller knows
      console.error(
        `[post-upload-outbox] Failed to enqueue ${task_type} for ${params.doc_slug} after ${MAX_RETRIES} attempts:`,
        lastErr
      );
      throw lastErr;
    })
  );

  // If any task failed after all retries, throw the first failure
  // so the caller can handle it (e.g. return an error to the user).
  const firstFailure = results.find((r) => r.status === "rejected");
  if (firstFailure && firstFailure.status === "rejected") {
    throw firstFailure.reason;
  }
}
