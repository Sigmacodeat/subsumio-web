import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

const retrySchema = z.object({
  slug: z.string().min(1).max(300),
});

/**
 * POST /api/documents/retry — re-trigger extraction + analysis for a failed
 * document. Resets extraction_status to "processing" and analysis_status to
 * "pending", clears error fields, and re-enqueues post-upload tasks.
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
      details: { by: ctx.user.email },
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

    // 2. Reset frontmatter: clear errors, set to processing/pending
    const patchRes = await enginePatchPage(ctx.headers, {
      slug: body.slug,
      frontmatter: {
        extraction_status: "processing",
        extraction_error: null,
        extraction_error_code: null,
        analysis_status: "pending",
        analysis_failed_at: null,
        analysis_retry_count: 0,
        analysis_reconciled_by: "manual-retry",
        retried_at: new Date().toISOString(),
        retried_by: ctx.user.email,
      },
    });

    if (!patchRes.ok) {
      return apiError("engine_error", "Dokument konnte nicht aktualisiert werden", 502);
    }

    // 3. Re-enqueue post-upload tasks (idempotent)
    try {
      await enqueueAllPostUploadTasks({
        doc_slug: body.slug,
        case_slug: caseSlug,
        brain_id: ctx.brainId,
        doc_title: typeof fm.title === "string" ? fm.title : undefined,
        doc_size: typeof fm.doc_size === "number" ? fm.doc_size : undefined,
        uploaded_at: typeof fm.uploaded_at === "string" ? fm.uploaded_at : undefined,
      });
    } catch (err) {
      console.error("[documents/retry] enqueue failed:", err);
      // Non-fatal — the upload-reconcile sweeper will pick it up
    }

    // 4. Broadcast SSE
    broadcastSseEvent(ctx.brainId, "document.uploaded", {
      slug: body.slug,
      retried: true,
      by: ctx.user.email,
    });

    // 5. Audit log
    await logAudit("document.retry", "document", {
      entityId: body.slug,
      brainId: ctx.brainId,
      details: {
        previous_extraction_status: extractionStatus,
        previous_analysis_status: analysisStatus,
        by: ctx.user.email,
      },
    });

    return apiSuccess({ ok: true, slug: body.slug });
  }
);
