// Stripe webhook: upgrades/downgrades plans on subscription events.
// Verifies the Stripe-Signature header (v1 scheme, HMAC-SHA256) without the SDK.
// Idempotency: tracks processed event IDs to prevent duplicate plan updates.

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore, getSharedPgPool, type Plan } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";

const TOLERANCE_SECONDS = 300;

// In-memory fallback for dev mode (no Postgres)
const processedEventIds = new Set<string>();
const MAX_INMEMORY_EVENTS = 1000;

const ensureStripeEventsSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_stripe_events (
    event_id text PRIMARY KEY,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
  );
`);

async function isDuplicateEvent(eventId: string, eventType: string): Promise<boolean> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureStripeEventsSchema();
      const result = await pool.query<{ inserted: boolean }>(
        `INSERT INTO subsumio_stripe_events (event_id, event_type)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id
         RETURNING (xmax = 0) AS inserted`,
        [eventId, eventType],
      );
      return !result.rows[0]?.inserted;
    } catch (err) {
      console.error(`[stripe-webhook] idempotency check failed: ${err instanceof Error ? err.message : String(err)}`);
      // Non-fatal — proceed without idempotency (dev mode)
    }
  }
  // In-memory fallback
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  if (processedEventIds.size > MAX_INMEMORY_EVENTS) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
  return false;
}

function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=", 2) as [string, string]),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 501 });
  }

  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Idempotency check: skip if this event was already processed
  const eventId = event.id;
  if (eventId) {
    const isDuplicate = await isDuplicateEvent(eventId, event.type ?? "unknown");
    if (isDuplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  }

  const store = getStore();
  const obj = (event.data?.object ?? {}) as {
    client_reference_id?: string;
    customer?: string;
    metadata?: { plan?: string; user_id?: string };
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const userId = obj.client_reference_id ?? obj.metadata?.user_id;
      const plan = obj.metadata?.plan;
      if (userId && (plan === "pro" || plan === "team")) {
        await store.update(userId, {
          plan: plan as Plan,
          stripeCustomerId: typeof obj.customer === "string" ? obj.customer : null,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      // Downgrade by Stripe customer id.
      const customerId = typeof obj.customer === "string" ? obj.customer : null;
      if (customerId) {
        const users = await store.list();
        const user = users.find((u) => u.stripeCustomerId === customerId);
        if (user) await store.update(user.id, { plan: "free" });
      }
      break;
    }
    default:
      break; // acknowledge everything else
  }

  return NextResponse.json({ received: true });
}
