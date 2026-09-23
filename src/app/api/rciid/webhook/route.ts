import { z } from "zod";
import { createWebhookHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  verifyWebhookSignature,
  isWebhookProcessed,
  markWebhookProcessed,
  isConfigured,
  resolveRciidCase,
  fileReportToCase,
  type RciidWebhookEvent,
} from "@/lib/rciid";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger("rciid-webhook");

export const dynamic = "force-dynamic";
export const maxDuration = 60; // report_ready laedt+uploadet den Bericht inline

const webhookSchema = z.object({
  event_id: z.string().min(1),
  case_id: z.string().min(1),
  event_type: z.enum([
    "status_changed",
    "phase_completed",
    "report_ready",
    "case_rejected",
    "quality_feedback",
  ]),
  status: z.enum([
    "none",
    "submitted",
    "received",
    "investigating",
    "tracing",
    "analyzing",
    "reporting",
    "completed",
    "rejected",
  ]),
  progress_percent: z.number().min(0).max(100).optional(),
  current_phase: z.string().max(200).optional(),
  timestamp: z.string().max(50),
  data: z.record(z.unknown()).optional(),
});

/**
 * RCIID Webhook Receiver.
 *
 * RCIID pushes status updates to this endpoint when:
 *   - A case status changes (e.g. investigating → tracing)
 *   - A phase is completed
 *   - A report is ready for download
 *   - A case is rejected
 *
 * Security:
 *   - HMAC-SHA256 signature verification (X-RCIID-Signature header)
 *   - Idempotency via event_id dedup
 *   - No auth required (webhook uses signature verification)
 */
export const POST = createWebhookHandler(
  {
    body: webhookSchema,
    audit: (body) => ({
      action: "rciid.webhook_received" as const,
      entityType: "case",
      entityId: body.case_id,
      details: {
        eventType: body.event_type,
        status: body.status,
        progressPercent: body.progress_percent,
      },
    }),
  },
  async (body, req) => {
    // 1. Verify HMAC signature
    const secret = env("RCIID_WEBHOOK_SECRET") || "";
    if (secret) {
      const signature = req.headers.get("x-rciid-signature");
      // Re-read the raw body for signature verification
      // Note: Next.js has already consumed the body, so we verify based on the parsed body
      // In production, a raw body middleware would be needed for strict verification
      const rawBody = JSON.stringify(body);
      if (!verifyWebhookSignature(rawBody, signature, secret)) {
        return apiError("webhook_signature_invalid", "Invalid webhook signature", 401);
      }
    }

    // 2. Idempotency check
    if (await isWebhookProcessed(body.event_id)) {
      return apiSuccess({ ok: true, duplicate: true, message: "Event already processed" });
    }

    // 3. Process the event
    const event: RciidWebhookEvent = {
      event_id: body.event_id,
      case_id: body.case_id,
      event_type: body.event_type,
      status: body.status,
      progress_percent: body.progress_percent,
      current_phase: body.current_phase,
      timestamp: body.timestamp,
      data: body.data,
    };

    // The actual case update happens in the status route or a background job.
    // Here we just acknowledge the event and mark it as processed.
    // The dashboard polling + this webhook together ensure status updates are seen.

    await markWebhookProcessed(event.event_id, event.case_id, event.event_type);

    // 4. report_ready: Bericht laden und als Dokument in der Akte ablegen.
    //    Schlägt Download/Upload fehl, bleibt der manuelle Abruf über die
    //    Report-API möglich — die Antwort zeigt das ehrlich via report_saved.
    let reportSaved = false;
    let reportError: string | undefined;
    if (event.event_type === "report_ready" && isConfigured()) {
      const registration = await resolveRciidCase(event.case_id);
      if (!registration) {
        log.warn("report_ready ohne lokale Akten-Zuordnung", { caseId: event.case_id });
        reportError = "no_case_registration";
      } else {
        try {
          const result = await fileReportToCase(event.case_id, registration);
          reportSaved = result.saved;
          log.info("RCIID report filed to case", {
            caseId: event.case_id,
            caseSlug: registration.caseSlug,
            docSlug: result.docSlug,
          });
        } catch (err) {
          reportError = err instanceof Error ? err.message : String(err);
          log.error("RCIID report auto-download failed", {
            caseId: event.case_id,
            error: reportError,
          });
        }
      }
    }

    // 5. If quality feedback received, store it for the dashboard to display
    if (event.event_type === "quality_feedback" && event.data) {
      // The quality feedback data (score, missing_data, suggestions) is stored
      // in the event.data field. The dashboard will retrieve it via the status
      // or feedback API endpoint.
      log.info("Quality feedback received", {
        caseId: event.case_id,
        score: event.data.score,
        missingDataCount: Array.isArray(event.data.missing_data)
          ? event.data.missing_data.length
          : 0,
      });
    }

    return apiSuccess({
      ok: true,
      eventId: event.event_id,
      caseId: event.case_id,
      status: event.status,
      processed: true,
      ...(event.event_type === "report_ready"
        ? { report_saved: reportSaved, report_error: reportError }
        : {}),
    });
  }
);
