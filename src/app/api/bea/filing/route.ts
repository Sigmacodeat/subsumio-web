import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { GUARD_READ_FAILED, readCurrentPage, rejectionResponse } from "@/lib/page-write-guards";
import {
  approveFiling,
  cancelFiling,
  createFilingPackage,
  submitForApproval,
  type FilingPackage,
} from "@/lib/efiling-architecture";
import { FILING_APPROVAL_FIELD, filingSlugForDraft } from "@/lib/bea-filing";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  draft_slug: z
    .string()
    .min(1)
    .max(300)
    .regex(/^legal\/bea-drafts\//, "draft_slug_invalid"),
  action: z.enum(["create", "submit", "approve", "cancel"]),
  case_number: z.string().max(200).optional(),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Filing packages (beA) change state only here — never through a generic
 * page write. The acting person comes from the session; releasing a package
 * for sending (`approve`) is a lawyer/admin decision, stamped with the
 * approver's id, which the send routes require.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "bea.send" as const,
      entityType: "bea_filing",
      entityId: filingSlugForDraft(body.draft_slug),
      details: { step: body.action },
    }),
  },
  async (ctx, body) => {
    const slug = filingSlugForDraft(body.draft_slug);
    const actor = ctx.user.name || ctx.user.email || ctx.user.id;
    const read = await readCurrentPage(ENGINE_URL, ctx.headers, slug);
    if (read.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    const fm = (read.kind === "found" ? (read.page.frontmatter ?? {}) : {}) as Record<
      string,
      unknown
    >;
    const current = (fm.package as FilingPackage | undefined) ?? null;

    let next: FilingPackage;
    const extra: Record<string, unknown> = {};
    if (body.action === "create") {
      if (current && current.status !== "cancelled") {
        return apiError(
          "filing_exists",
          "Für diesen Entwurf gibt es bereits ein Filing-Paket.",
          409
        );
      }
      next = createFilingPackage({
        case_slug: body.case_number ?? body.draft_slug,
        brain_id: ctx.brainId,
        org_id: ctx.user.orgId ?? ctx.brainId,
        channel: "beA",
        court_case_number: body.case_number,
        created_by: actor,
      });
      // A new package carries no approval.
      extra[FILING_APPROVAL_FIELD] = null;
    } else {
      if (!current) return apiError("filing_not_found", "Filing-Paket nicht gefunden", 404);
      if (body.action === "submit") {
        if (current.status !== "draft") {
          return apiError(
            "filing_state",
            "Nur ein Entwurf kann zur Freigabe vorgelegt werden.",
            409
          );
        }
        next = submitForApproval(current, actor);
      } else if (body.action === "approve") {
        if (!can(ctx.user, "workflow.approve") || ctx.supportSession) {
          return apiError(
            "filing_approve_forbidden",
            "Einreichungen geben nur Anwältinnen/Anwälte oder Administratoren frei.",
            403
          );
        }
        if (current.status !== "pending_approval") {
          return apiError(
            "filing_state",
            "Nur ein vorgelegtes Paket kann freigegeben werden.",
            409
          );
        }
        next = approveFiling(current, actor);
        extra[FILING_APPROVAL_FIELD] = {
          by_id: ctx.user.id,
          by: actor,
          role: ctx.user.role,
          at: next.approved_at,
          package_id: next.id,
        };
      } else {
        if (["sending", "sent", "cancelled"].includes(current.status)) {
          return apiError("filing_state", "Dieses Paket kann nicht mehr verworfen werden.", 409);
        }
        next = cancelFiling(current, actor, body.reason || "Manuell verworfen im Dashboard");
        extra[FILING_APPROVAL_FIELD] = null;
      }
    }

    const res = await enginePatchPage(
      ctx.headers,
      {
        slug,
        title: `Filing-Paket: ${next.court_case_number ?? body.draft_slug}`,
        type: "filing_package",
        frontmatter: { draft_slug: body.draft_slug, package: next, ...extra },
      },
      { timeoutMs: 15_000 }
    );
    if (!res.ok) return apiError("engine_write_failed", "Filing-Paket nicht gespeichert", 502);
    void logAudit("bea.send", "bea_filing", {
      entityId: slug,
      brainId: ctx.brainId,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      details: { step: body.action, status: next.status },
    });
    return apiSuccess({ filing_slug: slug, package: next });
  }
);
