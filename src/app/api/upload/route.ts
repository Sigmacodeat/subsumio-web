import { ENGINE_URL } from "@/lib/engine";
import { scanUploadWithDuplicateCheck } from "@/lib/upload-pipeline";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { inferInitialExtractionStatus, createInitialMetadata } from "@/lib/extraction-status";
import { brainDuplicateStore } from "@/lib/duplicate-store";
import { MAX_FILE_SIZE } from "@/lib/upload-validation";

// Hetzner/self-hosted agency uploads can be scanned + proxied synchronously up
// to MAX_FILE_SIZE. If this route runs behind a stricter web host/proxy, that
// layer must be raised too; otherwise the request fails before this handler runs.
export const maxDuration = 600;

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

async function validateCaseSlug(
  headers: Record<string, string>,
  caseSlug: string
): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(caseSlug)}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const page = (await res.json()) as { type?: string };
    return page.type === "legal_case";
  } catch {
    return false;
  }
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    audit: (ctx, _body, _query) => ({
      action: "document.upload" as const,
      entityType: "document",
      details: { userId: ctx.user.id },
    }),
  },
  async (ctx, _body, _query, req) => {
    // Pre-check Content-Length against our limit so we return a meaningful
    // error instead of letting the framework silently abort with a bare 413.
    const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
    if (contentLength > MAX_FILE_SIZE) {
      return apiError(
        "file_too_large",
        `Datei überschreitet das Limit von ${Math.round(MAX_FILE_SIZE / 1024 / 1024 / 1024)} GB.`,
        413
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (parseErr) {
      console.error(
        "[upload] formData parse failed:",
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      );
      return apiError(
        "body_parse_failed",
        "Die Datei konnte nicht verarbeitet werden. Möglicherweise ist sie zu groß oder beschädigt.",
        413
      );
    }
    try {
      const file = formData.get("file");
      const caseSlugRaw = formData.get("case_slug");
      const caseSlugStr = typeof caseSlugRaw === "string" ? caseSlugRaw.trim() : "";
      const sourceRaw =
        typeof formData.get("source") === "string"
          ? (formData.get("source") as string)
          : "documents";

      // Legal document sources require a case association (§ 43e BRAO, GoBD).
      // Knowledge sources (wiki, meetings, ideas, people, companies) are exempt
      // — they are brain-wide reference material, not case-specific documents.
      const LEGAL_SOURCES = new Set(["documents", "legal_case", "legal"]);
      const requiresCase = LEGAL_SOURCES.has(sourceRaw);

      if (requiresCase && !caseSlugStr) {
        return apiError(
          "case_required",
          "Ein Dokument kann nur im Kontext einer Akte hochgeladen werden. Bitte wählen Sie eine Akte aus.",
          400
        );
      }

      if (requiresCase && caseSlugStr) {
        const caseExists = await validateCaseSlug(ctx.headers, caseSlugStr);
        if (!caseExists) {
          return apiError("case_not_found", "Die angegebene Akte existiert nicht.", 404);
        }
      }

      const duplicateStore = brainDuplicateStore(ctx.headers);
      const result = await scanUploadWithDuplicateCheck(file, duplicateStore);
      if (!result.ok) {
        return Response.json(
          { error: result.error, message: result.message },
          { status: result.status }
        );
      }

      const cleanForm = new FormData();
      cleanForm.append(
        "file",
        new File([result.buffer], result.cleanName, { type: result.mimeType })
      );
      const title = formData.get("title");
      if (typeof title === "string") cleanForm.append("title", title);
      cleanForm.append("source", sourceRaw);
      const tags = formData.get("tags");
      if (typeof tags === "string") cleanForm.append("tags", tags);
      if (caseSlugStr) cleanForm.append("case_slug", caseSlugStr);

      const upstream = await fetch(`${ENGINE_URL}/api/upload`, {
        method: "POST",
        headers: ctx.headers,
        body: cleanForm,
        signal: AbortSignal.timeout(540_000),
      }).catch((err: unknown) => {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(
            "Engine-Timeout: Die Datei konnte nicht rechtzeitig verarbeitet werden (PDF-Extraktion/OCR). Bitte erneut versuchen oder kleinere Datei verwenden."
          );
        }
        throw err;
      });

      const text = await upstream.text();
      if (upstream.ok) {
        void recordQuota(ctx, "uploads");

        // Enrich response with extraction status
        const initialStatus = inferInitialExtractionStatus(result.cleanName, result.mimeType);
        const initialMeta = createInitialMetadata(result.cleanName, result.mimeType);
        try {
          const uploadResult = JSON.parse(text) as {
            slug?: string;
            title?: string;
            original_persisted?: boolean;
            persist_error?: string;
          };
          // Record the file hash so identical future uploads are detected as duplicates.
          if (uploadResult.slug) {
            void duplicateStore.record(result.sha256, uploadResult.slug, result.cleanName);
          }

          let reconciliation:
            | { attempted: true; ok: boolean; error?: string }
            | { attempted: false } = { attempted: false };
          // P1.2: Reconcile — add the uploaded document to the case's documents array
          // so the case frontmatter stays in sync with the case_slug on the document page.
          if (caseSlugStr && uploadResult.slug) {
            try {
              await reconcileCaseDocuments(ctx.headers, caseSlugStr, {
                id: Date.now().toString(),
                slug: uploadResult.slug,
                name: uploadResult.title ?? result.cleanName,
                url: uploadResult.slug,
                uploadedAt: new Date().toISOString(),
                size: result.buffer.byteLength,
                kind: (formData.get("document_type") as string) || undefined,
              });
              reconciliation = { attempted: true, ok: true };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error("[upload] case reconciliation failed:", message);
              reconciliation = { attempted: true, ok: false, error: message };
            }
          }
          let analysisStatus: "pending" | "queued" | "failed" = "pending";
          const internalSecret = env("SUBSUMIO_INTERNAL_SECRET");
          if (internalSecret && uploadResult.slug) {
            const docSlug = uploadResult.slug;
            analysisStatus = "queued";
            // Set analysis_status on the document frontmatter so the cockpit
            // can surface documents with pending/failed analysis.
            void patchDocFrontmatter(ctx.headers, docSlug, {
              analysis_status: "pending",
              analysis_queued_at: new Date().toISOString(),
            });
            // Fire analysis and track outcome on the document.
            void runAnalysisWithTracking(
              ctx.headers,
              req.nextUrl.origin,
              internalSecret,
              docSlug,
              ctx.brainId
            );
          }
          // Determine final status: 207 if any sub-operation failed (reconciliation
          // or GoBD persistence), otherwise the upstream status.
          const hasPartialFailure =
            (reconciliation.attempted && !reconciliation.ok) ||
            uploadResult.original_persisted === false;
          return Response.json(
            {
              ...uploadResult,
              extraction_status: initialStatus,
              extraction_metadata: initialMeta,
              case_reconciliation: reconciliation,
              analysis_status: analysisStatus,
            },
            {
              status: hasPartialFailure ? 207 : upstream.status,
            }
          );
        } catch (err) {
          console.error(
            "[upload] upstream response parsing failed:",
            err instanceof Error ? err.message : String(err)
          );
          return new Response(text, {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[upload] failed:", msg);
      // Distinguish body-size errors from other server errors
      if (/body|too large|413|payload/i.test(msg)) {
        return apiError("file_too_large", "Datei überschreitet das Größenlimit.", 413);
      }
      return apiError("service_unavailable", "Upload fehlgeschlagen", 503);
    }
  }
);

/**
 * P1.2/P0-1: After a successful upload, add the document to the case's frontmatter
 * documents array. Fetches the current case page, appends the new document
 * (deduplicated by slug), and PATCHes the case with optimistic locking (If-Match).
 * Retries up to 3 times on 409 version conflict to handle concurrent uploads.
 */
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
  const encodedSlug = caseSlug.split("/").map(encodeURIComponent).join("/");
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!getRes.ok) throw new Error(`case_fetch_failed_${getRes.status}`);
    const casePage = (await getRes.json()) as {
      frontmatter?: Record<string, unknown>;
    };
    const fm = (casePage.frontmatter ?? {}) as Record<string, unknown>;
    const currentVersion = (fm.version as number | undefined) ?? 0;
    const existingDocs = Array.isArray(fm.documents) ? fm.documents : [];
    if (existingDocs.some((d) => (d as Record<string, unknown>).slug === docEntry.slug)) return;
    const updatedDocs = [...existingDocs, docEntry];

    const patchRes = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": String(currentVersion),
        ...headers,
      },
      body: JSON.stringify({
        frontmatter: { ...fm, documents: updatedDocs },
        merge: true,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (patchRes.ok) return;
    if (patchRes.status === 409 && attempt < MAX_RETRIES - 1) {
      // Version conflict — another writer updated the case. Retry with fresh state.
      continue;
    }
    throw new Error(`case_patch_failed_${patchRes.status}`);
  }
  throw new Error("case_patch_conflict_retries_exhausted");
}

/**
 * Patch a document's frontmatter on the engine. Best-effort with proper logging
 * — replaces the old pattern of inline fetch().catch(() => {}) which silently
 * swallowed errors. Every failure is logged so operators can diagnose issues.
 */
async function patchDocFrontmatter(
  headers: Record<string, string>,
  docSlug: string,
  frontmatter: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(docSlug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ frontmatter, merge: true }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`[upload] frontmatter patch failed for ${docSlug}: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[upload] frontmatter patch error for ${docSlug}:`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * Fire the legal analysis endpoint and track the outcome on the document's
 * frontmatter. Replaces the old 4-level nested .catch(() => {}) chain.
 * All errors are logged; the document frontmatter reflects the final state.
 */
async function runAnalysisWithTracking(
  headers: Record<string, string>,
  origin: string,
  internalSecret: string,
  docSlug: string,
  brainId: string
): Promise<void> {
  let analysisError: string | null = null;

  try {
    const res = await fetch(`${origin}/api/legal/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({
        document_slug: docSlug,
        brain_id: brainId,
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      analysisError = `HTTP ${res.status}`;
      console.error(`[upload] analysis failed for ${docSlug}: ${analysisError}`);
    }
  } catch (err) {
    analysisError = err instanceof Error ? err.message : "fetch_error";
    console.error(`[upload] analysis error for ${docSlug}:`, analysisError);
  }

  if (analysisError) {
    await patchDocFrontmatter(headers, docSlug, {
      analysis_status: "failed",
      analysis_error: analysisError,
      analysis_failed_at: new Date().toISOString(),
    });
  }
}
