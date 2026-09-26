import { listEnginePages } from "@/lib/engine-pages";
import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import {
  isWebhookProcessed,
  markWebhookProcessed,
  verifyDocusignConnectSignature,
  downloadEnvelopeDocuments,
} from "@/lib/docusign";
import {
  SIGNATURE_STATUS_FROM_DOCUSIGN,
  connectEventKey,
  parseConnectJson,
  parseConnectXml,
  type ConnectEvent,
} from "@/lib/docusign-connect";
import { appendDocumentsToMatter, uploadFileToMatter } from "@/lib/email/mail-filing";
import { createWebhookHandler } from "@/lib/api-handler";
import { createNotificationFailureNotification } from "@/lib/comments";
import {
  activeStaffRecipients,
  getRecipientsByBrain,
  matterPermissionsForSlug,
  recipientsForMatter,
} from "@/lib/cron-utils";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const log = logger("api/docusign/webhook");

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * POST /api/docusign/webhook — DocuSign Connect envelope events.
 *
 * 1. HMAC over the raw body (X-DocuSign-Signature-1) before anything else.
 * 2. JSON or XML; firm and matter come from the envelope custom fields set at
 *    sending (brain_id, case_slug).
 * 3. Processed once per envelope AND status, so "sent" does not swallow
 *    "completed".
 * 4. The signature request's status follows DocuSign; on completion the
 *    signed PDF is stored as a document of the matter; on decline the firm is
 *    notified.
 */
export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const rawBody = await req.clone().text();

  const connectSecret = process.env.DOCUSIGN_CONNECT_SECRET;
  if (!connectSecret) {
    log.error("[docusign-webhook] DOCUSIGN_CONNECT_SECRET not configured — rejecting webhook");
    return Response.json({ error: "webhook_not_configured" }, { status: 501 });
  }
  const signature = req.headers.get("x-docusign-signature-1");
  if (!verifyDocusignConnectSignature(rawBody, signature, connectSecret)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: ConnectEvent;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("xml") || rawBody.trimStart().startsWith("<")) {
    event = parseConnectXml(rawBody);
  } else {
    try {
      event = parseConnectJson(JSON.parse(rawBody));
    } catch {
      return Response.json({ ok: true, error: "invalid_json" });
    }
  }

  const { envelopeId, status } = event;
  const key = connectEventKey(event);
  if (!envelopeId || !status || !key) return Response.json({ ok: true });
  if (await isWebhookProcessed(key)) return Response.json({ ok: true, dedup: true });

  const mapped = SIGNATURE_STATUS_FROM_DOCUSIGN[status] ?? status;
  const brainId = event.customFields.brain_id;
  if (!brainId) {
    log.warn("[docusign-webhook] envelope without brain_id custom field — skipping", {
      envelopeId,
    });
    return Response.json({ ok: true, skipped: true });
  }

  const headers = engineHeadersForBrain(brainId);
  let updated = false;
  let documentStored = false;
  let declined = false;

  try {
    const page = await findSignatureRequest(headers, envelopeId);
    if (!page) {
      log.warn("[docusign-webhook] no signature request for envelope", { envelopeId });
    } else {
      const fm = page.frontmatter ?? {};
      const now = new Date().toISOString();
      const patch = await enginePatchPage(
        headers,
        {
          slug: page.slug,
          frontmatter: {
            status: mapped,
            // Kept as the Subsumio status for existing readers; the raw DocuSign value alongside.
            docusign_status: mapped,
            docusign_event: status,
            docusign_updated_at: now,
            ...(status === "completed" ? { signed_at: now } : {}),
          },
        },
        { timeoutMs: 15_000 }
      );
      updated = patch.ok;
      if (!updated) throw new Error(`status patch failed: HTTP ${patch.status}`);

      const caseSlug = String(fm.case_slug ?? event.customFields.case_slug ?? "");
      if (status === "completed" && caseSlug) {
        if (typeof fm.signed_document_slug === "string" && fm.signed_document_slug) {
          // An earlier delivery already filed the signed PDF (retry).
          documentStored = true;
        } else {
          let signedSlug: string | null = null;
          try {
            signedSlug = await storeSignedDocument(brainId, caseSlug, envelopeId, fm);
            documentStored = signedSlug !== null;
          } catch (docErr) {
            log.error(
              "[docusign-webhook] signed document not stored",
              docErr instanceof Error ? docErr.message : String(docErr)
            );
            documentStored = false;
          }
          if (!documentStored) {
            // Not marked as processed: DocuSign delivers the event again. After a
            // few failed attempts the firm is told to fetch the document itself.
            const failures = Number(fm.docusign_store_failures ?? 0) + 1;
            await enginePatchPage(
              headers,
              { slug: page.slug, frontmatter: { docusign_store_failures: failures } },
              { timeoutMs: 15_000 }
            ).catch(() => null);
            if (failures === STORE_FAILURE_NOTIFY_AFTER) {
              await notifyStaff(
                brainId,
                caseSlug,
                page.slug,
                fm,
                now,
                "signed_document_not_stored"
              );
            }
            return Response.json({ ok: false, error: "document_not_stored" }, { status: 500 });
          }
          if (signedSlug) {
            await enginePatchPage(
              headers,
              { slug: page.slug, frontmatter: { signed_document_slug: signedSlug } },
              { timeoutMs: 15_000 }
            );
          }
        }
      }

      if (status === "declined") {
        declined = true;
        await notifyStaff(brainId, caseSlug, page.slug, fm, now, "envelope_declined");
      }

      void logAudit("docusign.status", "envelope", {
        entityId: envelopeId,
        brainId,
        details: { status, mapped, caseSlug: caseSlug || undefined, documentStored },
      });
    }
  } catch (err) {
    log.error("[docusign-webhook] update failed", err instanceof Error ? err.message : String(err));
    // Not marked as processed: DocuSign retries.
    return Response.json({ ok: false }, { status: 500 });
  }

  await markWebhookProcessed(key, envelopeId, status);
  return Response.json({ ok: true, envelopeId, mapped, updated, documentStored, declined });
});

/** Failed attempts to file the signed PDF after which the firm is told. */
const STORE_FAILURE_NOTIFY_AFTER = 3;
/** Upper bound for a signed envelope PDF. */
const MAX_SIGNED_PDF_BYTES = 50 * 1024 * 1024;

/**
 * Downloads the signed envelope and files it in the matter. Returns the new
 * document slug, or null when it could not be filed.
 */
async function storeSignedDocument(
  brainId: string,
  caseSlug: string,
  envelopeId: string,
  fm: Record<string, unknown>
): Promise<string | null> {
  const pdf = await downloadEnvelopeDocuments(envelopeId);
  if (pdf.byteLength === 0 || pdf.byteLength > MAX_SIGNED_PDF_BYTES) {
    throw new Error(`unexpected document size ${pdf.byteLength}`);
  }
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new Error("downloaded document is not a PDF");
  }
  const title = String(fm.title ?? "Dokument")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .slice(0, 80);
  const entry = await uploadFileToMatter(
    brainId,
    caseSlug,
    {
      filename: `${title || "Dokument"} (unterschrieben).pdf`,
      contentType: "application/pdf",
      size: pdf.byteLength,
      content: pdf,
    },
    "docusign"
  );
  if (!entry) return null;
  const appended = await appendDocumentsToMatter(brainId, caseSlug, [entry]);
  // "" = filed, but the storage returned no page slug to link.
  return appended ? (entry.slug ?? "") : null;
}

/**
 * In-app notice to active firm staff; for a matter only to people who may
 * open it (unreadable matter → admins only).
 */
async function notifyStaff(
  brainId: string,
  caseSlug: string,
  pageSlug: string,
  fm: Record<string, unknown>,
  now: string,
  reason: "envelope_declined" | "signed_document_not_stored"
): Promise<void> {
  try {
    const staff = activeStaffRecipients((await getRecipientsByBrain()).get(brainId) ?? []);
    const matterPermissions = caseSlug
      ? await matterPermissionsForSlug(brainId, caseSlug)
      : new Map();
    const recipients = recipientsForMatter(staff, caseSlug || null, matterPermissions);
    for (const recipient of recipients) {
      await createNotificationFailureNotification({
        userId: recipient.id,
        brainId,
        caseSlug: caseSlug || pageSlug,
        caseTitle: String(fm.case_title ?? fm.title ?? "Signaturanfrage"),
        deadlineTitle: "DocuSign-Signatur",
        deadlineDate: now,
        channels: ["docusign"],
        reason,
      });
    }
  } catch (notifErr) {
    log.error(
      "[docusign-webhook] notification failed",
      notifErr instanceof Error ? notifErr.message : String(notifErr)
    );
  }
}

async function findSignatureRequest(
  headers: Record<string, string>,
  envelopeId: string
): Promise<{ slug: string; frontmatter?: Record<string, unknown> } | null> {
  // Requests sent from Subsumio have a predictable slug.
  const direct = await fetch(
    `${ENGINE_URL}/api/pages/${["legal", "signatures", `docusign-${envelopeId}`].map(encodeURIComponent).join("/")}`,
    { headers, signal: AbortSignal.timeout(10_000) }
  );
  if (direct.ok)
    return (await direct.json()) as { slug: string; frontmatter?: Record<string, unknown> };

  // Older requests: search the list.
  // Strict: a failed read must not look like "no request" (the event would be
  // marked processed and never retried).
  const pages = await listEnginePages(headers, "signature_request", 50_000, { strict: true });
  return pages.find((p) => p.frontmatter?.docusign_envelope_id === envelopeId) ?? null;
}
