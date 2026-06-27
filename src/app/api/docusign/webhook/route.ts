import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import {
  isWebhookProcessed,
  markWebhookProcessed,
  verifyDocusignConnectSignature,
} from "@/lib/docusign";
import { createWebhookHandler } from "@/lib/api-handler";

export const maxDuration = 30;

export const dynamic = "force-dynamic";

/**
 * POST /api/docusign/webhook
 * Empfängt Docusign Connect Webhook Events (Envelope Status Updates).
 * Verifiziert HMAC-Signatur über X-DocuSign-Signature-1.
 * Dedup: gleiche Event-IDs werden idempotent behandelt.
 *
 * Events:
 *   - envelope-completed → Update Brain-Page (signature_request) zu "signed"
 *   - envelope-declined → Update zu "declined"
 *   - envelope-voided   → Update zu "expired"
 */
export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const rawBody = await req.clone().text();
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
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return Response.json({ ok: true, error: "invalid_json" });
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

  // HMAC verification (mandatory — prevents forged envelope status updates)
  const connectSecret = process.env.DOCUSIGN_CONNECT_SECRET;
  if (!connectSecret) {
    console.error("[docusign-webhook] DOCUSIGN_CONNECT_SECRET not configured — rejecting webhook");
    return Response.json({ error: "webhook_not_configured" }, { status: 501 });
  }
  const signature = req.headers.get("x-docusign-signature-1");
  if (!verifyDocusignConnectSignature(rawBody, signature, connectSecret)) {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
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
  try {
    const headers = engineHeadersForBrain(brainId);
    const searchRes = await fetch(
      `${ENGINE_URL}/api/search?q=${encodeURIComponent(`docusign_envelope_id:${envelopeId}`)}`,
      { headers, signal: AbortSignal.timeout(15_000) }
    );
    if (searchRes.ok) {
      const raw = await searchRes.json();
      const results = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as Record<string, unknown>)?.pages)
          ? (raw as Record<string, unknown[]>).pages
          : [];
      const page = results[0] as { slug: string } | undefined;
      if (page) {
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
  } catch (err) {
    console.error(
      "[docusign webhook] brain update failed:",
      err instanceof Error ? err.message : String(err)
    );
  }

  if (eventId) await markWebhookProcessed(eventId, envelopeId, body.event);

  return Response.json({ ok: true, envelopeId, mapped, updated });
});
