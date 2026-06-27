import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { apiError, createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { scanUpload } from "@/lib/upload-pipeline";
import { verifyPortalToken } from "@/lib/portal-token";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  caseFrontmatter,
  type CaseFrontmatter,
  type DocumentEntry,
  type CommunicationEntry,
} from "@/lib/legal-types";
import { documentRequestFromPage, type DocumentRequestFrontmatter } from "@/lib/document-requests";
import {
  appendCaseDocument,
  buildPortalDocumentEntry,
  buildPortalUploadCommunication,
  fulfillDocumentRequestItems,
} from "@/lib/portal-fulfillment";
import type { BrainPage } from "@/lib/types";

export const dynamic = "force-dynamic";

function pagesFrom(data: unknown): BrainPage[] {
  if (Array.isArray(data)) return data as BrainPage[];
  if (data && typeof data === "object" && Array.isArray((data as { pages?: unknown }).pages)) {
    return (data as { pages: BrainPage[] }).pages;
  }
  if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: BrainPage[] }).items;
  }
  return [];
}

async function getPage(brainId: string, slug: string): Promise<BrainPage | null> {
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
    headers: engineHeadersForBrain(brainId),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return (await res.json()) as BrainPage;
}

async function updatePage(
  brainId: string,
  input: {
    slug: string;
    title?: string;
    type?: string;
    content?: string;
    frontmatter?: Record<string, unknown>;
  }
): Promise<boolean> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...engineHeadersForBrain(brainId) },
    body: JSON.stringify({ ...input, merge: true }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

async function findOpenDocumentRequest(
  brainId: string,
  caseSlug: string,
  preferredSlug?: string
): Promise<{
  slug: string;
  frontmatter: DocumentRequestFrontmatter;
  content?: string;
  title: string;
} | null> {
  if (preferredSlug) {
    const page = await getPage(brainId, preferredSlug);
    const request = page ? documentRequestFromPage(page) : null;
    if (request?.frontmatter.case_slug === caseSlug) return request;
    return null;
  }

  const res = await fetch(`${ENGINE_URL}/api/pages?type=document_request&limit=200`, {
    headers: engineHeadersForBrain(brainId),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;

  return (
    pagesFrom(await res.json())
      .map(documentRequestFromPage)
      .filter(
        (request): request is NonNullable<ReturnType<typeof documentRequestFromPage>> =>
          request !== null
      )
      .filter((request) => request.frontmatter.case_slug === caseSlug)
      .filter(
        (request) =>
          request.frontmatter.status !== "fulfilled" && request.frontmatter.status !== "expired"
      )
      .sort(
        (a, b) =>
          new Date(b.frontmatter.created_at).getTime() -
          new Date(a.frontmatter.created_at).getTime()
      )[0] ?? null
  );
}

export const POST = createPublicHandler(
  {
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-upload:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
  },
  async (req) => {
    const formData = await req.formData();
    const token = formData.get("token");
    const file = formData.get("file");
    const documentRequestSlug = formData.get("document_request_slug");
    const itemKey = formData.get("item_key");

    const payload = await verifyPortalToken(typeof token === "string" ? token : null);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungueltig oder abgelaufen", 403);
    }
    if (!payload.brain_id) {
      return apiError(
        "new_portal_link_required",
        "Bitte fordern Sie einen neuen Portal-Link bei Ihrer Kanzlei an.",
        403
      );
    }

    const scan = await scanUpload(file);
    if (!scan.ok) {
      return Response.json({ error: scan.error, message: scan.message }, { status: scan.status });
    }

    const casePage = await getPage(payload.brain_id, payload.case_slug);
    if (!casePage) return apiError("case_not_found", "Akte konnte nicht geladen werden", 404);

    const caseFm = caseFrontmatter(casePage);
    if (!caseFm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Diese Akte ist derzeit nicht fuer das Mandantenportal freigegeben.",
        403
      );
    }

    const uploadForm = new FormData();
    uploadForm.append("file", new File([scan.buffer], scan.cleanName, { type: scan.mimeType }));
    uploadForm.append("title", scan.cleanName);
    uploadForm.append("source", "portal");
    uploadForm.append("tags", JSON.stringify([payload.case_slug, "portal"]));
    uploadForm.append("case_slug", payload.case_slug);

    const upstream = await fetch(`${ENGINE_URL}/api/upload`, {
      method: "POST",
      headers: engineHeadersForBrain(payload.brain_id),
      body: uploadForm,
      signal: AbortSignal.timeout(540_000),
    }).catch((err: unknown) => {
      if (err instanceof Error && err.name === "TimeoutError") {
        return new Response(
          JSON.stringify({
            error: "engine_timeout",
            message: "Die Verarbeitung dauerte zu lang. Bitte erneut versuchen.",
          }),
          { status: 504, headers: { "Content-Type": "application/json" } }
        );
      }
      throw err;
    });
    const uploadText = await upstream.text();
    if (!upstream.ok) {
      return new Response(uploadText, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
      });
    }

    const upload = JSON.parse(uploadText) as {
      slug?: string;
      title?: string;
      original_persisted?: boolean;
      persist_error?: string;
    };
    if (!upload.slug)
      return apiError(
        "upload_missing_slug",
        "Upload wurde gespeichert, aber ohne Dokument-Slug zurueckgegeben",
        502
      );

    const request = await findOpenDocumentRequest(
      payload.brain_id,
      payload.case_slug,
      typeof documentRequestSlug === "string" && documentRequestSlug
        ? documentRequestSlug
        : undefined
    );
    const fulfilled = request
      ? fulfillDocumentRequestItems(
          request.frontmatter,
          upload.slug,
          scan.cleanName,
          typeof itemKey === "string" && itemKey ? itemKey : undefined
        )
      : null;

    if (request && fulfilled) {
      const ok = await updatePage(payload.brain_id, {
        slug: request.slug,
        title: request.title,
        type: "document_request",
        content: request.content,
        frontmatter: {
          items: fulfilled.items,
          status: fulfilled.status,
          updated_at: new Date().toISOString(),
        },
      });
      if (!ok)
        return apiError(
          "document_request_update_failed",
          "Dokumentenanfrage konnte nicht aktualisiert werden",
          502
        );
    }

    const now = new Date().toISOString();
    const documentEntry = buildPortalDocumentEntry({
      slug: upload.slug,
      name: upload.title || scan.cleanName,
      size: scan.buffer.byteLength,
      uploadedAt: now,
      matchedKind: fulfilled?.matchedItem?.label,
    });
    const communication = buildPortalUploadCommunication({
      documentSlug: upload.slug,
      documentName: documentEntry.name,
      at: now,
    });
    const updatedFrontmatter: Partial<CaseFrontmatter> = {
      documents: appendCaseDocument(caseFm.documents as DocumentEntry[] | undefined, documentEntry),
      communications: [
        ...((Array.isArray(caseFm.communications)
          ? caseFm.communications
          : []) as CommunicationEntry[]),
        communication,
      ],
    };

    const caseUpdated = await updatePage(payload.brain_id, {
      slug: casePage.slug,
      title: casePage.title,
      type: String(
        (casePage.frontmatter as Record<string, unknown> | undefined)?.type || "legal_case"
      ),
      frontmatter: updatedFrontmatter as Record<string, unknown>,
    });
    if (!caseUpdated)
      return apiError(
        "case_update_failed",
        "Akte konnte nach dem Upload nicht aktualisiert werden",
        502
      );

    broadcastSseEvent(payload.brain_id, "portal.document_uploaded", {
      caseSlug: payload.case_slug,
      documentSlug: upload.slug,
      documentRequestSlug: request?.slug,
      documentRequestStatus: fulfilled?.status,
    });
    if (request) {
      broadcastSseEvent(payload.brain_id, "document_request.updated", {
        slug: request.slug,
        status: fulfilled?.status,
      });
    }

    return Response.json({
      ok: true,
      document: documentEntry,
      caseSlug: payload.case_slug,
      documentRequestSlug: request?.slug,
      documentRequestStatus: fulfilled?.status,
      matchedItem: fulfilled?.matchedItem,
      original_persisted: upload.original_persisted ?? true,
      ...(upload.original_persisted === false ? { persist_error: upload.persist_error } : {}),
    });
  }
);
