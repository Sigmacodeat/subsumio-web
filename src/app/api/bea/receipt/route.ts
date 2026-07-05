import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { broadcastSseEvent } from "@/lib/realtime-bus";

export const dynamic = "force-dynamic";

const receiptSchema = z.object({
  filing_id: z.string().min(1).max(200),
  case_slug: z.string().min(1).max(300),
  receipt_id: z.string().min(1).max(200),
  received_at: z.string().min(1),
  received_by: z.string().max(300).optional(),
  confirmation_code: z.string().min(1).max(200),
  is_success: z.boolean().default(true),
  error_code: z.string().max(100).optional(),
  error_message: z.string().max(1000).optional(),
  raw_response: z.string().max(10_000).optional(),
  deadline_id: z.string().max(200).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: receiptSchema,
    audit: (ctx, body) => ({
      action: "connector.sync" as const,
      entityType: "bea_receipt",
      entityId: body.filing_id,
      details: {
        filingId: body.filing_id,
        confirmationCode: body.confirmation_code,
        isSuccess: body.is_success,
        caseSlug: body.case_slug,
      },
    }),
  },
  async (ctx, body) => {
    // 1. Persist receipt as a brain page
    const slug = `bea/receipt/${body.filing_id}/${Date.now()}`;
    const receiptPage = {
      slug,
      title: `Empfangsbestätigung ${body.confirmation_code}`,
      type: "bea_receipt",
      content: body.error_message
        ? `Fehler: ${body.error_message} (${body.error_code})`
        : `Erfolgreich zugestellt am ${body.received_at}`,
      frontmatter: {
        type: "bea_receipt",
        filing_id: body.filing_id,
        case_slug: body.case_slug,
        receipt_id: body.receipt_id,
        received_at: body.received_at,
        received_by: body.received_by,
        confirmation_code: body.confirmation_code,
        is_success: body.is_success,
        error_code: body.error_code,
        error_message: body.error_message,
        raw_response: body.raw_response,
        deadline_id: body.deadline_id,
        created_at: new Date().toISOString(),
      },
    };

    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify(receiptPage),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return apiError(
        "receipt_save_failed",
        "Empfangsbestätigung konnte nicht gespeichert werden",
        502
      );
    }

    // 2. If deadline-linked, update deadline status to "done"
    if (body.deadline_id && body.is_success) {
      try {
        const deadlineRes = await fetch(
          `${ENGINE_URL}/api/pages/${encodeURIComponent(body.deadline_id)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...ctx.headers },
            body: JSON.stringify({
              slug: body.deadline_id,
              merge: true,
              frontmatter: {
                status: "done",
                done_at: new Date().toISOString(),
                done_by: ctx.user.email,
                filing_receipt_slug: slug,
              },
            }),
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (!deadlineRes.ok) {
          console.error("[bea/receipt] deadline update failed:", deadlineRes.status);
        }
      } catch (err) {
        console.error("[bea/receipt] deadline update error:", err);
      }
    }

    // 3. Broadcast SSE event for real-time UI update
    broadcastSseEvent(ctx.brainId, "bea.receipt.confirmed", {
      filingId: body.filing_id,
      caseSlug: body.case_slug,
      confirmationCode: body.confirmation_code,
      isSuccess: body.is_success,
      receiptSlug: slug,
    });

    // 4. Log audit
    await logAudit("connector.sync", "bea_receipt", {
      entityId: body.filing_id,
      brainId: ctx.brainId,
      details: {
        confirmationCode: body.confirmation_code,
        isSuccess: body.is_success,
        caseSlug: body.case_slug,
        deadlineId: body.deadline_id,
      },
    });

    return apiSuccess({
      ok: true,
      receipt_slug: slug,
      filing_id: body.filing_id,
      confirmation_code: body.confirmation_code,
      deadline_updated: body.deadline_id ? body.is_success : false,
    });
  }
);
