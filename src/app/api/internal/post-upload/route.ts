import { z } from "zod";
import { ENGINE_URL, enginePatchPage, engineHeadersForBrain } from "@/lib/engine";
import { hasValidInternalSecret } from "@/lib/auth/internal";
import { NextRequest } from "next/server";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/post-upload
 *
 * Called by the engine after a successful direct upload. Runs the same
 * post-upload bookkeeping that /api/upload does for same-origin uploads:
 *
 *   1. reconcileCaseDocuments — adds the doc entry to the case's
 *      frontmatter.documents[] array (secondary truth; primary is the
 *      case_slug stamp on the doc page itself).
 *   2. triggerContradictionProbe — fires a background contradiction scan
 *      for the affected case so new contradictions surface within minutes
 *      instead of waiting for the nightly 03:00 cron.
 *
 * Auth: x-internal-secret header (shared HMAC secret, same as all
 * other internal server-to-server calls). Never exposed to the browser.
 */

const bodySchema = z.object({
  /** Document slug as stored in the engine. */
  doc_slug: z.string().min(1).max(500),
  /** Case slug this document was assigned to (optional — no-op if absent). */
  case_slug: z.string().min(1).max(500).optional(),
  /** Brain / tenant ID that owns the document. */
  brain_id: z.string().min(1).max(200),
  /** Display name of the uploaded file. */
  doc_title: z.string().max(500).optional(),
  /** File size in bytes. */
  doc_size: z.number().int().min(0).optional(),
  /** Timestamp of the upload (ISO-8601). Defaults to now. */
  uploaded_at: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (!hasValidInternalSecret(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", detail: parsed.error.message }, { status: 400 });
  }
  const body = parsed.data;
  const { doc_slug, case_slug, brain_id, doc_title, doc_size, uploaded_at } = body;
  const headers = engineHeadersForBrain(brain_id);

  const results: Record<string, string> = {};

  // 1. Reconcile case documents array (synchronous — fast, caller waits for this)
  if (case_slug) {
    try {
      await reconcileCaseDocuments(headers, case_slug, {
        id: doc_slug,
        slug: doc_slug,
        name: doc_title ?? doc_slug.split("/").pop() ?? doc_slug,
        url: `/api/files/${doc_slug}`,
        uploadedAt: uploaded_at ?? new Date().toISOString(),
        size: doc_size ?? 0,
        kind: "document",
      });
      results.reconcile = "ok";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[post-upload] reconcileCaseDocuments failed for ${doc_slug}:`, msg);
      results.reconcile = `failed: ${msg}`;
    }
  }

  // 2 + 3. Enqueue remaining tasks to the persistent outbox.
  //   - analyze: runs legal analysis via /api/legal/analyze
  //   - contradiction (only if case_slug): runs contradiction probe via /api/cron/contradiction-probe
  //   The drain cron (/api/cron/post-upload-drain, every 2 min) picks these up with
  //   retry-with-backoff — tasks survive web container restarts.
  try {
    await enqueueAllPostUploadTasks({
      doc_slug,
      case_slug,
      brain_id,
      doc_title,
      doc_size,
      uploaded_at,
    });
    results.queued = "analyze" + (case_slug ? ",contradiction" : "");
  } catch (err) {
    console.error(
      "[post-upload] outbox enqueue failed (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
    results.queued = "enqueue_failed";
    return Response.json(
      { ok: false, error: "outbox_enqueue_failed", doc_slug, case_slug, ...results },
      { status: 503 }
    );
  }

  return Response.json({ ok: true, doc_slug, case_slug, ...results });
}

// ── helpers (mirrors upload/route.ts — kept local to avoid circular imports) ──

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
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
  const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
  const existingDocs = Array.isArray(fm.documents) ? fm.documents : [];
  if (existingDocs.some((d) => (d as Record<string, unknown>).slug === docEntry.slug)) return;
  const updatedDocs = [...existingDocs, docEntry];
  const patchRes = await enginePatchPage(headers, {
    slug: caseSlug,
    frontmatter: { documents: updatedDocs },
  });
  if (!patchRes.ok) throw new Error(`case_patch_failed_${patchRes.status}`);
}
