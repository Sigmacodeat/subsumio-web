import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import {
  sendFiling,
  exportFilingManually,
  confirmReceipt,
  validateFilingPackage,
  type FilingPackage,
  type FilingReceipt,
} from "@/lib/efiling-architecture";
import { buildXJustizXml, type XJustizMetadata } from "@/lib/xjustiz";
import { resolveFilingTransport } from "@/lib/legal/filing-transport";
import { logAudit } from "@/lib/audit";
import { completeDeadlineAfterFiling } from "@/lib/deadline-guarded-write";
import { hasServerFilingApproval } from "@/lib/bea-filing";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { enforceFileCourtPolicy, hasCourtName, resolveFilingSender } from "@/lib/bea-send-guard";

export const dynamic = "force-dynamic";

const beaSendSchema = z.object({
  filing_slug: z.string().min(1).max(300),
  draft_slug: z.string().min(1).max(300),
  court: z.string().min(1).max(300),
  case_number: z.string().max(200).optional(),
  subject: z.string().min(1).max(500),
  // Ignored: the sender always comes from the firm settings (kept optional
  // so older clients do not fail validation).
  sender_name: z.string().max(300).optional(),
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
  /** Attorney release of a filing whose draft is not verified (reason ≥ 10 chars, audited). */
  verification_override: z.object({ reason: z.string().trim().min(10).max(2000) }).optional(),
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
): Promise<{
  pkg: FilingPackage | null;
  draftSlug: string | null;
  frontmatter: Record<string, unknown>;
} | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(filingSlug)}`, {
      headers: { "Content-Type": "application/json", ...ctx.headers },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const fm = (data.frontmatter ?? {}) as Record<string, unknown>;
    return {
      pkg: (fm.package as FilingPackage) ?? null,
      draftSlug: typeof fm.draft_slug === "string" ? fm.draft_slug : null,
      frontmatter: fm,
    };
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
    // The engine has no PATCH route for pages — merge writes are POST + merge.
    const res = await enginePatchPage(
      ctx.headers,
      { slug: filingSlug, frontmatter: { draft_slug: draftSlug, package: pkg } },
      { timeoutMs: 10_000 }
    );
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
    if (!hasCourtName(body.court)) {
      return apiError("court_missing", "Bitte das empfangende Gericht angeben", 422);
    }

    // ── Verification policy check (file_court) ──
    // Always runs, against the state stored on the draft — never a state the
    // client claims. No stored state = NEEDS_HUMAN_REVIEW (fail-closed).
    const denied = await enforceFileCourtPolicy(
      ctx,
      body.draft_slug,
      body.verification_override?.reason
    );
    if (denied) return denied;

    const config = getMiddlewareConfig();

    // 1. Fetch existing filing package — it must belong to the checked draft.
    const filing = await fetchFilingPackage(ctx, body.filing_slug);
    const existingPkg = filing?.pkg ?? null;
    if (!existingPkg) {
      return apiError("filing_not_found", "Filing-Paket nicht gefunden", 404);
    }
    if (filing?.draftSlug && filing.draftSlug !== body.draft_slug) {
      return apiError(
        "filing_draft_mismatch",
        "Das Filing-Paket gehört zu einem anderen Entwurf",
        409
      );
    }

    const sender = await resolveFilingSender(ctx.brainId, config?.senderId);
    if (sender instanceof Response) return sender;

    // 2. Validate: must be approved
    if (existingPkg.status !== "approved") {
      return apiError("filing_not_approved", "Filing-Paket muss freigegeben sein vor Versand", 422);
    }
    // The release must come from the filing route (lawyer/admin, stamped
    // with the approver) — a status written any other way does not count.
    if (!hasServerFilingApproval(filing?.frontmatter, existingPkg)) {
      return apiError(
        "filing_not_approved",
        "Die Freigabe des Filing-Pakets durch eine Anwältin/einen Anwalt fehlt.",
        422
      );
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
      senderName: sender.name,
      senderRole: "lawyer",
      senderId: sender.id,
      subject: body.subject,
      priority: body.priority,
      deadlineDate: body.deadline_date,
    };

    const xml = buildXJustizXml(existingPkg, metadata);

    // 4. Without middleware nothing is transmitted: the package is marked for
    //    manual submission (export_manual) and stays open until the receipt
    //    is confirmed — never "sending".
    if (!config) {
      const manualPkg = exportFilingManually(existingPkg, ctx.user.email ?? ctx.user.id);
      const saved = await persistFilingPackage(ctx, body.filing_slug, manualPkg, body.draft_slug);
      if (!saved) {
        return apiError(
          "filing_not_saved",
          "Der Status des Filing-Pakets konnte nicht gespeichert werden",
          502
        );
      }
      return apiSuccess({
        filing_id: manualPkg.id,
        status: manualPkg.status,
        xml,
        middleware_configured: false,
        instructions:
          "Keine Middleware konfiguriert. Laden Sie das XJustiz-XML herunter und " +
          "laden Sie es manuell im beA-Portal hoch. Bestätigen Sie danach die Empfangsbestätigung.",
      });
    }

    // 5. Update status to "sending"
    const sendingPkg = sendFiling(existingPkg, `middleware-${Date.now()}`);
    // Without a stored "sending" state the send would leave no trace if the
    // request dies mid-way — do not send then.
    if (!(await persistFilingPackage(ctx, body.filing_slug, sendingPkg, body.draft_slug))) {
      return apiError(
        "engine_write_failed",
        "Der Versandstatus konnte nicht gespeichert werden. Es wurde nichts versendet.",
        502
      );
    }

    // 6. Send via transport adapter (fail-closed without partner config)
    const transport = resolveFilingTransport("beA", {
      endpoint: config.apiUrl,
      apiKey: config.apiKey,
      senderId: config.senderId,
    });

    try {
      const result = await transport.send({
        filingId: sendingPkg.id,
        xml,
        court: body.court,
        caseNumber: body.case_number,
        priority: body.priority,
        deadlineDate: body.deadline_date,
      });
      const receipt: FilingReceipt = result.receipt;

      const finalPkg = confirmReceipt(sendingPkg, receipt);
      const packagePersisted = await persistFilingPackage(
        ctx,
        body.filing_slug,
        finalPkg,
        body.draft_slug
      );

      // 7. Update deadline if linked (best effort — the filing is sent; a
      // failed update is reported as `deadline_updated: false`).
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
        // Sent, but the status record / linked deadline may lag behind.
        package_persisted: packagePersisted,
        deadline_updated: deadlineUpdated,
        deadline_second_check_required: deadlineSecondCheckRequired,
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
