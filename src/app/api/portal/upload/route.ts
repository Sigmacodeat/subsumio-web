import { PORTAL_SESSION_SLUG, PORTAL_TOKEN_HEADER, portalToken } from "@/lib/portal-session";
import { resolvePortalAccess } from "@/lib/portal-access";
import { MAX_FILE_SIZE } from "@/lib/upload-validation";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { apiError, createPublicHandler } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { scanUploadWithDuplicateCheck } from "@/lib/upload-pipeline";
import { brainDuplicateStore } from "@/lib/duplicate-store";
import { isPortalTokenSuperseded } from "@/lib/portal-token";
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
  submitDocumentRequestItem,
} from "@/lib/portal-fulfillment";
import { isPortalVisibleRequest } from "@/lib/portal-view";
import type { BrainPage } from "@/lib/types";
import { enqueueAllPostUploadTasks } from "@/lib/post-upload-outbox";
import { withKeyedLock } from "@/lib/keyed-lock";
import { caseDocumentsLockKey } from "@/lib/case-documents";
import { stampInboundEntryBestEffort } from "@/lib/inbound-register-stamp";

export const dynamic = "force-dynamic";

/** Largest multipart body accepted: the file limit plus room for the form fields. */
const MAX_PORTAL_UPLOAD_BODY = MAX_FILE_SIZE + 1024 * 1024;

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

/**
 * The request a portal upload answers: only the one the client explicitly
 * picked, only if it belongs to this matter, is addressed to the client and
 * is actually open (sent or partially fulfilled). Uploads without a chosen
 * request land in the matter only — they never tick off a request.
 */
async function findChosenDocumentRequest(
  brainId: string,
  caseSlug: string,
  requestSlug: string
): Promise<{
  slug: string;
  frontmatter: DocumentRequestFrontmatter;
  content?: string;
  title: string;
} | null> {
  const page = await getPage(brainId, requestSlug);
  const request = page ? documentRequestFromPage(page) : null;
  if (!request || request.frontmatter.case_slug !== caseSlug) return null;
  if (!isPortalVisibleRequest(request)) return null;
  const status = request.frontmatter.status;
  if (status !== "sent" && status !== "partially_fulfilled") return null;
  return request;
}

export const POST = createPublicHandler(
  {
    cors: true,
    skipCsrf: true,
    rateLimitKey: (req) => `portal-upload:ip:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60_000,
    audit: (_ctx, _body, _query) => ({
      action: "document.upload" as const,
      entityType: "document",
      details: { source: "portal" },
    }),
  },
  async (req) => {
    // Access is checked BEFORE the body is read: the token comes from the
    // request header or the portal session cookie, never only from the
    // multipart body, and an oversized declared body is refused unread.
    const accessToken = portalToken(req, req.headers.get(PORTAL_TOKEN_HEADER));
    if (!accessToken) {
      return apiError("invalid_or_expired_token", "Token ungueltig oder abgelaufen", 403);
    }
    const declaredLength = Number(req.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PORTAL_UPLOAD_BODY) {
      return apiError("file_too_large", "Die Datei ist zu groß.", 413);
    }
    const access = await resolvePortalAccess(accessToken);
    if (access instanceof Response) return access;
    const payload = access.payload;

    const formData = await req.formData();
    const token = formData.get("token");
    // A token in the form must not point somewhere else than the checked one.
    if (
      typeof token === "string" &&
      token &&
      token !== PORTAL_SESSION_SLUG &&
      token !== accessToken
    ) {
      return apiError("invalid_or_expired_token", "Token ungueltig oder abgelaufen", 403);
    }
    const file = formData.get("file");
    const documentRequestSlug = formData.get("document_request_slug");
    const itemKey = formData.get("item_key");
    const password = formData.get("password");
    if (typeof password === "string" && password.length > 255) {
      return apiError("document_password_too_long", "Dokumentkennwort ist zu lang.", 400);
    }

    // Scope dedup to this portal case so a client can send the same document to
    // different matters without a false "already exists" block (P1-1).
    const duplicateStore = brainDuplicateStore(
      engineHeadersForBrain(payload.brain_id),
      payload.case_slug || undefined
    );
    const scan = await scanUploadWithDuplicateCheck(file, duplicateStore);
    if (!scan.ok) {
      // A duplicate names the firm's internal file and slug — the client
      // only learns that the firm already has this file.
      const message =
        scan.error === "duplicate_file"
          ? "Diese Datei liegt Ihrer Kanzlei bereits vor."
          : scan.message;
      return Response.json({ error: scan.error, message }, { status: scan.status });
    }

    const casePage = await getPage(payload.brain_id, payload.case_slug);
    if (!casePage) return apiError("case_not_found", "Akte konnte nicht geladen werden", 404);

    const caseFm = caseFrontmatter(casePage);
    if (caseFm.status === "archived") {
      return apiError(
        "case_archived",
        "Diese Akte wurde archiviert und ist nicht mehr verfügbar.",
        403
      );
    }
    if (!caseFm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Diese Akte ist derzeit nicht für das Mandantenportal freigegeben.",
        403
      );
    }
    if (isPortalTokenSuperseded(payload, caseFm.portal_links_reset_at as string | undefined)) {
      return apiError(
        "link_revoked",
        "Dieser Link wurde widerrufen. Bitte fordern Sie einen neuen bei Ihrer Kanzlei an.",
        403
      );
    }

    const uploadForm = new FormData();
    uploadForm.append("file", new File([scan.buffer], scan.cleanName, { type: scan.mimeType }));
    uploadForm.append("title", scan.cleanName);
    uploadForm.append("source", "portal");
    uploadForm.append("tags", JSON.stringify([payload.case_slug, "portal"]));
    uploadForm.append("case_slug", payload.case_slug);
    if (typeof password === "string" && password) uploadForm.append("password", password);

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

    // The engine upload can take minutes; everything read before it may be
    // stale. Each list is therefore re-read and written under its lock, so
    // parallel uploads (or firm edits) never drop each other's entries.
    const brainId: string = payload.brain_id;
    const chosenRequestSlug =
      typeof documentRequestSlug === "string" && documentRequestSlug
        ? documentRequestSlug
        : undefined;
    const chosenItemKey = typeof itemKey === "string" && itemKey ? itemKey : undefined;
    const requestOutcome =
      chosenRequestSlug && chosenItemKey
        ? await withKeyedLock(`document-request:${brainId}:${payload.case_slug}`, async () => {
            const found = await findChosenDocumentRequest(
              brainId,
              payload.case_slug,
              chosenRequestSlug
            );
            const submitted = found
              ? submitDocumentRequestItem(found.frontmatter, upload.slug as string, chosenItemKey)
              : null;
            // Nothing to record unless the chosen item exists and is still open.
            if (!found || !submitted?.matchedItem) {
              return { failed: false as const, fulfilled: null, request: null };
            }
            const ok = await updatePage(brainId, {
              slug: found.slug,
              title: found.title,
              type: "document_request",
              content: found.content,
              frontmatter: {
                items: submitted.items,
                updated_at: new Date().toISOString(),
              },
            });
            if (!ok) return { failed: true as const, fulfilled: submitted, request: found };
            return { failed: false as const, fulfilled: submitted, request: found };
          })
        : { failed: false as const, fulfilled: null, request: null };
    if (requestOutcome.failed)
      return apiError(
        "document_request_update_failed",
        "Dokumentenanfrage konnte nicht aktualisiert werden",
        502
      );
    const { fulfilled, request } = requestOutcome;

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

    // Same lock as every other writer of the matter's document list.
    const caseUpdated = await withKeyedLock(
      caseDocumentsLockKey(brainId, payload.case_slug),
      async () => {
        const fresh = await getPage(brainId, payload.case_slug);
        if (!fresh) return false;
        const freshFm = caseFrontmatter(fresh);
        const existingComms = (
          Array.isArray(freshFm.communications) ? freshFm.communications : []
        ) as CommunicationEntry[];
        const updatedFrontmatter: Partial<CaseFrontmatter> = {
          documents: appendCaseDocument(
            freshFm.documents as DocumentEntry[] | undefined,
            documentEntry
          ),
          communications: existingComms.some((c) => c.id === communication.id)
            ? existingComms
            : [...existingComms, communication],
        };
        return updatePage(brainId, {
          slug: fresh.slug,
          title: fresh.title,
          type: String(
            (fresh.frontmatter as Record<string, unknown> | undefined)?.type || "legal_case"
          ),
          frontmatter: updatedFrontmatter as Record<string, unknown>,
        });
      }
    );
    if (!caseUpdated)
      return apiError(
        "case_update_failed",
        "Akte konnte nach dem Upload nicht aktualisiert werden",
        502
      );

    // Posteingangsbuch: Mandanten-Uploads sind Eingänge wie jeder andere
    // Kanal — ohne Stempel fehlen sie in der revisionssicheren Übersicht.
    // Best-effort wie beim Dashboard-Upload.
    await stampInboundEntryBestEffort(
      engineHeadersForBrain(payload.brain_id),
      {
        channel: "portal",
        subject: upload.title || scan.cleanName,
        senderName: "Mandantenportal",
        caseSlug: payload.case_slug,
        documentSlug: upload.slug,
      },
      payload.brain_id
    );

    // Portal uploads must enter the exact same durable analysis pipeline as
    // authenticated dashboard uploads.
    const pendingPatch = await enginePatchPage(engineHeadersForBrain(payload.brain_id), {
      slug: upload.slug,
      frontmatter: {
        analysis_status: "pending",
        analysis_queued_at: now,
      },
    });
    if (!pendingPatch.ok) {
      return apiError(
        "analysis_queue_status_failed",
        "Analyse-Status konnte nicht gespeichert werden",
        502
      );
    }
    try {
      await enqueueAllPostUploadTasks({
        doc_slug: upload.slug,
        case_slug: payload.case_slug,
        brain_id: payload.brain_id,
        doc_title: upload.title || scan.cleanName,
        doc_size: scan.buffer.byteLength,
        uploaded_at: now,
      });
    } catch (err) {
      await enginePatchPage(engineHeadersForBrain(payload.brain_id), {
        slug: upload.slug,
        frontmatter: {
          analysis_status: "failed",
          analysis_error:
            `outbox_enqueue_failed: ${err instanceof Error ? err.message : String(err)}`.slice(
              0,
              500
            ),
        },
      });
      return apiError(
        "post_upload_queue_failed",
        "Dokument gespeichert, Folgeanalyse konnte aber nicht eingeplant werden",
        503
      );
    }

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
      matchedItem: fulfilled?.matchedItem
        ? { key: fulfilled.matchedItem.key, label: fulfilled.matchedItem.label }
        : undefined,
      original_persisted: upload.original_persisted ?? true,
      ...(upload.original_persisted === false ? { persist_error: upload.persist_error } : {}),
    });
  }
);
