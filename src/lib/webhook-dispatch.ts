/**
 * Webhook Outgoing Delivery — Dispatches registered webhooks when events fire.
 *
 * Direct fetch with HMAC-SHA256 signing (per-webhook secret, stored encrypted).
 *
 * Events are fired from across the app (case creation, deadline alerts,
 * invoice payments, document receipt, intake submissions) via
 * dispatchWebhookEvent(brainId, …) — always for one firm's brain.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { engineHeadersForBrain } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { logger } from "@/lib/logger";
import { decrypt } from "@/lib/encryption";

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

/**
 * All active webhooks one firm registered — pages of type "webhook_config" in
 * the firm's own brain, the same brain `POST /api/webhooks/outgoing` writes
 * to. Signing secrets are stored encrypted and decrypted here; an entry whose
 * secret cannot be decrypted is skipped instead of being signed with an empty
 * key.
 */
export async function getRegisteredWebhooks(brainId: string): Promise<RegisteredWebhook[]> {
  if (!brainId) return [];
  try {
    const pages = await listEnginePages(engineHeadersForBrain(brainId), "webhook_config", 1000, {
      strict: true,
      timeoutMs: 10_000,
    });

    const hooks = await Promise.all(
      pages.map(async (p) => {
        const fm = p.frontmatter ?? {};
        // Secrets are stored encrypted (secret_enc); older entries hold `secret`.
        const secret =
          typeof fm.secret_enc === "string"
            ? ((await decrypt(fm.secret_enc).catch(() => null)) ?? "")
            : typeof fm.secret === "string"
              ? fm.secret
              : "";
        return {
          id: String(fm.id ?? p.slug),
          url: String(fm.url ?? ""),
          events: Array.isArray(fm.events) ? fm.events.map(String) : [],
          secret,
          status: String(fm.status ?? "active"),
          created_at: String(fm.created_at ?? new Date().toISOString()),
        };
      })
    );
    return hooks.filter((w) => {
      if (w.status !== "active" || !w.url) return false;
      if (!w.secret) {
        log.warn("Webhook skipped: signing secret unavailable", { brainId, webhookId: w.id });
        return false;
      }
      return true;
    });
  } catch (err) {
    log.error("Failed to fetch registered webhooks", { brainId, error: String(err) });
    return [];
  }
}

/**
 * Fetch one firm's webhooks that are subscribed to a specific event type.
 */
async function getWebhooksForEvent(
  brainId: string,
  eventType: WebhookEventType
): Promise<RegisteredWebhook[]> {
  const all = await getRegisteredWebhooks(brainId);
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
 * Dispatch a webhook event to the subscribers one firm registered.
 * `brainId` is the firm's brain; the event only reaches that firm's webhooks.
 *
 * @example
 * await dispatchWebhookEvent(ctx.brainId, "case.created", { case_slug: "...", title: "..." });
 */
export async function dispatchWebhookEvent(
  brainId: string,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): Promise<{ dispatched: number; failed: number }> {
  const webhooks = await getWebhooksForEvent(brainId, eventType);
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
