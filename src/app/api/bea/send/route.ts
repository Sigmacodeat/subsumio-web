import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  sendFiling,
  confirmReceipt,
  validateFilingPackage,
  type FilingPackage,
  type FilingReceipt,
} from "@/lib/efiling-architecture";
import { buildXJustizXml, type XJustizMetadata } from "@/lib/xjustiz";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import {
  assertOutputActionAllowed,
  VerificationPolicyError,
  buildPolicyOutput,
  type AttorneyOverride,
} from "@/lib/verification-policy";

export const dynamic = "force-dynamic";

const beaSendSchema = z.object({
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
  documents: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        file_path: z.string().min(1).max(500),
        mime_type: z.string().min(1).max(100),
        size_bytes: z.number().int().min(1),
        file_hash: z.string().min(1).max(128),
        is_main_document: z.boolean().default(false),
      })
    )
    .min(1)
    .max(20),
  verification: z
    .object({
      state: z.enum([
        "VERIFIED",
        "VERIFIED_WITH_WARNINGS",
        "NEEDS_HUMAN_REVIEW",
        "BLOCKED",
        "VERIFIER_ERROR",
      ]),
      content_hash: z.string().length(64),
      receipt_hash: z.string().length(64).optional(),
      override: z
        .object({
          user_id: z.string().min(1),
          reason: z.string().min(10),
          timestamp: z.string().min(1),
          output_hash: z.string().length(64),
        })
        .optional(),
    })
    .optional(),
});

interface MiddlewareConfig {
  apiUrl: string;
  apiKey: string;
  senderId?: string;
}

function getMiddlewareConfig(): MiddlewareConfig | null {
  const apiUrl = process.env.BEA_MIDDLEWARE_URL;
  const apiKey = process.env.BEA_MIDDLEWARE_API_KEY;
  if (!apiUrl || !apiKey) return null;
  return {
    apiUrl,
    apiKey,
    senderId: process.env.BEA_SENDER_ID,
  };
}

async function fetchFilingPackage(
  ctx: { headers: Record<string, string>; brainId: string },
  filingSlug: string
): Promise<FilingPackage | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(filingSlug)}`, {
      headers: { "Content-Type": "application/json", ...ctx.headers },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const fm = (data.frontmatter ?? {}) as Record<string, unknown>;
    return fm.package as FilingPackage;
  } catch {
    return null;
  }
}

async function persistFilingPackage(
  ctx: { headers: Record<string, string>; brainId: string },
  filingSlug: string,
  pkg: FilingPackage,
  draftSlug: string
): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(filingSlug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: filingSlug,
        frontmatter: { draft_slug: draftSlug, package: pkg },
        merge: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: beaSendSchema,
    audit: (ctx, body) => ({
      action: "bea.send" as const,
      entityType: "bea_filing",
      entityId: body.filing_slug,
      details: {
        court: body.court,
        caseNumber: body.case_number,
        documentCount: body.documents.length,
        priority: body.priority,
      },
    }),
  },
  async (ctx, body) => {
    // ── Verification policy check (file_court) ──
    if (body.verification) {
      const output = buildPolicyOutput(
        body.filing_slug,
        body.verification.state,
        body.verification.content_hash,
        { receipt_hash: body.verification.receipt_hash, title: body.subject }
      );
      try {
        await assertOutputActionAllowed(
          output,
          "file_court",
          { user_id: ctx.user.id, user_email: ctx.user.email, brain_id: ctx.brainId },
          body.verification.override as AttorneyOverride | undefined
        );
      } catch (err) {
        if (err instanceof VerificationPolicyError) {
          return apiError("verification_denied", err.decision.reason, 403);
        }
        throw err;
      }
    }

    const config = getMiddlewareConfig();

    // 1. Fetch existing filing package
    const existingPkg = await fetchFilingPackage(ctx, body.filing_slug);
    if (!existingPkg) {
      return apiError("filing_not_found", "Filing-Paket nicht gefunden", 404);
    }

    // 2. Validate: must be approved
    if (existingPkg.status !== "approved") {
      return apiError("filing_not_approved", "Filing-Paket muss freigegeben sein vor Versand", 422);
    }

    const validation = validateFilingPackage(existingPkg);
    if (!validation.valid) {
      return apiError("filing_validation_failed", "Validierung fehlgeschlagen", 422, {
        errors: validation.errors,
      });
    }

    // 3. Build XJustiz XML
    const metadata: XJustizMetadata = {
      court: body.court,
      caseNumber: body.case_number,
      senderName: body.sender_name,
      senderRole: "lawyer",
      senderId: body.sender_id ?? config?.senderId,
      subject: body.subject,
      priority: body.priority,
      deadlineDate: body.deadline_date,
    };

    const xml = buildXJustizXml(existingPkg, metadata);

    // 4. Update status to "sending"
    const sendingPkg = sendFiling(existingPkg, `middleware-${Date.now()}`);
    await persistFilingPackage(ctx, body.filing_slug, sendingPkg, body.draft_slug);

    // 5. Send to middleware (or simulate if no config)
    if (!config) {
      // No middleware configured — return XJustiz XML for manual upload
      // but mark as "sending" so the UI shows it's in progress
      return apiSuccess({
        filing_id: sendingPkg.id,
        status: "sending",
        xml,
        middleware_configured: false,
        instructions:
          "Keine Middleware konfiguriert. Laden Sie das XJustiz-XML herunter und " +
          "laden Sie es manuell im beA-Portal hoch. Bestätigen Sie danach die Empfangsbestätigung.",
      });
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
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!middlewareRes.ok) {
        const errText = await middlewareRes.text().catch(() => "");
        const failedPkg: FilingPackage = {
          ...sendingPkg,
          status: "failed",
          last_error: `Middleware returned ${middlewareRes.status}: ${errText.slice(0, 500)}`,
          updated_at: new Date().toISOString(),
        };
        await persistFilingPackage(ctx, body.filing_slug, failedPkg, body.draft_slug);

        return apiError(
          "middleware_send_failed",
          `Middleware-Versand fehlgeschlagen: HTTP ${middlewareRes.status}`,
          502,
          { error: errText.slice(0, 1000) }
        );
      }

      const middlewareData = await middlewareRes.json();

      // 6. Process receipt
      const receipt: FilingReceipt = {
        receipt_id: middlewareData.receipt_id ?? `receipt-${Date.now()}`,
        received_at: middlewareData.received_at ?? new Date().toISOString(),
        received_by: middlewareData.received_by ?? "middleware",
        confirmation_code: middlewareData.confirmation_code ?? "",
        raw_response: JSON.stringify(middlewareData).slice(0, 5000),
        is_success: middlewareData.is_success !== false,
        error_code: middlewareData.error_code,
        error_message: middlewareData.error_message,
      };

      const finalPkg = confirmReceipt(sendingPkg, receipt);
      await persistFilingPackage(ctx, body.filing_slug, finalPkg, body.draft_slug);

      // 7. Update deadline if linked
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

      // 8. Broadcast SSE event
      broadcastSseEvent(ctx.brainId, "bea.send.completed", {
        filingId: sendingPkg.id,
        status: finalPkg.status,
        confirmationCode: receipt.confirmation_code,
        isSuccess: receipt.is_success,
      });

      // 9. Log audit
      await logAudit("bea.send", "bea_filing", {
        entityId: sendingPkg.id,
        brainId: ctx.brainId,
        details: {
          court: body.court,
          caseNumber: body.case_number,
          confirmationCode: receipt.confirmation_code,
          isSuccess: receipt.is_success,
          middlewareReference: sendingPkg.middleware_reference,
        },
      });

      return apiSuccess({
        filing_id: sendingPkg.id,
        status: finalPkg.status,
        confirmation_code: receipt.confirmation_code,
        is_success: receipt.is_success,
        middleware_reference: sendingPkg.middleware_reference,
        middleware_configured: true,
      });
    } catch (err) {
      const failedPkg: FilingPackage = {
        ...sendingPkg,
        status: "failed",
        last_error: err instanceof Error ? err.message : "Network error",
        updated_at: new Date().toISOString(),
      };
      await persistFilingPackage(ctx, body.filing_slug, failedPkg, body.draft_slug);

      return apiError(
        "middleware_network_error",
        err instanceof Error ? err.message : "Netzwerkfehler beim Middleware-Versand",
        502
      );
    }
  }
);
