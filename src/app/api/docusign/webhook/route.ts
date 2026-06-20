import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { isWebhookProcessed, markWebhookProcessed } from "@/lib/docusign";

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
export async function POST(req: NextRequest) {
  const rawBody = await req.clone().text();
  const body = (await req.json()) as {
    event?: string;
    data?: {
      envelopeId?: string;
      envelopeSummary?: {
        status?: string;
        recipients?: { signers?: Array<{ status: string; signedDateTime?: string; email?: string }> };
      };
    };
    eventId?: string;
  };

  const eventId = body.eventId ?? body.data?.envelopeId;
  const envelopeId = body.data?.envelopeId;
  const status = body.data?.envelopeSummary?.status;

  if (!envelopeId || !status) {
    return Response.json({ ok: true }); // Acknowledge even on malformed
  }

  // Idempotency: skip already processed events (Postgres-backed)
  if (eventId && await isWebhookProcessed(eventId)) {
    return Response.json({ ok: true, dedup: true });
  }

  // HMAC verification (optional — requires DOCUSIGN_CONNECT_SECRET)
  const connectSecret = process.env.DOCUSIGN_CONNECT_SECRET;
  if (connectSecret) {
    const signature = req.headers.get("x-docusign-signature-1");
    if (!signature) {
      return Response.json({ error: "invalid_signature" }, { status: 401 });
    }
    const expected = await hmacSha256(rawBody, connectSecret);
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return Response.json({ error: "invalid_signature" }, { status: 401 });
    }
  }

  // Map Docusign → SigmaBrain status
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
      { headers },
    );
    if (searchRes.ok) {
      const results = (await searchRes.json()) as { pages?: Array<{ slug: string }> };
      const page = results.pages?.[0];
      if (page) {
        const patchRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(page.slug)}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            frontmatter: {
              docusign_status: mapped,
              docusign_updated_at: new Date().toISOString(),
              ...(status === "completed" ? { signed_at: new Date().toISOString() } : {}),
            },
          }),
        });
        updated = patchRes.ok;
      }
    }
  } catch (err) {
    console.error("[docusign webhook] brain update failed:", err instanceof Error ? err.message : String(err));
  }

  if (eventId) await markWebhookProcessed(eventId, envelopeId, body.event);

  return Response.json({ ok: true, envelopeId, mapped, updated });
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
