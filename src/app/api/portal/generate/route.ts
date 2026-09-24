import { z } from "zod";
import { signPortalToken } from "@/lib/portal-token";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { caseFrontmatter } from "@/lib/legal-types";

export const dynamic = "force-dynamic";

const generateSchema = z.object({
  caseSlug: z.string().min(1, "caseSlug_required").max(500),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: generateSchema,
    audit: (_ctx, body) => ({
      action: "case.update" as const,
      entityType: "portal_token",
      entityId: body.caseSlug,
      details: { action: "generate" },
    }),
  },
  async (ctx, body, _query, _req) => {
    // Read the matter AS THE CALLER (ctx.headers carries their matter scope),
    // so ethical walls apply: a matter the caller cannot open answers 404 and
    // no portal link is signed for it. Same gate as portal/send-link.
    const caseRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.caseSlug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!caseRes?.ok) {
      return apiError("case_not_found", "Akte nicht gefunden", 404);
    }
    const fm = caseFrontmatter((await caseRes.json().catch(() => null)) ?? {});
    if (fm.status === "archived") {
      return apiError("case_archived", "Die Akte ist archiviert.", 409);
    }
    if (!fm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Das Mandantenportal ist für diese Akte nicht freigegeben. Bitte zuerst in der Akte aktivieren.",
        409
      );
    }
    const token = await signPortalToken(body.caseSlug, undefined, ctx.brainId);
    return Response.json({ token, url: `/portal/${token}` });
  }
);
