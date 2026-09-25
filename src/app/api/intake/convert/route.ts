import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { createHandler, apiError } from "@/lib/api-handler";
import { intakeFromPage } from "@/lib/intake";
import { buildCaseFromIntake } from "@/lib/intake-conversion";
import { validateAcceptanceForConversion } from "@/lib/intake-acceptance";
import {
  canWaiveConflict,
  checkPartiesConflicts,
  conflictCheckRecord,
  intakeParties,
} from "@/lib/conflict-gate";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import type { BrainPage } from "@/lib/types";

import { logger } from "@/lib/logger";
const log = logger("api/intake/convert");

export const dynamic = "force-dynamic";

const convertSchema = z.object({
  slug: z.string().min(1, "slug_required"),
  case_slug: z.string().optional(),
  case_number: z.string().max(100).optional(),
  title: z.string().max(300).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  portal_enabled: z.boolean().default(false),
  send_document_request: z.boolean().default(false),
});

function encodeSlug(slug: string): string {
  return slug.split("/").map(encodeURIComponent).join("/");
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: convertSchema,
    audit: (ctx, body) => ({
      action: "case.create" as const,
      entityType: "intake_request",
      entityId: body.slug,
      details: { converted_by: ctx.user.email, case_slug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(body.slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!getRes.ok) return apiError("intake_not_found", "Intake konnte nicht geladen werden", 404);

    const intakePage = intakeFromPage((await getRes.json()) as BrainPage);
    if (!intakePage) return apiError("not_intake_request", "Die Seite ist kein Intake", 400);

    // No matter without the acceptance checks (conflict, identification, POA).
    const workflow = intakePage.frontmatter.acceptance;
    if (!workflow) {
      return apiError(
        "acceptance_incomplete",
        "Mandatsannahme unvollständig: Kollisionsprüfung und Identitätsprüfung fehlen.",
        422,
        { code: "acceptance_missing" }
      );
    }
    const validation = validateAcceptanceForConversion(workflow);
    if (!validation.ok) {
      return apiError("acceptance_incomplete", validation.error, 422, {
        code: validation.code,
      });
    }
    // "Verified" must be backed by a completed identification record, not a checkbox.
    if (workflow.kyc.required && workflow.kyc.status === "verified") {
      const kycSlug = workflow.kyc.verification_slug;
      const kycRes = kycSlug
        ? await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(kycSlug)}`, {
            headers: ctx.headers,
            signal: AbortSignal.timeout(10_000),
          })
        : null;
      const kyc = kycRes?.ok
        ? ((await kycRes.json()) as { frontmatter?: { status?: string } }).frontmatter
        : null;
      if (kyc?.status !== "verified") {
        return apiError(
          "acceptance_incomplete",
          "Mandatsannahme unvollständig: Die Identitätsprüfung ist nicht abgeschlossen (§ 8b Abs. 7 RAO).",
          422,
          { code: "kyc_not_verified" }
        );
      }
    }

    // Kollisionsprüfung (§ 10 Abs 1 RAO): the stored check must come from the
    // server (real user id), and the check runs AGAIN now — a conflict that
    // appeared after the check, or one no justified waiver covers, blocks.
    const storedCheck = workflow.conflict_check;
    if (!storedCheck.performed_by_id || !storedCheck.performed_at) {
      return apiError(
        "acceptance_incomplete",
        "Mandatsannahme unvollständig: Die Kollisionsprüfung wurde nicht serverseitig durchgeführt. Bitte die Prüfung erneut ausführen.",
        422,
        { code: "conflict_check_not_server_verified" }
      );
    }
    const parties = intakeParties(intakePage.frontmatter as unknown as Record<string, unknown>);
    let conflictOutcome;
    try {
      conflictOutcome = await checkPartiesConflicts(ctx.headers, parties);
    } catch (err) {
      log.error(
        "[intake/convert] conflict check failed:",
        err instanceof Error ? err.message : err
      );
      return apiError(
        "conflict_check_unavailable",
        "Kollisionsprüfung nicht verfügbar. Akte wurde nicht angelegt.",
        503
      );
    }
    if (!conflictOutcome.checked) {
      return apiError(
        "acceptance_incomplete",
        "Mandatsannahme unvollständig: Mandantenname fehlt für die Kollisionsprüfung.",
        422,
        { code: "conflict_check_no_parties" }
      );
    }
    const blocking = conflictOutcome.blocking.length > 0;
    const waiverCovers =
      storedCheck.waived === true &&
      Boolean(storedCheck.waived_by_id) &&
      Boolean(storedCheck.waived_reason?.trim()) &&
      canWaiveConflict(storedCheck.waived_by_role) &&
      conflictOutcome.blocking.every((hit) => (storedCheck.matches ?? []).includes(hit.slug));
    if (blocking && !waiverCovers) {
      return Response.json(
        {
          error: "conflict_detected",
          message:
            "Interessenkonflikt festgestellt, der nicht begründet freigegeben ist. Akte wurde nicht angelegt.",
          conflictWarning: conflictOutcome,
        },
        { status: 409 }
      );
    }

    const casePage = buildCaseFromIntake(intakePage, {
      caseSlug: body.case_slug,
      caseNumber: body.case_number,
      title: body.title,
      priority: body.priority,
      portalEnabled: body.portal_enabled,
      convertedBy: ctx.user.email,
    });
    // The matter carries the conversion-time result, not the stored claim.
    const conflictRecord = conflictCheckRecord(
      conflictOutcome,
      { id: ctx.user.id, email: ctx.user.email, role: ctx.user.role },
      blocking
        ? {
            reason: storedCheck.waived_reason ?? "",
            actor: {
              id: storedCheck.waived_by_id ?? "",
              email: storedCheck.waived_by ?? "",
              role: storedCheck.waived_by_role,
            },
          }
        : undefined
    );
    if (blocking && storedCheck.waived_at) conflictRecord.waived_at = storedCheck.waived_at;
    casePage.mandate_acceptance = {
      ...casePage.mandate_acceptance,
      conflict_check: conflictRecord,
    };
    Object.assign(casePage.frontmatter, {
      mandate_acceptance: casePage.mandate_acceptance,
      conflict_status: blocking ? "conflict_waived" : "conflict_cleared",
      ...(blocking
        ? {
            conflict_waiver_reason: storedCheck.waived_reason,
            conflict_waived_by: storedCheck.waived_by,
            conflict_waived_by_id: storedCheck.waived_by_id,
            conflict_waived_by_role: storedCheck.waived_by_role,
            conflict_waived_at: storedCheck.waived_at,
          }
        : {}),
    });

    // A retry after "case created, intake update failed" must not produce a
    // second matter: a case that was already built from this intake is
    // idempotent — only a foreign slug collision is a 409.
    const checkRes = await fetch(`${ENGINE_URL}/api/pages/${encodeSlug(casePage.slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    let caseAlreadyCreated = false;
    if (checkRes.ok) {
      const existing = (await checkRes.json().catch(() => ({}))) as {
        frontmatter?: { source_intake_slug?: string };
      };
      if (existing.frontmatter?.source_intake_slug === body.slug) {
        caseAlreadyCreated = true;
      } else {
        return apiError(
          "case_slug_exists",
          "Eine Akte mit diesem Slug existiert bereits. Bitte einen anderen Slug oder Aktenzeichen verwenden.",
          409
        );
      }
    }

    if (!caseAlreadyCreated) {
      // Paket C5 ("Akte sicher anlegen") replaces this direct engine write.
      // The conflict gate above must stay BEFORE that call and hand over
      // `casePage.frontmatter` (conflict_status + mandate_acceptance) as-is.
      // Create-only: a matter written at this slug since the check above is
      // refused by the engine, never replaced.
      const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({ ...casePage, if_absent: true }),
        signal: AbortSignal.timeout(15_000),
      });
      if (createRes.status === 409) {
        return apiError(
          "case_slug_exists",
          "Eine Akte mit diesem Slug existiert bereits. Bitte einen anderen Slug oder Aktenzeichen verwenden.",
          409
        );
      }
      if (!createRes.ok) {
        const message = await createRes.text().catch(() => "");
        log.error("[intake/convert] case create failed:", createRes.status, message);
        return apiError("case_create_failed", "Akte konnte nicht erstellt werden", 502);
      }
    }

    const now = new Date().toISOString();
    const updateRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        slug: body.slug,
        title: intakePage.title,
        type: "intake_request",
        merge: true,
        frontmatter: {
          status: "converted",
          converted_case_slug: casePage.slug,
          updated_at: now,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!updateRes.ok)
      return apiError("intake_update_failed", "Akte erstellt, Intake aber nicht aktualisiert", 502);

    // Missing documents noted at intake become a real document_request draft
    // (visible in cockpit and sendable to the client), not just inert case
    // tasks. Best-effort: the case must never fail because of this.
    const missingDocs = intakePage.frontmatter.missing_documents ?? [];
    let documentRequestSlug: string | undefined;
    if (missingDocs.length > 0) {
      try {
        // Cursor-paginated: a single /api/pages call is capped at 100 rows —
        // a dedupe check over a truncated list would create a second request.
        const existing = (await listEnginePages(ctx.headers, "document_request", 10_000, {
          timeoutMs: 10_000,
        })) as unknown as BrainPage[];
        const existingRequest = existing.find(
          (p) =>
            (p.frontmatter as Record<string, unknown> | undefined)?.case_slug === casePage.slug &&
            (p.frontmatter as Record<string, unknown> | undefined)?.source_event_slug === body.slug
        );
        if (existingRequest) {
          documentRequestSlug = existingRequest.slug;
          // Retry mit Senden-Wunsch: vorhandenen Entwurf als gesendet markieren.
          if (body.send_document_request) {
            await fetch(`${ENGINE_URL}/api/pages`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...ctx.headers },
              body: JSON.stringify({
                slug: existingRequest.slug,
                title: "Dokumentenanfrage Update",
                type: "document_request",
                merge: true,
                frontmatter: { status: "sent", sent_at: now, updated_at: now },
              }),
              signal: AbortSignal.timeout(15_000),
            });
          }
        } else {
          const { buildDocumentRequest } = await import("@/lib/document-requests");
          const request = await buildDocumentRequest({
            brainId: ctx.brainId,
            caseSlug: casePage.slug,
            items: missingDocs,
            channel: "manual",
            status: body.send_document_request ? "sent" : "draft",
            sourceEventSlug: body.slug,
            includePortalLink: body.portal_enabled,
          });
          const reqRes = await fetch(`${ENGINE_URL}/api/pages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...ctx.headers },
            body: JSON.stringify({
              slug: request.slug,
              title: request.title,
              type: "document_request",
              content: request.content,
              frontmatter: {
                ...request.frontmatter,
                ...(body.send_document_request ? { sent_at: now } : {}),
              },
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (reqRes.ok) documentRequestSlug = request.slug;
        }
        // Same notification the PATCH route emits on status → sent.
        if (body.send_document_request && documentRequestSlug) {
          try {
            const { createDocumentRequestNotification } = await import("@/lib/comments");
            await createDocumentRequestNotification({
              userId: ctx.user.id,
              brainId: ctx.brainId,
              caseSlug: casePage.slug,
              caseTitle: casePage.title,
              requestSlug: documentRequestSlug,
              itemCount: missingDocs.length,
              isReminder: false,
            });
          } catch {
            // notification is best-effort
          }
        }
      } catch (err) {
        log.warn("document_request from intake missing_documents failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    broadcastSseEvent(ctx.brainId, "case.created", {
      slug: casePage.slug,
      intakeSlug: body.slug,
      by: ctx.user.email,
    });
    broadcastSseEvent(ctx.brainId, "intake.updated", {
      slug: body.slug,
      convertedCaseSlug: casePage.slug,
      by: ctx.user.email,
    });

    return Response.json({
      ok: true,
      case: casePage,
      intake_slug: body.slug,
      document_request_slug: documentRequestSlug,
    });
  }
);
