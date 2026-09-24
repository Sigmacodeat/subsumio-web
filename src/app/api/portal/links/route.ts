import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { portalLinkStatus, readPortalLinks } from "@/lib/portal-links";

export const dynamic = "force-dynamic";

const querySchema = z.object({ case_slug: z.string().min(1).max(300) });

/**
 * The portal links issued for a matter — hash, issue/expiry dates and status,
 * never the raw token. Lets the firm see outstanding access and revoke a
 * single link without disabling the whole portal.
 */
export const GET = createHandler(
  { action: "brain.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    const caseSlug = query!.case_slug;
    // Read the matter AS THE CALLER (ctx.headers carries their matter scope):
    // a matter behind an ethical wall answers 404 and reveals nothing.
    const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(caseSlug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) return apiError("case_not_found", "Akte nicht gefunden", 404);
    const page = (await res.json().catch(() => null)) as {
      frontmatter?: Record<string, unknown>;
    } | null;
    const links = readPortalLinks(page?.frontmatter).map((l) => ({
      token_hash: l.token_hash,
      created_at: l.created_at,
      created_by: l.created_by,
      expires_at: l.expires_at,
      purpose: l.purpose,
      status: portalLinkStatus(l),
    }));
    links.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return apiSuccess({ links });
  }
);
