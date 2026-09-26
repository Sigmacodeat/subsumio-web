/**
 * Webhook Outgoing Delivery — Dispatches registered webhooks when events fire.
 *
 * HMAC-SHA256 signing (per-webhook secret, stored encrypted). Every delivery
 * goes through the shared egress guard (https only, public addresses only,
 * each redirect hop re-checked). A transient failure is queued and retried
 * with backoff by the `webhook-retry` cron (webhook-delivery-queue.ts).
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
import { EgressError, safeFetch } from "@/lib/security/egress";
import {
  claimDueWebhookDeliveries,
  enqueueWebhookRetry,
  finishWebhookDelivery,
  recordWebhookRetryFailure,
} from "@/lib/webhook-delivery-queue";

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
    return await loadRegisteredWebhooks(brainId);
  } catch (err) {
    log.error("Failed to fetch registered webhooks", { brainId, error: String(err) });
    return [];
  }
}

/** Like getRegisteredWebhooks, but a failed read throws instead of looking like "none". */
async function loadRegisteredWebhooks(brainId: string): Promise<RegisteredWebhook[]> {
  const pages = await listEnginePages(engineHeadersForBrain(brainId), "webhook_config", 1000, {
    strict: true,
    timeoutMs: 10_000,
  });

  const hooks = await Promise.all(
    pages.map(async (p) => {
      const fm = p.frontmatter ?? {};
      // Only entries written by the registration route (encrypted secret_enc)
      // are delivered; a plaintext `secret` did not come from that route and
      // must be registered again.
      const secret =
        typeof fm.secret_enc === "string"
          ? ((await decrypt(fm.secret_enc).catch(() => null)) ?? "")
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
      const result = await deliverOnce(webhook, eventType, body);
      if (result.ok) {
        dispatched++;
        log.info("Webhook delivered", { webhookId: webhook.id, eventType });
        return;
      }
      failed++;
      log.warn("Webhook delivery failed", {
        webhookId: webhook.id,
        eventType,
        error: result.error,
        retryable: result.retryable,
      });
      if (!result.retryable) return;
      const queued = await enqueueWebhookRetry({
        brainId,
        webhookId: webhook.id,
        event: eventType,
        body,
        error: result.error,
      }).catch((err) => {
        log.error("Webhook retry could not be queued", {
          webhookId: webhook.id,
          error: String(err),
        });
        return false;
      });
      if (!queued) log.warn("Webhook event not queued for retry", { webhookId: webhook.id });
    })
  );

  return { dispatched, failed };
}

export type DeliveryResult = { ok: true } | { ok: false; error: string; retryable: boolean };

/** Status codes worth another attempt; any other 4xx is the receiver refusing for good. */
function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * One signed POST to a webhook through the egress guard. A target that is
 * not https or resolves to an internal address is never contacted (and not
 * retried).
 */
export async function deliverOnce(
  webhook: Pick<RegisteredWebhook, "url" | "secret">,
  eventType: string,
  body: string
): Promise<DeliveryResult> {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(body, webhook.secret, timestamp);
    const res = await safeFetch(
      webhook.url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Subsumio-Event": eventType,
          "X-Subsumio-Signature": signature,
          "X-Subsumio-Timestamp": String(timestamp),
        },
        body,
        signal: AbortSignal.timeout(15_000),
      },
      { label: "Webhook-Adresse", tooManyRedirectsMessage: "Zu viele Weiterleitungen" }
    );
    if (res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}`, retryable: retryableStatus(res.status) };
  } catch (err) {
    if (err instanceof EgressError) return { ok: false, error: err.message, retryable: false };
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      retryable: true,
    };
  }
}

/**
 * Retries queued deliveries that are due (called by the webhook-retry cron).
 * Each retry uses the webhook's current registration: a webhook deleted or
 * deactivated in the meantime gets nothing.
 */
export async function retryDueWebhookDeliveries(
  limit = 50
): Promise<{ retried: number; delivered: number; failed: number; dropped: number }> {
  const due = await claimDueWebhookDeliveries(limit);
  const stats = { retried: due.length, delivered: 0, failed: 0, dropped: 0 };
  const hooksByBrain = new Map<string, RegisteredWebhook[]>();
  for (const item of due) {
    let hooks = hooksByBrain.get(item.brainId);
    if (!hooks) {
      try {
        hooks = await loadRegisteredWebhooks(item.brainId);
      } catch (err) {
        // Registration unreadable right now: try again later, do not drop.
        await recordWebhookRetryFailure(item.id, item.attempts, String(err), true);
        stats.failed++;
        continue;
      }
      hooksByBrain.set(item.brainId, hooks);
    }
    const webhook = hooks.find((w) => w.id === item.webhookId && w.events.includes(item.event));
    if (!webhook) {
      await finishWebhookDelivery(item.id, "dropped", "Webhook nicht mehr aktiv");
      stats.dropped++;
      continue;
    }
    const result = await deliverOnce(webhook, item.event, item.body);
    if (result.ok) {
      await finishWebhookDelivery(item.id, "delivered");
      stats.delivered++;
    } else {
      await recordWebhookRetryFailure(item.id, item.attempts + 1, result.error, result.retryable);
      stats.failed++;
    }
  }
  return stats;
}

/**
 * Fire-and-forget dispatch for request paths: delivery (and its retry queue)
 * never blocks or fails the business action that caused the event.
 */
export function emitWebhookEvent(
  brainId: string | undefined | null,
  eventType: WebhookEventType,
  payload: Record<string, unknown>
): void {
  if (!brainId) return;
  void dispatchWebhookEvent(brainId, eventType, payload).catch((err) =>
    log.warn("Webhook dispatch failed", { eventType, error: String(err) })
  );
}

/** The firm (brain) an engine request is scoped to — its `x-subsumio-source`. */
export function brainIdFromEngineHeaders(headers: Record<string, string>): string | null {
  const id = headers["x-subsumio-source"];
  return typeof id === "string" && id ? id : null;
}

/** `case.created` for a newly created matter (not for bulk imports from other software). */
export function emitCaseCreated(
  brainId: string | undefined | null,
  page: { slug: string; title?: string; frontmatter?: Record<string, unknown> }
): void {
  const fm = page.frontmatter ?? {};
  if (fm.import_project_id) return;
  emitWebhookEvent(brainId, "case.created", {
    slug: page.slug,
    title: page.title ?? (typeof fm.title === "string" ? fm.title : undefined),
    case_number: typeof fm.case_number === "string" ? fm.case_number : undefined,
    legal_area: typeof fm.legal_area === "string" ? fm.legal_area : undefined,
  });
}

/** `invoice.paid` when a client invoice (Honorarnote) becomes paid. */
export function emitInvoicePaid(
  brainId: string | undefined | null,
  invoice: { slug: string; frontmatter?: Record<string, unknown> },
  paid: { paid_at?: string; paid_amount?: unknown; payment_method?: string }
): void {
  const fm = invoice.frontmatter ?? {};
  emitWebhookEvent(brainId, "invoice.paid", {
    slug: invoice.slug,
    invoice_number: typeof fm.invoice_number === "string" ? fm.invoice_number : undefined,
    total: fm.total ?? fm.amount ?? undefined,
    currency: typeof fm.currency === "string" ? fm.currency : "EUR",
    paid_at: paid.paid_at ?? new Date().toISOString(),
    paid_amount: paid.paid_amount,
    payment_method: paid.payment_method,
  });
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
