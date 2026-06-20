import { NextRequest, NextResponse } from "next/server";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// Idempotency: track processed event IDs to prevent duplicate processing.
// In-memory (per-instance) with TTL eviction.
const processedEventIds = new Map<string, number>();
const EVENT_ID_TTL_MS = 60 * 60 * 1000; // 1h

function isEventProcessed(id: string): boolean {
  const now = Date.now();
  const seen = processedEventIds.get(id);
  if (seen && now - seen < EVENT_ID_TTL_MS) return true;
  return false;
}

function markEventProcessed(id: string): void {
  processedEventIds.set(id, Date.now());
  if (processedEventIds.size > 2_000) {
    const now = Date.now();
    for (const [key, ts] of processedEventIds) {
      if (now - ts > EVENT_ID_TTL_MS) processedEventIds.delete(key);
    }
  }
}

/**
 * POST /api/webhook/incoming
 *
 * Empfängt Webhooks von Drittanbietern (Zapier, beA, etc.)
 * Authentifizierung via X-API-Key Header.
 *
 * Body: { event: string, data: Record<string, unknown> }
 */
function verifyWebhookKey(provided: string): boolean {
  const expected = env("SIGMABRAIN_WEBHOOK_API_KEY");
  if (!expected) return false;
  // Timing-safe comparison
  if (provided.length !== expected.length) return false;
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Rate-limit webhooks by IP
  const ip = clientIp(req.headers);
  const rate = await hit(`webhook:ip:${ip}`, 60, 60_000); // 60/min
  if (!rate.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || !verifyWebhookKey(apiKey)) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event : "";
  if (!event) {
    return NextResponse.json({ error: "event_required" }, { status: 400 });
  }

  // Process webhook event
  const acceptedEvents = ["case.created", "deadline.due", "invoice.paid", "email.received"];
  if (!acceptedEvents.includes(event)) {
    return NextResponse.json({ error: "unsupported_event" }, { status: 400 });
  }

  // Idempotency: check if this event was already processed
  const eventId = typeof body.eventId === "string" ? body.eventId
    : typeof body.id === "string" ? body.id
    : typeof body.event_id === "string" ? body.event_id
    : "";
  if (eventId && isEventProcessed(eventId)) {
    return NextResponse.json({ success: true, dedup: true, received: event });
  }

  // Log and return success (processing is async)
  console.log(`[webhook] received ${event} from ${ip}`);
  if (eventId) markEventProcessed(eventId);
  return NextResponse.json({
    success: true,
    received: event,
    timestamp: new Date().toISOString(),
    message: "Webhook received and queued for processing",
  });
}
