import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError } from "@/lib/api-handler";
import { intakeFromPage } from "@/lib/intake";
import { buildCaseFromIntake } from "@/lib/intake-conversion";
import { validateAcceptanceForConversion } from "@/lib/intake-acceptance";
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

    const casePage = buildCaseFromIntake(intakePage, {
      caseSlug: body.case_slug,
      caseNumber: body.case_number,
      title: body.title,
      priority: body.priority,
      portalEnabled: body.portal_enabled,
      convertedBy: ctx.user.email,
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
      const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify(casePage),
        signal: AbortSignal.timeout(15_000),
      });
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
        const listRes = await fetch(`${ENGINE_URL}/api/pages?type=document_request&limit=250`, {
          headers: ctx.headers,
          signal: AbortSignal.timeout(10_000),
        });
        const data = listRes.ok ? await listRes.json().catch(() => []) : [];
        const existing: BrainPage[] = Array.isArray(data)
          ? data
          : (((data as { pages?: BrainPage[] }).pages ??
              (data as { items?: BrainPage[] }).items ??
              []) as BrainPage[]);
        const hasRequest = existing.some(
          (p) =>
            (p.frontmatter as Record<string, unknown> | undefined)?.case_slug === casePage.slug &&
            (p.frontmatter as Record<string, unknown> | undefined)?.source_event_slug === body.slug
        );
        if (!hasRequest) {
          const { buildDocumentRequest } = await import("@/lib/document-requests");
          const request = await buildDocumentRequest({
            brainId: ctx.brainId,
            caseSlug: casePage.slug,
            items: missingDocs,
            channel: "manual",
            status: "draft",
            sourceEventSlug: body.slug,
          });
          const reqRes = await fetch(`${ENGINE_URL}/api/pages`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...ctx.headers },
            body: JSON.stringify({
              slug: request.slug,
              title: request.title,
              type: "document_request",
              content: request.content,
              frontmatter: request.frontmatter,
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (reqRes.ok) documentRequestSlug = request.slug;
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
