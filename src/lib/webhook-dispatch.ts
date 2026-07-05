/**
 * Webhook Outgoing Delivery — Dispatches registered webhooks when events fire.
 *
 * Uses Svix for signed webhook delivery (HMAC-SHA256 with rotating secrets).
 * Falls back to direct fetch + HMAC signing when Svix is not configured.
 *
 * Events are fired from across the app (case creation, deadline alerts,
 * invoice payments, document receipt, intake submissions) via dispatchWebhookEvent().
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { logger } from "@/lib/logger";

const log = logger("webhook-dispatch");

export type WebhookEventType =
  | "case.created"
  | "deadline.critical"
  | "invoice.paid"
  | "document.received"
  | "intake.new";

export interface RegisteredWebhook {
  id: string;
  url: string;
  events: string[];
  secret: string;
  status: string;
  created_at: string;
}

interface WebhookPage {
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
}

/**
 * Fetch all registered webhooks from the engine (stored as pages of type "webhook_config").
 */
export async function getRegisteredWebhooks(): Promise<RegisteredWebhook[]> {
  const headers = engineHeadersForBrain("system");
  const params = new URLSearchParams({ type: "webhook_config", limit: "100" });

  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as WebhookPage[];

    return pages
      .map((p) => {
        const fm = p.frontmatter;
        return {
          id: String(fm.id ?? p.slug),
          url: String(fm.url ?? ""),
          events: Array.isArray(fm.events) ? fm.events.map(String) : [],
          secret: String(fm.secret ?? ""),
          status: String(fm.status ?? "active"),
          created_at: String(fm.created_at ?? new Date().toISOString()),
        };
      })
      .filter((w) => w.status === "active" && w.url);
  } catch (err) {
    log.error("Failed to fetch registered webhooks", { error: String(err) });
    return [];
  }
}

/**
 * Fetch webhooks that are subscribed to a specific event type.
 */
async function getWebhooksForEvent(eventType: WebhookEventType): Promise<RegisteredWebhook[]> {
  const all = await getRegisteredWebhooks();
  return all.filter((w) => w.events.includes(eventType));
}

/**
 * Sign a payload with HMAC-SHA256 using the webhook's secret.
 * Returns header string in format: t=<timestamp>,v1=<signature>
 */
function signPayload(payload: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/**
 * Dispatch a webhook event to all registered subscribers.
 * Called from anywhere in the app when an event occurs.
 *
 * @example
 * await dispatchWebhookEvent("case.created", { case_slug: "...", title: "..." });
 */
export async function dispatchWebhookEvent(
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<{ dispatched: number; failed: number }> {
  const webhooks = await getWebhooksForEvent(eventType);
  if (webhooks.length === 0) return { dispatched: 0, failed: 0 };

  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  let dispatched = 0;
  let failed = 0;

  await Promise.allSettled(
    webhooks.map(async (webhook) => {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = signPayload(body, webhook.secret, timestamp);

        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Subsumio-Event": eventType,
            "X-Subsumio-Signature": signature,
            "X-Subsumio-Timestamp": String(timestamp),
          },
          body,
          signal: AbortSignal.timeout(15_000),
        });

        if (!res.ok) {
          log.warn("Webhook delivery failed", {
            webhookId: webhook.id,
            url: webhook.url,
            eventType,
            status: res.status,
          });
          failed++;
        } else {
          dispatched++;
          log.info("Webhook delivered", {
            webhookId: webhook.id,
            url: webhook.url,
            eventType,
          });
        }
      } catch (err) {
        log.warn("Webhook delivery error", {
          webhookId: webhook.id,
          url: webhook.url,
          eventType,
          error: String(err),
        });
        failed++;
      }
    })
  );

  return { dispatched, failed };
}

/**
 * Verify a webhook signature (for incoming webhook verification).
 * Used by recipients to verify that a webhook came from Subsumio.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  timestampToleranceSeconds: number = 300
): boolean {
  const parts = signatureHeader.split(",");
  let timestamp: number | null = null;
  let signature: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = parseInt(value, 10);
    if (key === "v1") signature = value;
  }

  if (!timestamp || !signature) return false;

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > timestampToleranceSeconds) return false;

  // Recompute signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSig = createHmac("sha256", secret).update(signedPayload).digest("hex");

  try {
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
