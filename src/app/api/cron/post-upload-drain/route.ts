import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { env } from "@/lib/env";
import type { PostUploadTask } from "@/lib/post-upload-outbox";
import { MAX_ATTEMPTS } from "@/lib/post-upload-outbox";
import { getRecipientsByBrain } from "@/lib/cron-utils";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/post-upload-drain
 *
 * Drains the post_upload_task outbox. Runs every 2 minutes via supercronic.
 * Picks up pending tasks, executes them, and marks them done.
 * Failed tasks are retried with exponential backoff (1m → 4m → 16m → exhausted).
 */

interface TaskPage {
  slug: string;
  frontmatter?: Partial<PostUploadTask>;
}

function backoffMs(attempt: number): number {
  // 1 min → 4 min → 16 min → exhausted
  return Math.min(60_000 * Math.pow(4, attempt), 16 * 60_000);
}

export const GET = createCronHandler(async (_req: NextRequest) => {
  const origin = env("NEXTAUTH_URL") ?? env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  const internalSecret = env("SUBSUMIO_INTERNAL_SECRET") ?? "";

  // The outbox is tenant-scoped in the engine. Enumerate known brains and
  // always carry their source header; an unscoped fetch either fails closed
  // in SaaS mode or only sees the default source.
  const brainIds = [...(await getRecipientsByBrain()).keys()];
  const allPages: TaskPage[] = [];
  for (const brainId of brainIds) {
    const tasksRes = await fetch(`${ENGINE_URL}/api/pages?type=post_upload_task&limit=200`, {
      headers: engineHeadersForBrain(brainId),
      signal: AbortSignal.timeout(15_000),
    });
    if (!tasksRes.ok) {
      console.error(
        `[post-upload-drain] task fetch failed for ${brainId}: HTTP ${tasksRes.status}`
      );
      continue;
    }
    const pages = (await tasksRes.json()) as TaskPage[];
    allPages.push(
      ...pages.map((page) => ({
        ...page,
        frontmatter: { ...page.frontmatter, brain_id: page.frontmatter?.brain_id ?? brainId },
      }))
    );
  }
  const now = new Date();

  const pending = allPages.filter((p) => {
    const fm = p.frontmatter ?? {};
    if (fm.status !== "pending") return false;
    if (!fm.next_attempt_at) return true;
    return new Date(fm.next_attempt_at) <= now;
  });

  let done = 0;
  let failed = 0;
  let exhausted = 0;

  for (const page of pending) {
    const fm = page.frontmatter as PostUploadTask;
    const { doc_slug, case_slug, brain_id, task_type } = fm;
    const attempt = (fm.attempts ?? 0) + 1;
    const headers = engineHeadersForBrain(brain_id);

    // Reconciliation may run immediately, but analysis and contradiction must
    // never inspect the async placeholder or a document without embeddings.
    if (task_type !== "reconcile_case") {
      const readiness = await documentReadiness(headers, doc_slug);
      if (!readiness.ready) {
        const patch = await enginePatchPage(headers, {
          slug: page.slug,
          frontmatter: {
            status: "pending",
            next_attempt_at: new Date(Date.now() + 2 * 60_000).toISOString(),
            last_error: `waiting_for_${readiness.reason}`,
          },
        });
        if (!patch.ok) {
          console.error(`[post-upload-drain] failed to defer ${page.slug}: ${patch.status}`);
        }
        continue;
      }
    }

    let success = false;
    let errorMsg = "";

    try {
      if (task_type === "reconcile_case" && case_slug) {
        await reconcileCaseDocuments(headers, case_slug, {
          id: doc_slug,
          slug: doc_slug,
          name: fm.doc_title ?? doc_slug.split("/").pop() ?? doc_slug,
          url: `/api/files/${doc_slug}`,
          uploadedAt: fm.uploaded_at ?? new Date().toISOString(),
          size: fm.doc_size ?? 0,
          kind: "document",
        });
        success = true;
      } else if (task_type === "analyze" && internalSecret) {
        const res = await fetch(`${origin}/api/legal/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret },
          body: JSON.stringify({ document_slug: doc_slug, brain_id }),
          signal: AbortSignal.timeout(300_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        success = true;
      } else if (task_type === "contradiction" && case_slug && internalSecret) {
        if (!internalSecret) throw new Error("internal_secret_missing");
        const res = await fetch(`${origin}/api/legal/contradictions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret },
          body: JSON.stringify({ case_slug, brain_id }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        success = true;
      } else {
        // Skip — missing secrets or case_slug — mark done to avoid looping
        success = true;
        errorMsg = "skipped_missing_context";
      }
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[post-upload-drain] ${task_type} failed for ${doc_slug} (attempt ${attempt}):`,
        errorMsg
      );
    }

    if (success) {
      // Mark done
      const patch = await enginePatchPage(headers, {
        slug: page.slug,
        type: "post_upload_task_done",
        frontmatter: { status: "done", attempts: attempt, done_at: new Date().toISOString() },
      });
      if (!patch.ok) throw new Error(`task_mark_done_failed_${patch.status}`);
      done++;
    } else if (attempt >= MAX_ATTEMPTS) {
      // Exhausted — give up
      const patch = await enginePatchPage(headers, {
        slug: page.slug,
        type: "post_upload_task_exhausted",
        frontmatter: { status: "exhausted", attempts: attempt, last_error: errorMsg },
      });
      if (!patch.ok)
        console.error(`[post-upload-drain] failed to mark ${page.slug} exhausted: ${patch.status}`);
      exhausted++;
    } else {
      // Schedule retry with backoff
      const nextAt = new Date(Date.now() + backoffMs(attempt)).toISOString();
      const patch = await enginePatchPage(headers, {
        slug: page.slug,
        frontmatter: {
          status: "pending",
          attempts: attempt,
          next_attempt_at: nextAt,
          last_error: errorMsg,
        },
      });
      if (!patch.ok)
        console.error(`[post-upload-drain] failed to reschedule ${page.slug}: ${patch.status}`);
      failed++;
    }
  }

  return Response.json({
    ok: true,
    processed: pending.length,
    done,
    retrying: failed,
    exhausted,
    skipped: allPages.length - pending.length,
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

async function documentReadiness(
  headers: Record<string, string>,
  slug: string
): Promise<{ ready: boolean; reason: string }> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(slug)}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ready: false, reason: `document_http_${res.status}` };
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
    const fm = page.frontmatter ?? {};
    const extraction = String(fm.extraction_status ?? "processing");
    const embedding = String(fm.embedding_status ?? "unknown");
    if (!["ready", "partial", "text_layer", "ocr_complete"].includes(extraction)) {
      return { ready: false, reason: `extraction_${extraction}` };
    }
    if (embedding === "pending" || embedding === "failed") {
      return { ready: false, reason: `embedding_${embedding}` };
    }
    return { ready: true, reason: "ready" };
  } catch {
    return { ready: false, reason: "document_unreachable" };
  }
}

async function reconcileCaseDocuments(
  headers: Record<string, string>,
  caseSlug: string,
  docEntry: {
    id: string;
    slug: string;
    name: string;
    url: string;
    uploadedAt: string;
    size: number;
    kind?: string;
  }
): Promise<void> {
  const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(caseSlug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!getRes.ok) throw new Error(`case_fetch_failed_${getRes.status}`);
  const casePage = (await getRes.json()) as { frontmatter?: Record<string, unknown> };
  const fm = casePage.frontmatter ?? {};
  const existing = Array.isArray(fm.documents) ? fm.documents : [];
  if (existing.some((d) => (d as Record<string, unknown>).slug === docEntry.slug)) return;
  const patchRes = await enginePatchPage(headers, {
    slug: caseSlug,
    frontmatter: { documents: [...existing, docEntry] },
  });
  if (!patchRes.ok) throw new Error(`case_patch_failed_${patchRes.status}`);
}
