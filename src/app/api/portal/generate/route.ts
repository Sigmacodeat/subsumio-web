import { mayIssuePortalLink, PORTAL_LINK_FORBIDDEN } from "@/lib/portal-link-issue";
import { z } from "zod";
import { signPortalToken, verifyPortalToken } from "@/lib/portal-token";
import { registerPortalLink } from "@/lib/portal-links";
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
      action: "portal.token_generate" as const,
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
    const casePage = (await caseRes.json().catch(() => null)) ?? {};
    const fm = caseFrontmatter(casePage);
    if (fm.status === "archived") {
      return apiError("case_archived", "Die Akte ist archiviert.", 409);
    }
    if (
      !mayIssuePortalLink(
        ctx.user,
        (casePage as { frontmatter?: Record<string, unknown> }).frontmatter
      )
    ) {
      return apiError(PORTAL_LINK_FORBIDDEN.error, PORTAL_LINK_FORBIDDEN.message, 403);
    }
    if (!fm.portal_enabled) {
      return apiError(
        "portal_disabled",
        "Das Mandantenportal ist für diese Akte nicht freigegeben. Bitte zuerst in der Akte aktivieren.",
        409
      );
    }
    const token = await signPortalToken(body.caseSlug, undefined, ctx.brainId);

    // Registry entry (hash only) — so the firm can list and revoke this link
    // later even after the URL has left the screen.
    const issued = await verifyPortalToken(token);
    await registerPortalLink(ctx.headers, body.caseSlug, {
      token,
      created_at: new Date().toISOString(),
      created_by: ctx.user.email,
      expires_at: new Date((issued?.exp ?? 0) * 1000 || Date.now()).toISOString(),
    });

    return Response.json({ token, url: `/portal/${token}` });
  }
);
