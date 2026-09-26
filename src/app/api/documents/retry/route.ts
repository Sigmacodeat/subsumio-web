import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";
import { getAuditExtra, setAuditExtra } from "@/lib/audit-context";
import { broadcastSseEvent } from "@/lib/realtime-bus";

import { logger } from "@/lib/logger";
const log = logger("api/documents/retry");

export const dynamic = "force-dynamic";

const retrySchema = z.object({
  slug: z.string().min(1).max(300),
});

/**
 * Re-queue the text extraction of a document through the engine. The engine
 * can only re-run it for documents it marked for an OCR backfill; returns
 * false for every other document (nothing is queued then).
 */
async function requeueExtraction(headers: Record<string, string>, slug: string): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/ocr/backfill`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ slugs: [slug] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { queued?: unknown };
    return Array.isArray(data.queued) && data.queued.includes(slug);
  } catch {
    return false;
  }
}

/**
 * POST /api/documents/retry — retry a failed document.
 *
 * - Failed text extraction is only reported as "processing" when a real
 *   extraction job was queued. Otherwise the failure and its cause stay
 *   visible (the file has to be uploaded again) — a reset without a job
 *   left documents "in progress" forever with the cause erased.
 * - Failed analysis is reset to "pending" and the post-upload tasks are
 *   re-enqueued.
 *
 * Used by the Operations-Cockpit retry button on failed document items.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: retrySchema,
    audit: (ctx, body) => ({
      action: "document.retry" as const,
      entityType: "document",
      entityId: body.slug,
      details: { by: ctx.user.email, ...getAuditExtra(ctx)?.details },
    }),
  },
  async (ctx, body) => {
    // 1. Fetch current frontmatter to get case_slug + check it's actually failed
    const fetchRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
      headers: ctx.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (fetchRes.status === 404) {
      return apiError("document_not_found", "Dokument nicht gefunden", 404);
    }
    if (!fetchRes.ok) {
      return apiError("engine_error", `Engine returned ${fetchRes.status}`, 502);
    }
    const page = (await fetchRes.json()) as {
      slug: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};
    const extractionStatus = String(fm.extraction_status ?? "");
    const analysisStatus = String(fm.analysis_status ?? "");

    // Only allow retry on failed items
    if (extractionStatus !== "failed" && analysisStatus !== "failed") {
      return apiError("not_failed", "Dokument ist nicht fehlgeschlagen — Retry nicht möglich", 400);
    }

    const caseSlug = typeof fm.case_slug === "string" ? fm.case_slug : undefined;
    const extractionFailed = extractionStatus === "failed";
    const analysisFailed = analysisStatus === "failed";

    // 2. Extraction: only a queued job may turn "failed" into "processing".
    //    Without extracted text an analysis retry is pointless, so a document
    //    whose extraction cannot be re-run keeps its failure (and cause).
    let extractionRetry: "queued" | "not_needed" = "not_needed";
    if (extractionFailed) {
      if (await requeueExtraction(ctx.headers, body.slug)) {
        extractionRetry = "queued";
      } else {
        return apiError(
          "reextract_unavailable",
          "Die Texterkennung kann für dieses Dokument nicht automatisch wiederholt werden. Bitte laden Sie die Datei erneut hoch.",
          409
        );
      }
    }

    // 3. Reset what is actually being retried; keep the rest as it is.
    const now = new Date().toISOString();
    const patchFm: Record<string, unknown> = {
      retried_at: now,
      retried_by: ctx.user.email,
    };
    if (extractionRetry === "queued") {
      Object.assign(patchFm, {
        extraction_status: "processing",
        extraction_error: null,
        extraction_error_code: null,
      });
    }
    if (analysisFailed || extractionRetry === "queued") {
      Object.assign(patchFm, {
        analysis_status: "pending",
        analysis_failed_at: null,
        analysis_retry_count: 0,
        analysis_reconciled_by: "manual-retry",
      });
    }
    const patchRes = await enginePatchPage(ctx.headers, {
      slug: body.slug,
      frontmatter: patchFm,
    });

    if (!patchRes.ok) {
      return apiError("engine_error", "Dokument konnte nicht aktualisiert werden", 502);
    }

    // 4. Re-enqueue post-upload tasks (idempotent)
    try {
      await enqueueAllPostUploadTasks({
        doc_slug: body.slug,
        case_slug: caseSlug,
        brain_id: ctx.brainId,
        doc_title: typeof fm.title === "string" ? fm.title : undefined,
        doc_size: typeof fm.doc_size === "number" ? fm.doc_size : undefined,
        uploaded_at: typeof fm.uploaded_at === "string" ? fm.uploaded_at : undefined,
        // Explicit user retry: re-run even tasks that already finished.
        force: true,
      });
    } catch (err) {
      log.error("[documents/retry] enqueue failed:", err);
      // Non-fatal — the upload-reconcile sweeper will pick it up
    }

    // 5. Broadcast SSE
    broadcastSseEvent(ctx.brainId, "document.uploaded", {
      slug: body.slug,
      retried: true,
      by: ctx.user.email,
    });

    // 6. Audit: one entry, written by createHandler from the `audit:` spec.
    setAuditExtra(ctx, {
      details: {
        previous_extraction_status: extractionStatus,
        previous_analysis_status: analysisStatus,
        extraction_retry: extractionRetry,
      },
    });

    return apiSuccess({ ok: true, slug: body.slug, extraction_retry: extractionRetry });
  }
);
