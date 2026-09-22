import { ENGINE_URL } from "@/lib/engine";
import { resolveFeedToken } from "@/lib/feed-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/<userId>.<secret>/dav/documents — JSON document listing
 * for the read-only WebDAV bridge (`scripts/dav-server.ts`).
 *
 * Same credential as the calendar subscription: `<userId>.<secret>` in the
 * path. The bridge proxies with it, so mounted drives see exactly the
 * documents the token owner may see (engine-side matterScope applies).
 */
export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await resolveFeedToken(token ?? "");
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 429 ? "rate_limited" : "not_found" },
      { status: auth.status }
    );
  }

  try {
    const url = new URL(`${ENGINE_URL}/api/pages`);
    url.searchParams.set("type", "document");
    url.searchParams.set("limit", "200");
    const res = await fetch(url.toString(), {
      headers: auth.headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`engine pages ${res.status}`);
    const raw = await res.json();
    const pages = Array.isArray(raw) ? raw : [];

    const documents = pages.map((p) => {
      const page = p as {
        slug?: string;
        title?: string;
        updated_at?: string;
        frontmatter?: Record<string, unknown>;
      };
      const fm = page.frontmatter ?? {};
      const fileName = typeof fm.file_name === "string" ? fm.file_name : "";
      return {
        slug: String(page.slug ?? ""),
        title: String(page.title ?? page.slug ?? ""),
        fileName,
        mimeType: typeof fm.mime_type === "string" ? fm.mime_type : "",
        size: typeof fm.file_size === "number" ? fm.file_size : null,
        updated: String(page.updated_at ?? ""),
        hasFile: Boolean(fileName),
      };
    });

    return Response.json(
      { documents },
      { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }
    );
  } catch {
    return Response.json({ error: "documents_unavailable" }, { status: 502 });
  }
}
