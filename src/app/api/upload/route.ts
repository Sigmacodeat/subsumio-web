import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { scanUploadWithDuplicateCheck } from "@/lib/upload-pipeline";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { inferInitialExtractionStatus, createInitialMetadata } from "@/lib/extraction-status";
import { brainDuplicateStore } from "@/lib/duplicate-store";
import { MAX_FILE_SIZE } from "@/lib/upload-validation";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";
import { reconcileCaseDocuments } from "@/lib/case-documents";
import { acquireUploadSlot } from "@/lib/upload-concurrency";

// Hetzner/self-hosted agency uploads can be scanned + proxied synchronously up
// to MAX_FILE_SIZE. If this route runs behind a stricter web host/proxy, that
// layer must be raised too; otherwise the request fails before this handler runs.
export const maxDuration = 600;

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

// "exists"      → the case page exists and is a legal_case
// "not_found"   → the engine authoritatively says it isn't there (404 / wrong type)
// "unavailable" → transient (engine 5xx, timeout, network) — the case may well
//                 exist; we must NOT tell the user it's missing (P1-4).
type CaseSlugCheck = "exists" | "not_found" | "unavailable";

async function validateCaseSlug(
  headers: Record<string, string>,
  caseSlug: string
): Promise<CaseSlugCheck> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(caseSlug)}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Timeout / network error — transient, not a real "missing case".
    return "unavailable";
  }
  if (res.status === 404) return "not_found";
  // Any other non-OK (5xx, 429, 401 from an engine hiccup) is transient.
  if (!res.ok) return "unavailable";
  try {
    const page = (await res.json()) as { type?: string };
    return page.type === "legal_case" ? "exists" : "not_found";
  } catch {
    return "unavailable";
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
        `Datei überschreitet das Limit von ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`,
        413
      );
    }

    // P2-3: bound web-container memory. Buffering the file (arrayBuffer for scan +
    // a fresh File/FormData to proxy) costs a few× its size in RAM per upload.
    // The client stagger pool caps per-browser concurrency but not across users,
    // so a burst could OOM the container. Reserve a slot (small vs large) and
    // release it once the whole request finishes. Files above the multipart
    // threshold stream straight to storage and never reach this buffered path.
    let releaseSlot: (() => void) | null = null;
    if (contentLength > 0) {
      const slot = acquireUploadSlot(contentLength);
      if (!slot.ok) {
        return new Response(
          JSON.stringify({
            error: `Zu viele gleichzeitige Uploads (${slot.active}/${slot.max} aktive ${
              slot.large ? "große" : "kleine"
            } Uploads). Bitte in etwa 30 Sekunden erneut versuchen.`,
            code: "upload_concurrency_limit",
          }),
          { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "30" } }
        );
      }
      releaseSlot = slot.release;
    }

    try {
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
        const ALLOWED_SOURCES = new Set([
          "documents",
          "kanzleiwissen",
          "wiki",
          "meetings",
          "people",
          "companies",
          "ideas",
          "chat",
          "legal_case",
          "legal",
        ]);
        const source = ALLOWED_SOURCES.has(sourceRaw) ? sourceRaw : "documents";

        // Legal document sources require a case association (§ 43e BRAO, GoBD).
        // Knowledge sources (wiki, meetings, ideas, people, companies) are exempt
        // — they are brain-wide reference material, not case-specific documents.
        const LEGAL_SOURCES = new Set(["documents", "legal_case", "legal"]);
        const requiresCase = LEGAL_SOURCES.has(source);

        if (requiresCase && !caseSlugStr) {
          return apiError(
            "case_required",
            "Ein Dokument kann nur im Kontext einer Akte hochgeladen werden. Bitte wähle eine Akte aus.",
            400
          );
        }

        if (requiresCase && caseSlugStr) {
          const caseCheck = await validateCaseSlug(ctx.headers, caseSlugStr);
          if (caseCheck === "not_found") {
            return apiError("case_not_found", "Die angegebene Akte existiert nicht.", 404);
          }
          if (caseCheck === "unavailable") {
            // Don't claim the case is missing on a transient engine problem.
            return apiError(
              "case_check_unavailable",
              "Die Akte konnte gerade nicht geprüft werden. Bitte in einem Moment erneut versuchen.",
              503
            );
          }
        }

        // Scope dedup to the case: the same file may legitimately be filed in
        // multiple matters. Caseless (knowledge-source) uploads stay brain-wide.
        const duplicateStore = brainDuplicateStore(ctx.headers, caseSlugStr || undefined);
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
        cleanForm.append("source", source);
        const tags = formData.get("tags");
        if (typeof tags === "string") cleanForm.append("tags", tags);
        if (caseSlugStr) cleanForm.append("case_slug", caseSlugStr);
        const password = formData.get("password");
        if (typeof password === "string" && password.length > 255) {
          return apiError("document_password_too_long", "Dokumentkennwort ist zu lang.", 400);
        }
        if (typeof password === "string" && password) cleanForm.append("password", password);
        const pauseForReview = formData.get("pause_for_review");
        if (typeof pauseForReview === "string" && pauseForReview === "true")
          cleanForm.append("pause_for_review", "true");
        const jurisdictionOverride = formData.get("jurisdiction");
        if (typeof jurisdictionOverride === "string" && jurisdictionOverride)
          cleanForm.append("jurisdiction", jurisdictionOverride);
        const docTypeOverride = formData.get("doc_type");
        if (typeof docTypeOverride === "string" && docTypeOverride)
          cleanForm.append("doc_type", docTypeOverride);
        const deferPipeline = formData.get("defer_pipeline");
        if (deferPipeline === "true") cleanForm.append("defer_pipeline", "true");

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
              extraction_status?: string;
              extraction_method?: string;
              extraction_warnings?: string;
            };
            // Record the file hash so identical future uploads are detected as duplicates.
            // Best-effort: a failed recording is logged but doesn't fail the upload —
            // the engine-side hash dedup (storedDuplicate) remains as safety net.
            if (uploadResult.slug) {
              duplicateStore
                .record(result.sha256, uploadResult.slug, result.cleanName)
                .catch((err) => {
                  console.error(
                    "[upload] duplicate hash recording failed (non-fatal, engine dedup remains):",
                    err instanceof Error ? err.message : String(err)
                  );
                });
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
            const isDeferred = deferPipeline === "true";
            let analysisStatus: "pending" | "queued" | "failed" | "deferred" = isDeferred
              ? "deferred"
              : "pending";
            if (uploadResult.slug) {
              const docSlug = uploadResult.slug;
              if (!isDeferred) {
                analysisStatus = "queued";
                // Mark analysis pending on the document so the cockpit can surface it.
                const pendingPatched = await patchDocFrontmatter(ctx.headers, docSlug, {
                  analysis_status: "pending",
                  analysis_queued_at: new Date().toISOString(),
                });
                if (!pendingPatched) analysisStatus = "failed";
                // Enqueue analysis + contradiction probe to the persistent outbox.
                // The drain cron (/api/cron/post-upload-drain, every 2 min) picks these
                // up with retry-backoff so tasks survive container restarts.
                // SKIPPED when defer_pipeline=true: bulk imports defer all analysis
                // to the single case-level legal-pipeline triggered by finalize.
                try {
                  await enqueueAllPostUploadTasks({
                    doc_slug: docSlug,
                    case_slug: caseSlugStr || undefined,
                    brain_id: ctx.brainId,
                    doc_title: uploadResult.title ?? result.cleanName,
                    doc_size: result.buffer.byteLength,
                    uploaded_at: new Date().toISOString(),
                  });
                } catch (err) {
                  analysisStatus = "failed";
                  console.error(
                    "[upload] outbox enqueue failed:",
                    err instanceof Error ? err.message : String(err)
                  );
                  await patchDocFrontmatter(ctx.headers, docSlug, {
                    analysis_status: "failed",
                    analysis_error:
                      `outbox_enqueue_failed: ${err instanceof Error ? err.message : String(err)}`.slice(
                        0,
                        500
                      ),
                  });
                }
              } else {
                // Bulk import: mark as deferred so the cockpit knows analysis
                // will come from the shared pipeline, not the outbox drain.
                await patchDocFrontmatter(ctx.headers, docSlug, {
                  analysis_status: "deferred",
                  pipeline_deferred: true,
                });
              }
            }
            // Determine final status: 207 if any sub-operation failed (reconciliation
            // or GoBD persistence), otherwise the upstream status.
            const hasPartialFailure =
              (reconciliation.attempted && !reconciliation.ok) ||
              uploadResult.original_persisted === false ||
              analysisStatus === "failed";
            return Response.json(
              {
                ...uploadResult,
                extraction_status: uploadResult.extraction_status ?? initialStatus,
                extraction_metadata: initialMeta,
                extraction_method: uploadResult.extraction_method,
                extraction_warnings: uploadResult.extraction_warnings,
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
    } finally {
      releaseSlot?.();
    }
  }
);

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
    const res = await enginePatchPage(headers, { slug: docSlug, frontmatter });
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
