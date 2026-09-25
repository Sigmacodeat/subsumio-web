/**
 * Delivery-status reconciliation for outbound mail (Resend webhooks).
 *
 * Maps provider lifecycle events back into stored outbound communication
 * state:
 *   1. Mailbox row (subsumio_mail_messages) — the primary state for mail
 *      sent through the mailbox; correlated via provider_id (Resend
 *      email_id) or the RFC message_id.
 *   2. Tracking events (subsumio_email_tracking_events) — the case-email
 *      send path records the provider id in `raw.resend_id`; a fresh event
 *      row is appended and the aggregate tracking_status is updated.
 *   3. Postausgangsbuch pages (type outbound_entry) — entries that carry a
 *      tracking_id or provider_id get delivery_status + timestamp via a
 *      frontmatter merge update (enginePatchPage).
 *
 * Ordering: a late "delivered" must never resurrect a known terminal
 * failure (bounced/complained/failed) — complaint events can legitimately
 * arrive after a delivery.
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { logAudit, type AuditAction } from "@/lib/audit";
import { engineHeadersForBrain, enginePatchPage } from "@/lib/engine";
import { listEnginePages, type ListedPage } from "@/lib/engine-pages";
import { filterNewIds, forgetIds } from "@/lib/caselaw-dedup";
import { logTrackingEvent, type TrackingEventType } from "@/lib/email/tracking";
import type { ResendWebhookEvent } from "@/lib/email/mailbox";
import type { DeliveryStatus } from "@/lib/outbound-register";
import { logger } from "@/lib/logger";

const log = logger("email/delivery-status");

type ResendDeliveryStatus = Extract<DeliveryStatus, TrackingEventType>;

export const RESEND_DELIVERY_STATUS: Record<string, ResendDeliveryStatus> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

const TERMINAL_FAILURES = new Set<DeliveryStatus>(["bounced", "complained", "failed"]);

export interface DeliveryReconcileResult {
  /** false when the event type is not a delivery lifecycle event. */
  handled: boolean;
  status?: ResendDeliveryStatus;
  /** True when the event was already processed (retry/second endpoint). */
  deduped?: boolean;
  messageId: string | null;
  brainId: string | null;
  trackingId: string | null;
  /** outbound_entry pages whose delivery_status was updated. */
  pagesUpdated: number;
  /**
   * True when correlation or the Postausgangsbuch write-back failed. The
   * dedupe claim has been released so the provider's retry (Svix) processes
   * the event again — the caller must answer non-2xx to trigger that retry.
   */
  retryable?: boolean;
}

const DEDUPE_SCOPE = "system";
const DEDUPE_NAMESPACE = "resend-delivery";

/**
 * Reconcile one verified Resend webhook event into stored outbound state.
 *
 * `dedupeKey` must be stable across delivery retries AND across multiple
 * registered endpoints for the same event — use
 * `${email_id}:${event.type}` (Svix message ids differ per endpoint).
 */
export async function reconcileResendDeliveryEvent(
  event: ResendWebhookEvent,
  dedupeKey: string
): Promise<DeliveryReconcileResult> {
  const status = RESEND_DELIVERY_STATUS[event.type ?? ""];
  if (!status) {
    return {
      handled: false,
      messageId: null,
      brainId: null,
      trackingId: null,
      pagesUpdated: 0,
    };
  }

  const fresh = await filterNewIds(DEDUPE_SCOPE, DEDUPE_NAMESPACE, [dedupeKey]);
  if (fresh.size === 0) {
    return {
      handled: true,
      status,
      deduped: true,
      messageId: null,
      brainId: null,
      trackingId: null,
      pagesUpdated: 0,
    };
  }

  const emailId = event.data?.email_id ?? null;
  const rfcMessageId = event.data?.message_id ?? null;
  const eventAt = event.data?.created_at ?? event.created_at ?? new Date().toISOString();

  const pool = getSharedPgPool();
  let messageId: string | null = null;
  let brainId: string | null = null;
  let trackingId: string | null = null;
  // A failed lookup must not consume the event: the claim is released below.
  let lookupFailed = false;

  if (pool) {
    try {
      // 1) Mailbox path: the outbound row is keyed by the provider id.
      if (emailId) {
        const { rows } = await pool.query(
          `SELECT id, brain_id, tracking_id
             FROM subsumio_mail_messages
            WHERE direction = 'outbound' AND provider_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
          [emailId]
        );
        if (rows[0]) {
          messageId = String(rows[0].id);
          brainId = rows[0].brain_id ? String(rows[0].brain_id) : null;
          trackingId = rows[0].tracking_id ? String(rows[0].tracking_id) : null;
        }
      }

      // 2) Case-email path: the send route stores the provider id in the
      //    tracking event's raw payload (`resend_id`). The brain lives in
      //    `raw.brain_id`; rows written before 2026-09-25 carry `brainId`
      //    (the key mismatch left every Postausgangsbuch entry on "sent").
      if (!trackingId && emailId) {
        const { rows } = await pool.query(
          `SELECT tracking_id, message_id,
                  COALESCE(raw->>'brain_id', raw->>'brainId') AS brain_id
             FROM subsumio_email_tracking_events
            WHERE raw->>'resend_id' = $1
            ORDER BY created_at DESC
            LIMIT 1`,
          [emailId]
        );
        if (rows[0]) {
          trackingId = rows[0].tracking_id ? String(rows[0].tracking_id) : null;
          messageId = messageId ?? (rows[0].message_id ? String(rows[0].message_id) : null);
          brainId = brainId ?? (rows[0].brain_id ? String(rows[0].brain_id) : null);
        }
      }

      // 3) RFC Message-Id fallback.
      if (!trackingId && !messageId && rfcMessageId) {
        const { rows } = await pool.query(
          `SELECT id, brain_id, tracking_id
             FROM subsumio_mail_messages
            WHERE direction = 'outbound' AND message_id = $1
            ORDER BY created_at DESC
            LIMIT 1`,
          [rfcMessageId]
        );
        if (rows[0]) {
          messageId = String(rows[0].id);
          brainId = rows[0].brain_id ? String(rows[0].brain_id) : null;
          trackingId = rows[0].tracking_id ? String(rows[0].tracking_id) : null;
        }
      }
    } catch (err) {
      lookupFailed = true;
      log.error("correlation lookup failed", {
        emailId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Status write-back ───────────────────────────────────────────────
  if (trackingId) {
    await logTrackingEvent({
      messageId: messageId ?? undefined,
      trackingId,
      eventType: status,
      raw: {
        source: "resend_webhook",
        eventType: event.type,
        emailId,
        subject: event.data?.subject ?? null,
        to: event.data?.to ?? [],
        eventAt,
      },
    });
  } else if (pool && messageId) {
    await pool
      .query(
        `UPDATE subsumio_mail_messages
            SET tracking_status = $2, updated_at = now()
          WHERE id = $1`,
        [messageId, status]
      )
      .catch((err) =>
        log.error("message status update failed", {
          messageId,
          error: err instanceof Error ? err.message : String(err),
        })
      );
  } else {
    log.info("no stored outbound message matched the webhook event", {
      type: event.type,
      emailId,
    });
  }

  // ── Postausgangsbuch pages ──────────────────────────────────────────
  const writeBack = brainId
    ? await writeBackOutboundEntries(brainId, {
        trackingId,
        providerId: emailId,
        status,
        eventType: event.type ?? "unknown",
        eventAt,
      })
    : { updated: 0, failed: false };
  const pagesUpdated = writeBack.updated;

  // Half-done is not done: release the dedupe claim so the provider's retry
  // is processed instead of dropped as a duplicate. Engine outages used to
  // lose the Postausgangsbuch status for good.
  const retryable = lookupFailed || writeBack.failed;
  if (retryable) {
    await forgetIds(DEDUPE_SCOPE, DEDUPE_NAMESPACE, [dedupeKey]).catch((err) =>
      log.error("dedupe release failed", {
        dedupeKey,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }

  // `comm.delivery_status` is intentionally NOT in the AuditAction union —
  // src/lib/audit-labels.ts is off-limits for this change; unknown actions
  // render via the audit-label humaniser fallback.
  await logAudit("comm.delivery_status" as AuditAction, "outbound_email", {
    entityId: messageId ?? trackingId ?? emailId ?? dedupeKey,
    brainId: brainId ?? undefined,
    details: {
      eventType: event.type ?? null,
      emailId,
      status,
      trackingId,
      pagesUpdated,
      retryable,
      subject: event.data?.subject ?? null,
    },
  });

  return {
    handled: true,
    status,
    messageId,
    brainId,
    trackingId,
    pagesUpdated,
    ...(retryable ? { retryable: true } : {}),
  };
}

async function writeBackOutboundEntries(
  brainId: string,
  match: {
    trackingId: string | null;
    providerId: string | null;
    status: ResendDeliveryStatus;
    eventType: string;
    eventAt: string;
  }
): Promise<{ updated: number; failed: boolean }> {
  const headers = engineHeadersForBrain(brainId);
  let pages: ListedPage[];
  try {
    // strict: a partial/failed listing must surface as a failure, not as
    // "no matching entry" — otherwise the event is consumed with nothing done.
    pages = await listEnginePages(headers, "outbound_entry", 1000, { strict: true });
  } catch (err) {
    log.error("outbound_entry listing failed", {
      brainId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { updated: 0, failed: true };
  }

  const targets = pages.filter((page) => {
    const fm = page.frontmatter ?? {};
    return (
      (match.trackingId !== null && fm.tracking_id === match.trackingId) ||
      (match.providerId !== null &&
        (fm.provider_id === match.providerId || fm.resend_id === match.providerId))
    );
  });

  let updated = 0;
  let failed = false;
  for (const page of targets) {
    const fm = page.frontmatter ?? {};
    const existing = String(fm.delivery_status ?? "") as DeliveryStatus;
    if (match.status === "delivered" && TERMINAL_FAILURES.has(existing)) continue;
    if (existing === match.status && fm.delivery_event === match.eventType) continue;
    try {
      const res = await enginePatchPage(headers, {
        slug: page.slug,
        frontmatter: {
          delivery_status: match.status,
          delivery_status_at: match.eventAt,
          delivery_event: match.eventType,
          ...(match.providerId ? { provider_id: match.providerId } : {}),
        },
      });
      if (res.ok) {
        updated++;
      } else {
        failed = true;
        log.error("outbound_entry update failed", { slug: page.slug, httpStatus: res.status });
      }
    } catch (err) {
      failed = true;
      log.error("outbound_entry update failed", {
        slug: page.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { updated, failed };
}
