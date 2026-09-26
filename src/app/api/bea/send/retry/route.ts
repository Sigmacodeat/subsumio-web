import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  retryFiling,
  sendFiling,
  confirmReceipt,
  canRetry,
  type FilingPackage,
  type FilingReceipt,
} from "@/lib/efiling-architecture";
import { buildXJustizXml, type XJustizMetadata } from "@/lib/xjustiz";
import { logAudit } from "@/lib/audit";
import { completeDeadlineAfterFiling } from "@/lib/deadline-guarded-write";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { engineWriteBestEffort } from "@/lib/engine-write";
import { enforceFileCourtPolicy, hasCourtName, resolveFilingSender } from "@/lib/bea-send-guard";

export const dynamic = "force-dynamic";

const retrySchema = z.object({
  filing_slug: z.string().min(1).max(300),
  draft_slug: z.string().min(1).max(300),
  court: z.string().min(1).max(300),
  case_number: z.string().max(200).optional(),
  subject: z.string().min(1).max(500),
  // Ignored: the sender always comes from the firm settings.
  sender_name: z.string().max(300).optional(),
  sender_id: z.string().max(200).optional(),
  priority: z.enum(["normal", "urgent", "fristgebunden"]).default("normal"),
  deadline_date: z.string().optional(),
  deadline_id: z.string().max(200).optional(),
  verification_override: z.object({ reason: z.string().trim().min(10).max(2000) }).optional(),
});

function getMiddlewareConfig() {
  const apiUrl = process.env.BEA_MIDDLEWARE_URL;
  const apiKey = process.env.BEA_MIDDLEWARE_API_KEY;
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey, senderId: process.env.BEA_SENDER_ID };
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: retrySchema,
    audit: (ctx, body) => ({
      action: "bea.retry" as const,
      entityType: "bea_filing",
      entityId: body.filing_slug,
      details: { court: body.court, caseNumber: body.case_number },
    }),
  },
  async (ctx, body) => {
    if (!hasCourtName(body.court)) {
      return apiError("court_missing", "Bitte das empfangende Gericht angeben", 422);
    }
    // Same file_court gate as the first send: the stored draft state decides.
    const denied = await enforceFileCourtPolicy(
      ctx,
      body.draft_slug,
      body.verification_override?.reason
    );
    if (denied) return denied;

    // 1. Fetch filing package
    let existingPkg: FilingPackage | null = null;
    let filingDraftSlug: string | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.filing_slug)}`, {
        headers: { "Content-Type": "application/json", ...ctx.headers },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json();
        const fm = (data.frontmatter ?? {}) as Record<string, unknown>;
        existingPkg = fm.package as FilingPackage;
        filingDraftSlug = typeof fm.draft_slug === "string" ? fm.draft_slug : null;
      }
    } catch {
      // ignore
    }

    if (!existingPkg) {
      return apiError("filing_not_found", "Filing-Paket nicht gefunden", 404);
    }

    if (filingDraftSlug && filingDraftSlug !== body.draft_slug) {
      return apiError(
        "filing_draft_mismatch",
        "Das Filing-Paket gehört zu einem anderen Entwurf",
        409
      );
    }

    // 2. Check retry eligibility
    if (!canRetry(existingPkg)) {
      return apiError(
        "retry_not_allowed",
        "Retry nicht möglich — maximale Versuche erreicht oder Status nicht 'failed'",
        422
      );
    }

    // 3. Transition to retrying
    const retryingPkg = retryFiling(existingPkg);
    if (!retryingPkg) {
      return apiError("retry_failed", "Retry-Übergang fehlgeschlagen", 500);
    }

    // 4. Re-send to middleware
    const config = getMiddlewareConfig();
    if (!config) {
      return apiError("middleware_not_configured", "Middleware nicht konfiguriert", 503);
    }

    const sender = await resolveFilingSender(ctx.brainId, config.senderId);
    if (sender instanceof Response) return sender;

    const metadata: XJustizMetadata = {
      court: body.court,
      caseNumber: body.case_number,
      senderName: sender.name,
      senderRole: "lawyer",
      senderId: sender.id,
      subject: body.subject,
      priority: body.priority,
      deadlineDate: body.deadline_date,
    };

    const xml = buildXJustizXml(retryingPkg, metadata);
    const sendingPkg = sendFiling(retryingPkg, `middleware-retry-${Date.now()}`);

    // Persist sending state
    const sendingPersisted = await engineWriteBestEffort(
      `${ENGINE_URL}/api/pages`,
      {
        // No PATCH route for pages in the engine: merge write via POST.
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug: body.filing_slug,
          frontmatter: { draft_slug: body.draft_slug, package: sendingPkg },
          merge: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
      "beA-Versandstatus"
    );
    // Without a stored "sending" state a retry would leave no trace if the
    // request dies mid-way — do not send then.
    if (!sendingPersisted) {
      return apiError(
        "engine_write_failed",
        "Der Versandstatus konnte nicht gespeichert werden. Es wurde nichts versendet.",
        502
      );
    }

    try {
      const middlewareRes = await fetch(`${config.apiUrl}/api/v1/bea/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          filing_id: sendingPkg.id,
          xml,
          court: body.court,
          case_number: body.case_number,
          priority: body.priority,
          deadline_date: body.deadline_date,
          is_retry: true,
          retry_count: sendingPkg.retry_count,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!middlewareRes.ok) {
        const errText = await middlewareRes.text().catch(() => "");
        const failedPkg: FilingPackage = {
          ...sendingPkg,
          status: "failed",
          last_error: `Retry failed: HTTP ${middlewareRes.status}: ${errText.slice(0, 500)}`,
          updated_at: new Date().toISOString(),
        };
        await engineWriteBestEffort(
          `${ENGINE_URL}/api/pages`,
          {
            // No PATCH route for pages in the engine: merge write via POST.
            method: "POST",
            headers: { "Content-Type": "application/json", ...ctx.headers },
            body: JSON.stringify({
              slug: body.filing_slug,
              frontmatter: { draft_slug: body.draft_slug, package: failedPkg },
              merge: true,
            }),
            signal: AbortSignal.timeout(10_000),
          },
          "beA-Fehlerstatus"
        );

        return apiError(
          "middleware_retry_failed",
          `Retry fehlgeschlagen: HTTP ${middlewareRes.status}`,
          502
        );
      }

      const middlewareData = await middlewareRes.json();
      const receipt: FilingReceipt = {
        receipt_id: middlewareData.receipt_id ?? `receipt-retry-${Date.now()}`,
        received_at: middlewareData.received_at ?? new Date().toISOString(),
        received_by: middlewareData.received_by ?? "middleware",
        confirmation_code: middlewareData.confirmation_code ?? "",
        raw_response: JSON.stringify(middlewareData).slice(0, 5000),
        is_success: middlewareData.is_success !== false,
        error_code: middlewareData.error_code,
        error_message: middlewareData.error_message,
      };

      const finalPkg = confirmReceipt(sendingPkg, receipt);

      const packagePersisted = await engineWriteBestEffort(
        `${ENGINE_URL}/api/pages`,
        {
          // No PATCH route for pages in the engine: merge write via POST.
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            slug: body.filing_slug,
            frontmatter: { draft_slug: body.draft_slug, package: finalPkg },
            merge: true,
          }),
          signal: AbortSignal.timeout(10_000),
        },
        "beA-Versandstatus"
      );

      // Update deadline if linked (best effort — reported as deadline_updated)
      let deadlineUpdated: boolean | null = null;
      let deadlineSecondCheckRequired = false;
      if (body.deadline_id && receipt.is_success) {
        // Same deadline rules as the Fristen view: a Notfrist stays open
        // (filing recorded) until the second check by another person.
        const outcome = await completeDeadlineAfterFiling(
          { headers: ctx.headers, user: ctx.user, brainId: ctx.brainId },
          body.deadline_id,
          { filing_id: sendingPkg.id }
        );
        deadlineUpdated = outcome.updated;
        deadlineSecondCheckRequired = outcome.second_check_required;
      }

      broadcastSseEvent(ctx.brainId, "bea.send.completed", {
        filingId: sendingPkg.id,
        status: finalPkg.status,
        confirmationCode: receipt.confirmation_code,
        isSuccess: receipt.is_success,
        isRetry: true,
      });

      await logAudit("bea.retry", "bea_filing", {
        entityId: sendingPkg.id,
        brainId: ctx.brainId,
        details: {
          retryCount: sendingPkg.retry_count,
          isSuccess: receipt.is_success,
          confirmationCode: receipt.confirmation_code,
        },
      });

      return apiSuccess({
        filing_id: sendingPkg.id,
        status: finalPkg.status,
        confirmation_code: receipt.confirmation_code,
        is_success: receipt.is_success,
        retry_count: sendingPkg.retry_count,
        package_persisted: packagePersisted,
        deadline_updated: deadlineUpdated,
        deadline_second_check_required: deadlineSecondCheckRequired,
      });
    } catch (err) {
      const failedPkg: FilingPackage = {
        ...sendingPkg,
        status: "failed",
        last_error: err instanceof Error ? err.message : "Network error on retry",
        updated_at: new Date().toISOString(),
      };
      await engineWriteBestEffort(
        `${ENGINE_URL}/api/pages`,
        {
          // No PATCH route for pages in the engine: merge write via POST.
          method: "POST",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            slug: body.filing_slug,
            frontmatter: { draft_slug: body.draft_slug, package: failedPkg },
            merge: true,
          }),
          signal: AbortSignal.timeout(10_000),
        },
        "beA-Fehlerstatus"
      );

      return apiError(
        "middleware_network_error",
        err instanceof Error ? err.message : "Netzwerkfehler beim Retry",
        502
      );
    }
  }
);
