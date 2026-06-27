import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiNotFound } from "@/lib/api-handler";

export const dynamic = "force-dynamic";
// Large originals (up to 1 GB) stream through; give the proxy headroom.
export const maxDuration = 600;

function buildPath(slug: string[]): string | null {
  if (slug.some((s) => s.includes(".."))) return null;
  return slug.map(encodeURIComponent).join("/");
}

/**
 * GET /api/files/<slug> — download the ORIGINAL uploaded file for a document.
 *
 * Session-authenticated proxy to the engine's matter-scoped /api/files route.
 * The signed identity token in ctx.headers carries the caller's matterScope, so
 * the engine returns 404 for documents outside the caller's cases (intentionally
 * indistinguishable from not-found). Bytes are streamed, never buffered here.
 */
export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    // Confidentiality (§ 43e BRAO / GoBD): every original-document access is
    // recorded — who fetched which document, when. Fires only on a successful
    // (200) download; out-of-scope/404 leaves no misleading "access" entry.
    audit: (ctx) => ({
      action: "document.download" as const,
      entityType: "document",
      entityId: (ctx as unknown as { __slug?: string }).__slug,
      details: { userId: ctx.user.id },
    }),
  },
  async (ctx, _body, _query, req) => {
    const path = buildPath(
      (await (req as unknown as { params: Promise<{ slug: string[] }> }).params).slug
    );
    if (!path) return apiError("invalid_slug", "Invalid slug", 400);
    // Expose the slug to the audit callback (runs after a 200 response).
    (ctx as unknown as { __slug?: string }).__slug = decodeURIComponent(path);

    try {
      const res = await fetch(`${ENGINE_URL}/api/files/${path}`, {
        headers: ctx.headers,
      signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404) return apiNotFound("not_found");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const headers = new Headers();
      const ct = res.headers.get("content-type");
      const cd = res.headers.get("content-disposition");
      const cl = res.headers.get("content-length");
      headers.set("Content-Type", ct || "application/octet-stream");
      if (cd) headers.set("Content-Disposition", cd);
      if (cl) headers.set("Content-Length", cl);

      return new Response(res.body, { status: 200, headers });
    } catch (err) {
      console.error(
        "[files/...slug] download failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiNotFound("not_found");
    }
  }
);
