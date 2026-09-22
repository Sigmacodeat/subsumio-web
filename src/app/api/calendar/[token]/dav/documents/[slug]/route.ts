import { ENGINE_URL } from "@/lib/engine";
import { resolveFeedToken } from "@/lib/feed-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/<userId>.<secret>/dav/documents/<slug> — document bytes
 * for the read-only WebDAV bridge. Serves the uploaded original when one
 * exists (`/api/files/<slug>` on the engine), otherwise the page content as
 * UTF-8 markdown so every entry in the mounted drive is readable.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string; slug: string }> }
) {
  const { token, slug } = await context.params;
  const auth = await resolveFeedToken(token ?? "");
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 429 ? "rate_limited" : "not_found" },
      { status: auth.status }
    );
  }

  const safeSlug = decodeURIComponent(slug ?? "");
  if (!safeSlug || safeSlug.includes("..")) {
    return Response.json({ error: "invalid_slug" }, { status: 400 });
  }
  const encoded = safeSlug.split("/").map(encodeURIComponent).join("/");

  try {
    // Prefer the original upload (PDF/DOCX/…). 404 means "no stored file",
    // in which case the page content is the document.
    const fileRes = await fetch(`${ENGINE_URL}/api/files/${encoded}`, {
      headers: auth.headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (fileRes.ok) {
      const headers = new Headers();
      headers.set(
        "Content-Type",
        fileRes.headers.get("content-type") ?? "application/octet-stream"
      );
      const cd = fileRes.headers.get("content-disposition");
      if (cd) headers.set("Content-Disposition", cd);
      const cl = fileRes.headers.get("content-length");
      if (cl) headers.set("Content-Length", cl);
      headers.set("Cache-Control", "no-store");
      return new Response(fileRes.body, { status: 200, headers });
    }
    if (fileRes.status !== 404) throw new Error(`engine file ${fileRes.status}`);

    const pageRes = await fetch(`${ENGINE_URL}/api/pages/${encoded}`, {
      headers: auth.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (pageRes.status === 404) return Response.json({ error: "not_found" }, { status: 404 });
    if (!pageRes.ok) throw new Error(`engine page ${pageRes.status}`);
    const page = (await pageRes.json()) as { title?: string; content?: string };
    const body = `# ${page.title ?? safeSlug}\n\n${page.content ?? ""}`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "document_unavailable" }, { status: 502 });
  }
}
