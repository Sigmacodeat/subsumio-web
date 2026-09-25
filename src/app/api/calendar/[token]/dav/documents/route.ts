import { listEnginePages } from "@/lib/engine-pages";
import { resolveFeedToken } from "@/lib/feed-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/<userId>.<secret>/dav/documents — JSON document listing
 * for the read-only WebDAV bridge (`scripts/dav-server.ts`).
 *
 * Credential: the separate DAV access token `<userId>.<secret>` in the path
 * (scope "documents", see src/lib/feed-auth.ts). The calendar subscription
 * link is refused here — it is handed to Google/Outlook and must never open
 * the document archive. The bridge proxies with the DAV token, so mounted
 * drives see exactly the documents the token owner may see (engine-side
 * matterScope applies).
 */
export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const auth = await resolveFeedToken(token ?? "", "documents");
  if (!auth.ok) {
    return Response.json(
      { error: auth.status === 429 ? "rate_limited" : "not_found" },
      { status: auth.status }
    );
  }

  try {
    // The 200 most recent documents — paged, one engine request returns 100.
    const pages = await listEnginePages(auth.headers, "document", 200, {
      strict: true,
      timeoutMs: 15_000,
    });

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
