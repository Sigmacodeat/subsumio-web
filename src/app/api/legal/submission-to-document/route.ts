import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { createHandler, apiError, apiSuccess, recordQuota } from "@/lib/api-handler";
import { reconcileCaseDocuments } from "@/lib/case-documents";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";
import { inferInitialExtractionStatus, createInitialMetadata } from "@/lib/extraction-status";

const bodySchema = z.object({
  submissionSlug: z.string().min(1).max(500),
});

export const dynamic = "force-dynamic";
export const maxDuration = 600;

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

interface SubmissionMedia {
  filename: string;
  mime_type: string;
  sha256: string;
  size_bytes: number;
  storage_provider: string;
  storage_path: string;
}

interface SubmissionPage {
  slug: string;
  title?: string;
  frontmatter?: {
    case_slug?: string;
    media?: SubmissionMedia;
    documents_imported?: boolean;
    [key: string]: unknown;
  };
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "document.import_from_submission" as const,
      entityType: "client_submission",
      entityId: body.submissionSlug,
      details: { userId: ctx.user.id },
    }),
  },
  async (ctx, body) => {
    const { submissionSlug } = body;

    // 1. Read the submission page from the engine
    let submissionPage: SubmissionPage;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(submissionSlug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return apiError("not_found", "Einreichung konnte nicht geladen werden", 404);
      }
      submissionPage = (await res.json()) as SubmissionPage;
    } catch {
      return apiError("service_unavailable", "Engine nicht erreichbar", 503);
    }

    const fm = submissionPage.frontmatter ?? {};
    const media = fm.media;
    const caseSlug = fm.case_slug;

    if (!media || !media.storage_path) {
      return apiError("bad_request", "Diese Einreichung enthält keine Datei", 400);
    }
    if (!caseSlug) {
      return apiError("bad_request", "Einreichung ist keiner Akte zugeordnet", 400);
    }
    if (fm.documents_imported) {
      return apiSuccess({
        ok: true,
        alreadyImported: true,
        message: "Dokumente bereits importiert",
      });
    }

    // 2. Fetch the stored file bytes from the engine
    let fileBuffer: ArrayBuffer;
    try {
      const fileRes = await fetch(`${ENGINE_URL}/api/files/${encodeSlug(submissionSlug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(120_000),
      });
      if (!fileRes.ok) {
        return apiError("not_found", "Datei konnte nicht geladen werden", 404);
      }
      fileBuffer = await fileRes.arrayBuffer();
    } catch {
      return apiError("service_unavailable", "Datei konnte nicht abgerufen werden", 503);
    }

    // 3. Re-upload through the engine's upload endpoint as a proper legal document
    const formData = new FormData();
    formData.append(
      "file",
      new File([fileBuffer], media.filename, {
        type: media.mime_type || "application/octet-stream",
      })
    );
    formData.append("source", "legal");
    formData.append("case_slug", caseSlug);

    let uploadResult: {
      slug?: string;
      title?: string;
      extraction_status?: string;
      extraction_method?: string;
    };

    try {
      const upstream = await fetch(`${ENGINE_URL}/api/upload`, {
        method: "POST",
        headers: ctx.headers,
        body: formData,
        signal: AbortSignal.timeout(540_000),
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        console.error("[submission-to-document] upload failed:", text.slice(0, 500));
        return apiError("internal_error", "Upload an die Engine fehlgeschlagen", 502);
      }
      uploadResult = JSON.parse(text);
    } catch (err) {
      console.error(
        "[submission-to-document] upload error:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Upload fehlgeschlagen", 502);
    }

    const docSlug = uploadResult.slug;
    if (!docSlug) {
      return apiError("internal_error", "Kein Dokument-Slug erhalten", 502);
    }

    // 4. Reconcile case documents — add the new document to the case's documents[] array
    let reconciliationOk = true;
    try {
      await reconcileCaseDocuments(ctx.headers, caseSlug, {
        id: Date.now().toString(),
        slug: docSlug,
        name: uploadResult.title ?? media.filename,
        url: docSlug,
        uploadedAt: new Date().toISOString(),
        size: media.size_bytes ?? fileBuffer.byteLength,
        kind: "client_submission",
      });
    } catch (err) {
      reconciliationOk = false;
      console.error(
        "[submission-to-document] case reconciliation failed:",
        err instanceof Error ? err.message : String(err)
      );
    }

    // 5. Enqueue post-upload analysis tasks (OCR, legal pipeline, contradiction probe)
    let analysisEnqueued = true;
    try {
      await enqueueAllPostUploadTasks({
        doc_slug: docSlug,
        case_slug: caseSlug,
        brain_id: ctx.brainId,
        doc_title: uploadResult.title ?? media.filename,
        doc_size: media.size_bytes ?? fileBuffer.byteLength,
        uploaded_at: new Date().toISOString(),
      });
    } catch (err) {
      analysisEnqueued = false;
      console.error(
        "[submission-to-document] outbox enqueue failed:",
        err instanceof Error ? err.message : String(err)
      );
    }

    // 6. Mark the submission as documents_imported
    try {
      await enginePatchPage(ctx.headers, {
        slug: submissionSlug,
        frontmatter: {
          documents_imported: true,
          documents_imported_at: new Date().toISOString(),
          documents_imported_by: ctx.user.id,
          imported_document_slug: docSlug,
        },
      });
    } catch {
      // Non-fatal — the document is already created and reconciled
    }

    void recordQuota(ctx, "uploads");

    const initialStatus = inferInitialExtractionStatus(media.filename, media.mime_type);
    const initialMeta = createInitialMetadata(media.filename, media.mime_type);

    return apiSuccess({
      ok: true,
      documentSlug: docSlug,
      documentTitle: uploadResult.title ?? media.filename,
      caseSlug,
      extraction_status: uploadResult.extraction_status ?? initialStatus,
      extraction_metadata: initialMeta,
      case_reconciliation: { attempted: true, ok: reconciliationOk },
      analysis_enqueued: analysisEnqueued,
    });
  }
);
