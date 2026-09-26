import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { logAudit } from "@/lib/audit";
import { readClientMatter } from "@/lib/client-view";
import { isPortalVisibleDocument } from "@/lib/portal-view";
import { caseFrontmatter, type DocumentEntry } from "@/lib/legal-types";
import { applyUploadedFileHeaders } from "@/lib/file-response-headers";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const querySchema = z.object({
  case: z.string().min(1).max(300),
  slug: z.string().min(1).max(300),
  download: z.enum(["0", "1"]).optional(),
});

/**
 * A document the firm released to the client (`portal_visible`, not
 * privileged) of one of the client's matters — same rule as the portal.
 * Every access is audited.
 */
export const GET = createHandler(
  { action: "client.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    const q = query!;
    const viewer = { brainId: ctx.brainId, user: ctx.user };
    let found;
    try {
      found = await readClientMatter(viewer, q.case);
    } catch {
      return apiError("engine_error", "Akte konnte nicht geladen werden", 502);
    }
    if (!found) return apiError("not_found", "Dokument nicht freigegeben", 404);
    const docs = (caseFrontmatter(found.page).documents ?? []) as DocumentEntry[];
    const released = docs.find((d) => d.slug === q.slug && isPortalVisibleDocument(d));
    if (!released) return apiError("not_found", "Dokument nicht freigegeben", 404);

    const path = q.slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/files/${path}`, {
      headers: found.headers,
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!res || !res.ok) return apiError("not_found", "Datei nicht gefunden", 404);
    const headers = new Headers();
    applyUploadedFileHeaders(headers, {
      contentType: res.headers.get("content-type"),
      contentDisposition: res.headers.get("content-disposition"),
      wantInline: q.download !== "1",
    });
    const cl = res.headers.get("content-length");
    if (cl) headers.set("Content-Length", cl);
    headers.set("Cache-Control", "private, no-store");
    void logAudit("document.download", "document", {
      entityId: q.slug,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      details: { via: "client_account", case_slug: found.page.slug },
    });
    return new Response(res.body, { status: 200, headers });
  }
);
