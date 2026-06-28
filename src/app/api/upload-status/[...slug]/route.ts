import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _body, _query, req) => {
    const params = await (req as unknown as { params: Promise<{ slug: string[] }> }).params;
    const slug = Array.isArray(params.slug) ? params.slug.join("/") : "";
    if (!slug || params.slug.some((segment) => segment.includes(".."))) {
      return apiError("invalid_slug", "Ungültiger Dokument-Slug", 400);
    }
    const path = params.slug.map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers: ctx.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return apiError("document_not_found", "Dokument nicht gefunden", 404);
    if (!res.ok) return apiError("engine_error", `Engine returned ${res.status}`, 502);
    const page = (await res.json()) as {
      slug: string;
      title?: string;
      updated_at?: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = page.frontmatter ?? {};
    const extraction =
      typeof fm.extraction_status === "string" ? fm.extraction_status : "processing";
    const embedding = typeof fm.embedding_status === "string" ? fm.embedding_status : "unknown";
    const status = ["failed", "error", "ocr_failed"].includes(extraction)
      ? "failed"
      : ["ready", "partial", "text_layer", "ocr_complete"].includes(extraction) &&
          (embedding === "ready" || embedding === "unknown")
        ? "ready_to_query"
        : "processing";
    return Response.json({
      slug: page.slug,
      title: page.title,
      status,
      extraction_status: extraction,
      extraction_method: fm.extraction_method,
      extraction_warnings: fm.extraction_warnings,
      extraction_error: fm.extraction_error,
      // Machine-readable failure reason set by the async extract-document worker
      // (password_required | invalid_document_password | unsupported_format |
      // extraction_error | original_bytes_missing) so the UI can show an
      // actionable prompt instead of a generic "failed".
      extraction_error_code: fm.extraction_error_code,
      embedding_status: embedding,
      analysis_status: fm.analysis_status,
      updated_at: page.updated_at,
    });
  }
);
