import { NextRequest, NextResponse } from "next/server";
import { storeInboundResendEmail, verifyResendWebhook } from "@/lib/email/mailbox";
import { reconcileResendDeliveryEvent } from "@/lib/email/delivery-status";
import { createWebhookHandler } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
const log = logger("api/email/webhook/resend");

export const dynamic = "force-dynamic";

/**
 * Legacy Resend webhook endpoint — kept for existing deployments; the
 * canonical endpoint is POST /api/webhooks/resend (same signature
 * verification, identical handling).
 */
export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const payload = await req.text();

  try {
    const event = verifyResendWebhook(payload, req.headers);

    // Try inbound email handling first (email.received)
    const message = await storeInboundResendEmail(event);
    if (message) {
      return NextResponse.json({ ok: true, id: message.id, type: "inbound" });
    }

    // Delivery lifecycle events go through the canonical reconciliation
    // (dedupe + Postausgangsbuch write-back + audit) shared with
    // /api/webhooks/resend.
    const dedupeKey = `${event.data?.email_id ?? "unknown"}:${event.type ?? "unknown"}`;
    const delivery = await reconcileResendDeliveryEvent(event, dedupeKey);
    if (delivery.handled) {
      return NextResponse.json({ ok: true, type: event.type ?? "delivery" });
    }

    // Neither inbound nor delivery — ignore
    return NextResponse.json({ ok: true, ignored: true, type: event.type ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message === "resend_webhook_secret_not_configured" ||
      message === "mailbox_database_not_configured"
        ? 503
        : 400;
    log.error("[email] failed to process Resend webhook:", message);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});
