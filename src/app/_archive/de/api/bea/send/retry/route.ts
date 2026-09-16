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
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

const retrySchema = z.object({
  filing_slug: z.string().min(1).max(300),
  draft_slug: z.string().min(1).max(300),
  court: z.string().min(1).max(300),
  case_number: z.string().max(200).optional(),
  subject: z.string().min(1).max(500),
  sender_name: z.string().min(1).max(300),
  sender_id: z.string().max(200).optional(),
  priority: z.enum(["normal", "urgent", "fristgebunden"]).default("normal"),
  deadline_date: z.string().optional(),
  deadline_id: z.string().max(200).optional(),
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
    // 1. Fetch filing package
    let existingPkg: FilingPackage | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.filing_slug)}`, {
        headers: { "Content-Type": "application/json", ...ctx.headers },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json();
        const fm = (data.frontmatter ?? {}) as Record<string, unknown>;
        existingPkg = fm.package as FilingPackage;
      }
    } catch {
      // ignore
    }

    if (!existingPkg) {
      return apiError("filing_not_found", "Filing-Paket nicht gefunden", 404);
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

    const metadata: XJustizMetadata = {
      court: body.court,
      caseNumber: body.case_number,
      senderName: body.sender_name,
      senderRole: "lawyer",
      senderId: body.sender_id ?? config.senderId,
      subject: body.subject,
      priority: body.priority,
      deadlineDate: body.deadline_date,
    };

    const xml = buildXJustizXml(retryingPkg, metadata);
    const sendingPkg = sendFiling(retryingPkg, `middleware-retry-${Date.now()}`);

    // Persist sending state
    try {
      await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.filing_slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          slug: body.filing_slug,
          frontmatter: { draft_slug: body.draft_slug, package: sendingPkg },
          merge: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // best-effort
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
        try {
          await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.filing_slug)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...ctx.headers },
            body: JSON.stringify({
              slug: body.filing_slug,
              frontmatter: { draft_slug: body.draft_slug, package: failedPkg },
              merge: true,
            }),
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          // best-effort
        }

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

      try {
        await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.filing_slug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            slug: body.filing_slug,
            frontmatter: { draft_slug: body.draft_slug, package: finalPkg },
            merge: true,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // best-effort
      }

      // Update deadline if linked
      if (body.deadline_id && receipt.is_success) {
        try {
          await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.deadline_id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...ctx.headers },
            body: JSON.stringify({
              slug: body.deadline_id,
              merge: true,
              frontmatter: {
                status: "done",
                done_at: new Date().toISOString(),
                done_by: ctx.user.email,
                filing_id: sendingPkg.id,
              },
            }),
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          // best-effort
        }
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
      });
    } catch (err) {
      const failedPkg: FilingPackage = {
        ...sendingPkg,
        status: "failed",
        last_error: err instanceof Error ? err.message : "Network error on retry",
        updated_at: new Date().toISOString(),
      };
      try {
        await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.filing_slug)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...ctx.headers },
          body: JSON.stringify({
            slug: body.filing_slug,
            frontmatter: { draft_slug: body.draft_slug, package: failedPkg },
            merge: true,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // best-effort
      }

      return apiError(
        "middleware_network_error",
        err instanceof Error ? err.message : "Netzwerkfehler beim Retry",
        502
      );
    }
  }
);
