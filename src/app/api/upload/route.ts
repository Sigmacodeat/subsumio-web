import { ENGINE_URL } from "@/lib/engine";
import { scanUploadWithDuplicateCheck } from "@/lib/upload-pipeline";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { inferInitialExtractionStatus, createInitialMetadata } from "@/lib/extraction-status";
import { brainDuplicateStore } from "@/lib/duplicate-store";

async function validateCaseSlug(
  headers: Record<string, string>,
  caseSlug: string
): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, { headers });
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
    try {
      const formData = await req.formData();
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
      });

      const text = await upstream.text();
      if (upstream.ok) {
        void recordQuota(ctx, "uploads");

        // Enrich response with extraction status
        const initialStatus = inferInitialExtractionStatus(result.cleanName, result.mimeType);
        const initialMeta = createInitialMetadata(result.cleanName, result.mimeType);
        try {
          const uploadResult = JSON.parse(text) as { slug?: string; title?: string };
          // Record the file hash so identical future uploads are detected as duplicates.
          if (uploadResult.slug) {
            void duplicateStore.record(result.sha256, uploadResult.slug, result.cleanName);
          }
          const enriched = JSON.stringify({
            ...uploadResult,
            extraction_status: initialStatus,
            extraction_metadata: initialMeta,
          });
          const internalSecret = env("SUBSUMIO_INTERNAL_SECRET");
          if (internalSecret && uploadResult.slug) {
            void fetch(`${req.nextUrl.origin}/api/legal/analyze`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-secret": internalSecret,
              },
              body: JSON.stringify({
                document_slug: uploadResult.slug,
                brain_id: ctx.brainId,
              }),
            }).catch(() => {
              /* silent: analysis is best-effort */
            });
          }
          return new Response(enriched, {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          // JSON parse failed — return original text
        }
      }
      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[upload] failed:", err instanceof Error ? err.message : String(err));
      return apiError("service_unavailable", "Upload fehlgeschlagen", 503);
    }
  }
);
