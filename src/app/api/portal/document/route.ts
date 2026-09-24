import { z } from "zod";
import { portalToken } from "@/lib/portal-session";
import { ENGINE_URL } from "@/lib/engine";
import { createPublicHandler, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { logAudit } from "@/lib/audit";
import { resolvePortalAccess } from "@/lib/portal-access";
import { isPortalVisibleDocument } from "@/lib/portal-view";
import { caseFrontmatter, type DocumentEntry } from "@/lib/legal-types";

import { applyUploadedFileHeaders } from "@/lib/file-response-headers";
import { logger } from "@/lib/logger";
const log = logger("api/portal/document");

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const querySchema = z.object({
  token: z.string().min(1),
  slug: z.string().min(1).max(300),
  download: z.enum(["0", "1"]).optional(),
});

/**
 * A document the firm released to the client (`portal_visible`, not
 * privileged), streamed for the portal link's matter only. The original file
 * opens in the browser unless `download=1` (passive types only — anything
 * else is always an attachment); every access is audited.
 */
export const GET = createPublicHandler(
  {
    query: querySchema,
    rateLimitKey: (req) => `portal-doc:${clientIp(req.headers)}`,
    rateLimitMax: 60,
    rateLimitWindowMs: 60_000,
  },
  async (req, _body, query) => {
    if (!query) return apiError("invalid_request", "Ungültige Anfrage", 400);
    const access = await resolvePortalAccess(portalToken(req, query.token));
    if (access instanceof Response) return access;

    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(access.caseSlug)}`, {
      headers: access.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!caseRes.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const docs = (caseFrontmatter(await caseRes.json()).documents ?? []) as DocumentEntry[];
    const released = docs.find((d) => d.slug === query.slug && isPortalVisibleDocument(d));
    if (!released) return apiError("not_found", "Dokument nicht freigegeben", 404);

    try {
      const path = query.slug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/files/${path}`, {
        headers: access.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return apiError("not_found", "Datei nicht gefunden", 404);
      const headers = new Headers();
      applyUploadedFileHeaders(headers, {
        contentType: res.headers.get("content-type"),
        contentDisposition: res.headers.get("content-disposition"),
        wantInline: query.download !== "1",
      });
      const cl = res.headers.get("content-length");
      if (cl) headers.set("Content-Length", cl);
      headers.set("Cache-Control", "private, no-store");
      void logAudit("document.download", "document", {
        entityId: query.slug,
        brainId: access.payload.brain_id,
        details: { via: "portal", case_slug: access.caseSlug },
      });
      return new Response(res.body, { status: 200, headers });
    } catch (err) {
      log.error("portal document failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return apiError("not_found", "Dokument nicht verfügbar", 404);
    }
  }
);
