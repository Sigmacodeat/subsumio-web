import type { NextRequest } from "next/server";
import { createWebhookHandler } from "@/lib/api-handler";
import {
  storeInboundResendEmail,
  verifyResendWebhook,
  type ResendWebhookEvent,
} from "@/lib/email/mailbox";
import { reconcileResendDeliveryEvent } from "@/lib/email/delivery-status";

import { logger } from "@/lib/logger";
const log = logger("api/webhooks/resend");

export const dynamic = "force-dynamic";

/**
 * Canonical Resend webhook endpoint (superset of /api/email/webhook/resend).
 *
 * Fail-closed: the raw body is verified against the Svix signature BEFORE
 * any processing. Without RESEND_WEBHOOK_SECRET the endpoint answers 501 —
 * unsigned payloads are never accepted, not even in development.
 */
export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const payload = await req.text();

  let event: ResendWebhookEvent;
  try {
    event = verifyResendWebhook(payload, req.headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "resend_webhook_secret_not_configured") {
      return Response.json(
        {
          ok: false,
          error: "resend_webhook_not_configured",
          message:
            "RESEND_WEBHOOK_SECRET ist nicht konfiguriert — unverifizierte Webhook-Events werden nicht akzeptiert.",
        },
        { status: 501 }
      );
    }
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  try {
    // Inbound mail (email.received) keeps its existing storage path.
    if (event.type === "email.received") {
      const message = await storeInboundResendEmail(event);
      return Response.json({ ok: true, type: "inbound", id: message?.id ?? null });
    }

    // Delivery lifecycle events reconcile into outbound communication state.
    // Dedupe key: email_id + type — stable across Svix retries AND across a
    // second registered endpoint (svix-id differs per endpoint delivery).
    const dedupeKey = `${event.data?.email_id ?? req.headers.get("svix-id") ?? "unknown"}:${
      event.type ?? "unknown"
    }`;
    const result = await reconcileResendDeliveryEvent(event, dedupeKey);
    if (!result.handled) {
      return Response.json({ ok: true, ignored: true, type: event.type ?? null });
    }
    return Response.json({
      ok: true,
      type: event.type,
      status: result.status,
      messageId: result.messageId,
      pagesUpdated: result.pagesUpdated,
      deduped: result.deduped ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("failed to process Resend webhook", { type: event.type, error: message });
    if (message === "mailbox_database_not_configured") {
      return Response.json({ ok: false, error: message }, { status: 503 });
    }
    return Response.json({ ok: false, error: "webhook_processing_failed" }, { status: 500 });
  }
});
