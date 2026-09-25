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

      const caseSlug = String(fm.case_slug ?? event.customFields.case_slug ?? "");
      if (status === "completed" && caseSlug) {
        try {
          const pdf = await downloadEnvelopeDocuments(envelopeId);
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
          if (entry) {
            documentStored = await appendDocumentsToMatter(brainId, caseSlug, [entry]);
            await enginePatchPage(
              headers,
              { slug: page.slug, frontmatter: { signed_document_slug: entry.slug } },
              { timeoutMs: 15_000 }
            );
          }
        } catch (docErr) {
          log.error(
            "[docusign-webhook] signed document not stored",
            docErr instanceof Error ? docErr.message : String(docErr)
          );
        }
      }

      if (status === "declined") {
        declined = true;
        try {
          // Active firm staff only; a matter's decline only to people who
          // may open that matter (unreadable matter → admins only).
          const staff = activeStaffRecipients((await getRecipientsByBrain()).get(brainId) ?? []);
          const matterPermissions = caseSlug
            ? await matterPermissionsForSlug(brainId, caseSlug)
            : new Map();
          const recipients = recipientsForMatter(staff, caseSlug || null, matterPermissions);
          for (const recipient of recipients) {
            await createNotificationFailureNotification({
              userId: recipient.id,
              brainId,
              caseSlug: caseSlug || page.slug,
              caseTitle: String(fm.case_title ?? fm.title ?? "Signaturanfrage"),
              deadlineTitle: "DocuSign-Signatur",
              deadlineDate: now,
              channels: ["docusign"],
              reason: "envelope_declined",
            });
          }
        } catch (notifErr) {
          log.error(
            "[docusign-webhook] declined notification failed",
            notifErr instanceof Error ? notifErr.message : String(notifErr)
          );
        }
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
  const pages = await listEnginePages(headers, "signature_request", 50_000);
  return pages.find((p) => p.frontmatter?.docusign_envelope_id === envelopeId) ?? null;
}
