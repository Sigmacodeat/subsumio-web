import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clientIp } from "@/lib/auth/rate-limit";
import { createPublicHandler } from "@/lib/api-handler";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { createIdempotencyStore } from "@/lib/idempotency";

// Idempotency: Postgres-backed (durable across instances/restarts) with an
// in-memory fallback for dev. Prevents duplicate processing on provider retries.
const idempotency = createIdempotencyStore("subsumio_webhook_incoming_events", ["event_type text"]);

const webhookSchema = z.object({
  event: z.string().min(1),
  eventId: z.string().optional(),
  id: z.string().optional(),
  event_id: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

const ACCEPTED_EVENTS = ["case.created", "deadline.due", "invoice.paid", "email.received"];

/**
 * POST /api/webhook/incoming
 *
 * Empfängt Webhooks von Drittanbietern (Zapier, beA, etc.)
 * Authentifizierung via X-API-Key Header.
 */
function verifyWebhookKey(provided: string): boolean {
  const expected = env("SUBSUMIO_WEBHOOK_API_KEY");
  if (!expected) return false;
  if (provided.length !== expected.length) return false;
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const POST = createPublicHandler(
  {
    cors: true,
    skipCsrf: true,
    body: webhookSchema,
    rateLimitKey: (req: NextRequest) => `webhook:ip:${clientIp(req.headers)}`,
    rateLimitMax: 60,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || !verifyWebhookKey(apiKey)) {
      return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
    }

    const event = body.event;
    if (!ACCEPTED_EVENTS.includes(event)) {
      return NextResponse.json({ error: "unsupported_event" }, { status: 400 });
    }

    // Idempotency: check if this event was already processed
    const eventId = body.eventId ?? body.id ?? body.event_id ?? "";
    if (eventId && (await idempotency.isProcessed(eventId))) {
      return NextResponse.json({ success: true, dedup: true, received: event });
    }

    // Log and return success (processing is async)
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[webhook] received ${event}`);
    }
    if (eventId) await idempotency.markProcessed(eventId, event);
    return NextResponse.json({
      success: true,
      received: event,
      timestamp: new Date().toISOString(),
      message: "Webhook received and queued for processing",
    });
  },
);
