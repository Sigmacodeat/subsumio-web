import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import {
  isWebhookProcessed,
  markWebhookProcessed,
  verifyDocusignConnectSignature,
  downloadEnvelopeDocuments,
} from "@/lib/docusign";
import { createWebhookHandler } from "@/lib/api-handler";
import { createNotificationFailureNotification } from "@/lib/comments";
import { getRecipientsByBrain } from "@/lib/cron-utils";

export const maxDuration = 30;

export const dynamic = "force-dynamic";

/**
 * POST /api/docusign/webhook
 * Empfängt Docusign Connect Webhook Events (Envelope Status Updates).
 * Verifiziert HMAC-Signatur über X-DocuSign-Signature-1.
 * Dedup: gleiche Event-IDs werden idempotent behandelt.
 *
 * Events:
 *   - envelope-completed → Update Brain-Page (signature_request) zu "signed" + signed PDF download & upload to case
 *   - envelope-declined → Update zu "declined" + visible notification to all recipients
 *   - envelope-voided   → Update zu "expired"
 */
/**
 * Parse DocuSign Connect XML payload into the same shape as the JSON webhook.
 * DocuSign Connect XML contains <EnvelopeStatus><EnvelopeID>, <Status>, and
 * <RecipientStatuses> elements. We extract the key fields without a full XML
 * parser to keep the dependency footprint minimal.
 */
function parseDocusignXml(xml: string): {
  event?: string;
  data?: {
    envelopeId?: string;
    envelopeSummary?: {
      status?: string;
      recipients?: {
        signers?: Array<{ status: string; signedDateTime?: string; email?: string }>;
      };
    };
  };
  eventId?: string;
} {
  const extract = (tag: string): string | undefined => {
    const match = xml.match(
      new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, "i")
    );
    return match?.[1]?.trim();
  };

  const envelopeId = extract("EnvelopeID") ?? extract("EnvelopeId");
  const status = extract("Status");
  const event = extract("EventType") ?? extract("Event");

  return {
    event: event ?? undefined,
    eventId: envelopeId,
    data: {
      envelopeId: envelopeId ?? undefined,
      envelopeSummary: {
        status: status ?? undefined,
      },
    },
  };
}

export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const rawBody = await req.clone().text();

  // HMAC verification FIRST — before any processing or database lookups.
  // This prevents unauthenticated requests from triggering idempotency checks
  // or leaking information about processed events.
  const connectSecret = process.env.DOCUSIGN_CONNECT_SECRET;
  if (!connectSecret) {
    console.error("[docusign-webhook] DOCUSIGN_CONNECT_SECRET not configured — rejecting webhook");
    return Response.json({ error: "webhook_not_configured" }, { status: 501 });
  }
  const signature = req.headers.get("x-docusign-signature-1");
  if (!verifyDocusignConnectSignature(rawBody, signature, connectSecret)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Parse payload — DocuSign Connect can send JSON or XML (XML is the default).
  // Try JSON first, fall back to XML extraction.
  let body: {
    event?: string;
    data?: {
      envelopeId?: string;
      envelopeSummary?: {
        status?: string;
        recipients?: {
          signers?: Array<{ status: string; signedDateTime?: string; email?: string }>;
        };
      };
    };
    eventId?: string;
  };
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("xml") || rawBody.trimStart().startsWith("<")) {
    body = parseDocusignXml(rawBody);
  } else {
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return Response.json({ ok: true, error: "invalid_json" });
    }
  }

  const eventId = body.eventId ?? body.data?.envelopeId;
  const envelopeId = body.data?.envelopeId;
  const status = body.data?.envelopeSummary?.status;

  if (!envelopeId || !status) {
    return Response.json({ ok: true }); // Acknowledge even on malformed
  }

  // Idempotency: skip already processed events (Postgres-backed)
  if (eventId && (await isWebhookProcessed(eventId))) {
    return Response.json({ ok: true, dedup: true });
  }

  // Map Docusign → Subsumio status
  const statusMap: Record<string, string> = {
    completed: "signed",
    declined: "declined",
    voided: "expired",
    sent: "sent",
    created: "draft",
  };
  const mapped = statusMap[status] || status;

  // Resolve tenant from envelope metadata (multi-tenant safe)
  const envelopeData = body.data as {
    envelope?: {
      customFields?: { brain_id?: string };
      metadata?: { brain_id?: string };
    };
    envelopeSummary?: {
      customFields?: { brain_id?: string };
      metadata?: { brain_id?: string };
    };
  };
  const brainId =
    envelopeData.envelope?.customFields?.brain_id ??
    envelopeData.envelope?.metadata?.brain_id ??
    envelopeData.envelopeSummary?.customFields?.brain_id ??
    envelopeData.envelopeSummary?.metadata?.brain_id;

  if (!brainId) {
    console.warn("[docusign-webhook] No brain_id in envelope metadata — skipping");
    return Response.json({ ok: true, skipped: true });
  }

  let updated = false;
  let documentUploaded = false;
  let declined = false;
  try {
    const headers = engineHeadersForBrain(brainId);
    const searchRes = await fetch(
      `${ENGINE_URL}/api/search?q=${encodeURIComponent(`docusign_envelope_id:${envelopeId}`)}`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );
    let pageSlug: string | undefined;
    let pageFrontmatter: Record<string, unknown> = {};
    if (searchRes.ok) {
      const raw = await searchRes.json();
      const results = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.pages)
          ? (raw as Record<string, unknown[]>).pages
          : [];
      const page = results[0] as
        | { slug: string; frontmatter?: Record<string, unknown> }
        | undefined;
      if (page) {
        pageSlug = page.slug;
        pageFrontmatter = page.frontmatter ?? {};
        const patchRes = await enginePatchPage(
          headers,
          {
            slug: page.slug,
            frontmatter: {
              docusign_status: mapped,
              docusign_updated_at: new Date().toISOString(),
              ...(status === "completed" ? { signed_at: new Date().toISOString() } : {}),
            },
          },
          { timeoutMs: 15_000 }
        );
        updated = patchRes.ok;
      }
    }

    // On completed: download the signed PDF and upload it to the case as a document page
    if (status === "completed" && pageSlug) {
      try {
        const pdfBuffer = await downloadEnvelopeDocuments(envelopeId);
        const caseSlug = String(pageFrontmatter.case_slug ?? "");
        const docSlug = `legal/documents/signed_${envelopeId.slice(0, 12)}_${Date.now()}`;
        const docTitle = `Signiertes Dokument — ${String(pageFrontmatter.case_title ?? pageFrontmatter.title ?? envelopeId)}`;

        const createDocRes = await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            slug: docSlug,
            title: docTitle,
            type: "document",
            frontmatter: {
              document_type: "signed_contract",
              source: "docusign",
              docusign_envelope_id: envelopeId,
              case_slug: caseSlug || undefined,
              signed_at: new Date().toISOString(),
              content_base64: pdfBuffer.toString("base64"),
              mime_type: "application/pdf",
            },
          }),
          signal: AbortSignal.timeout(30_000),
        });
        documentUploaded = createDocRes.ok;

        // Also update the signature_request page to reference the uploaded document
        if (documentUploaded) {
          await enginePatchPage(
            headers,
            {
              slug: pageSlug,
              frontmatter: {
                signed_document_slug: docSlug,
              },
            },
            { timeoutMs: 15_000 }
          );
        }
      } catch (docErr) {
        console.error(
          "[docusign-webhook] Document download/upload failed:",
          docErr instanceof Error ? docErr.message : String(docErr)
        );
      }
    }

    // On declined: create visible notification to all recipients of this brain
    if (status === "declined") {
      declined = true;
      try {
        const recipientsByBrain = await getRecipientsByBrain();
        const recipients = recipientsByBrain.get(brainId) ?? [];
        const caseTitle = String(
          pageFrontmatter.case_title ?? pageFrontmatter.title ?? "Unbekannte Akte"
        );
        for (const recipient of recipients) {
          await createNotificationFailureNotification({
            userId: recipient.id,
            brainId,
            caseSlug: pageSlug,
            caseTitle,
            deadlineTitle: "DocuSign-Signatur",
            deadlineDate: new Date().toISOString(),
            channels: ["docusign"],
            reason: "envelope_declined",
          });
        }
      } catch (notifErr) {
        console.error(
          "[docusign-webhook] Declined notification failed:",
          notifErr instanceof Error ? notifErr.message : String(notifErr)
        );
      }
    }
  } catch (err) {
    console.error(
      "[docusign webhook] brain update failed:",
      err instanceof Error ? err.message : String(err)
    );
  }

  if (eventId) await markWebhookProcessed(eventId, envelopeId, body.event);

  return Response.json({ ok: true, envelopeId, mapped, updated, documentUploaded, declined });
});
