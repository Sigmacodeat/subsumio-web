import { ENGINE_URL } from "@/lib/engine";
import { scanUpload } from "@/lib/upload-pipeline";
import { createHandler, apiError, recordQuota } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { inferInitialExtractionStatus, createInitialMetadata } from "@/lib/extraction-status";

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

      const result = await scanUpload(file);
      if (!result.ok) {
        return Response.json({ error: result.error, message: result.message }, { status: result.status });
      }

      const cleanForm = new FormData();
      cleanForm.append(
        "file",
        new File([result.buffer], result.cleanName, { type: result.mimeType })
      );
      const title = formData.get("title");
      if (typeof title === "string") cleanForm.append("title", title);
      const source = formData.get("source");
      if (typeof source === "string") cleanForm.append("source", source);
      const tags = formData.get("tags");
      if (typeof tags === "string") cleanForm.append("tags", tags);

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
