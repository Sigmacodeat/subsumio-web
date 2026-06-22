import { NextRequest, NextResponse } from "next/server";
import {
  storeInboundResendEmail,
  verifyResendWebhook,
  handleResendTrackingEvent,
} from "@/lib/email/mailbox";
import { createWebhookHandler } from "@/lib/api-handler";

export const dynamic = "force-dynamic";

export const POST = createWebhookHandler({}, async (_body, req: NextRequest) => {
  const payload = await req.text();

  try {
    const event = verifyResendWebhook(payload, req.headers);

    // Try inbound email handling first (email.received)
    const message = await storeInboundResendEmail(event);
    if (message) {
      return NextResponse.json({ ok: true, id: message.id, type: "inbound" });
    }

    // Try tracking event handling (email.delivered, email.bounced, email.complained)
    const tracked = await handleResendTrackingEvent(event);
    if (tracked) {
      return NextResponse.json({ ok: true, type: event.type ?? "tracking" });
    }

    // Neither inbound nor tracking — ignore
    return NextResponse.json({ ok: true, ignored: true, type: event.type ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message === "resend_webhook_secret_not_configured" ||
      message === "mailbox_database_not_configured"
        ? 503
        : 400;
    console.error("[email] failed to process Resend webhook:", message);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
});
